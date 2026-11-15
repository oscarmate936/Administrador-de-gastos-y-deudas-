import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { BaseDeDatos, CATEGORIAS_INICIALES } from '../db';
import { descifrar } from './cripto';
import { crearRespaldo, leerRespaldo, restaurarRespaldo, sobreDeRespaldo, textoRespaldo } from './respaldo';

let contador = 0;
const nuevaBase = () => new BaseDeDatos(`prueba-${++contador}`);

describe('respaldo', () => {
  it('una base nueva arranca con las categorías iniciales', async () => {
    const db = nuevaBase();
    expect(await db.categorias.count()).toBe(CATEGORIAS_INICIALES.length + 1);
  });

  it('exportar y restaurar en otro dispositivo conserva los datos', async () => {
    const origen = nuevaBase();
    await origen.movimientos.bulkAdd([
      { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 50000, fecha: '2026-11-05', nota: 'Quincena', creadoEn: 1 },
      { id: 'b', tipo: 'gasto', montoCentavos: 1250, fecha: '2026-11-06', categoriaId: 'comida', nota: '', creadoEn: 2 },
    ]);
    await origen.categorias.add({ id: 'x', nombre: 'Mascotas', emoji: '🐶', color: '#123456', orden: 9 });
    await origen.tarjetas.add({
      id: 't1', nombre: 'Visa', banco: 'Banco Agrícola', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
      saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-13', color: '#0f6b54', creadoEn: 3,
      ultimos4: '5678', tasaAnual: 39.9,
      ultimoEstado: { fechaCorte: '2026-11-06', fechaLimite: '2026-12-01', pagoContadoCentavos: 10000, pagoMinimoCentavos: 900, saldoCentavos: 30000 },
    });
    await origen.prestamos.add({
      id: 'p1', nombre: 'Personal', acreedor: 'Davivienda', montoOriginalCentavos: 200000, saldoInicialCentavos: 100000,
      tasaAnual: 12.5, cuotaCentavos: 10000, cargosCentavos: 750, desgloseCuota: { fecha: '2026-11-30', capitalCentavos: 8000 }, primeraCuota: '2026-11-30', creadoEn: 4,
    });
    await origen.movimientos.bulkAdd([
      { id: 'c', tipo: 'gasto', montoCentavos: 12000, fecha: '2026-11-21', categoriaId: 'super', tarjetaId: 't1', cuotas: 3, nota: '', creadoEn: 5 },
      { id: 'd', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-14', tarjetaId: 't1', nota: '', creadoEn: 6 },
      { id: 'e', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-30', prestamoId: 'p1', capitalCentavos: 8958, esExtra: false, nota: '', creadoEn: 7 },
    ]);

    const texto = JSON.stringify(await crearRespaldo(origen));

    const destino = nuevaBase();
    await destino.movimientos.add({ id: 'viejo', tipo: 'gasto', montoCentavos: 1, fecha: '2026-01-01', nota: '', creadoEn: 0 });
    await restaurarRespaldo(destino, leerRespaldo(texto));

    expect(await destino.movimientos.toArray()).toEqual(await origen.movimientos.toArray());
    expect(await destino.categorias.toArray()).toEqual(await origen.categorias.toArray());
    expect(await destino.tarjetas.toArray()).toEqual(await origen.tarjetas.toArray());
    expect(await destino.prestamos.toArray()).toEqual(await origen.prestamos.toArray());
  });

  it('la versión 3 lleva ajustes, historial y recurrentes, pero no el bloqueo del dispositivo', async () => {
    const origen = nuevaBase();
    await origen.categorias.update('comida', { limiteCentavos: 15000 });
    await origen.ajustes.bulkAdd([
      { id: 'plan', valor: { metodo: 'bola', pagoMensualCentavos: 30000 } },
      { id: 'bloqueo', valor: { activo: true, pinHash: 'x', sal: 'y', huella: true, esperaMinutos: 1 } },
      // La contraseña del respaldo automático nunca viaja dentro de un respaldo.
      { id: 'respaldoAuto', valor: { activo: true, clave: 'secreta', archivo: 'a.json' } },
    ]);
    await origen.historial.add({
      mes: '2026-11', fecha: '2026-11-14', disponibleCentavos: -500, deudaTotalCentavos: 1000,
      deudas: [{ tipo: 'tarjeta', id: 't1', nombre: 'Visa', saldoCentavos: 1000 }],
    });
    await origen.recurrentes.add({
      id: 'r1', tipo: 'gasto', montoCentavos: 2500, categoriaId: 'servicios', nota: 'Internet', dia: 5,
      proxima: '2026-12-05', activo: true, creadoEn: 1,
    });
    const respaldo = leerRespaldo(await textoRespaldo(await crearRespaldo(origen)));
    expect(respaldo.ajustes.map((a) => a.id)).toEqual(['plan']);

    const destino = nuevaBase();
    await destino.ajustes.put({ id: 'bloqueo', valor: { activo: true, pinHash: 'local', sal: 's', huella: false, esperaMinutos: 5 } });
    await restaurarRespaldo(destino, respaldo);
    expect((await destino.categorias.get('comida'))?.limiteCentavos).toBe(15000);
    expect(await destino.historial.toArray()).toEqual(await origen.historial.toArray());
    expect(await destino.recurrentes.toArray()).toEqual(await origen.recurrentes.toArray());
    expect((await destino.ajustes.get('plan'))?.valor).toEqual({ metodo: 'bola', pagoMensualCentavos: 30000 });
    expect((await destino.ajustes.get('bloqueo'))?.valor).toMatchObject({ pinHash: 'local' });
    expect(await destino.ajustes.get('respaldoAuto')).toBeUndefined();
    expect(JSON.stringify(respaldo)).not.toContain('secreta');
  });

  it('un dato repetido en el archivo no impide restaurarlo', async () => {
    const origen = nuevaBase();
    const texto = await textoRespaldo(await crearRespaldo(origen));
    const datos = JSON.parse(texto);
    const m = { id: 'x', tipo: 'gasto', montoCentavos: 100, fecha: '2026-11-01', nota: 'a', creadoEn: 1 };
    datos.movimientos = [m, { ...m, nota: 'b' }];
    const respaldo = leerRespaldo(JSON.stringify(datos));
    expect(respaldo.movimientos.map((x) => x.nota)).toEqual(['b']);
    const destino = nuevaBase();
    await restaurarRespaldo(destino, respaldo);
    expect(await destino.movimientos.count()).toBe(1);
  });

  it('un respaldo con contraseña se reconoce y se abre con ella', async () => {
    const db = nuevaBase();
    const texto = await textoRespaldo(await crearRespaldo(db), 'mi clave');
    expect(() => leerRespaldo(texto)).toThrow('protegido con contraseña');
    const sobre = sobreDeRespaldo(texto)!;
    expect(sobre).not.toBeNull();
    expect(leerRespaldo(await descifrar(sobre, 'mi clave')).categorias.length).toBeGreaterThan(0);
    expect(sobreDeRespaldo('{"app":"mis-finanzas","version":3}')).toBeNull();
  });

  it('restaura un respaldo de la versión 1, sin tarjetas ni préstamos', async () => {
    const v1 = JSON.stringify({
      app: 'mis-finanzas',
      version: 1,
      movimientos: [{ id: 'a', tipo: 'gasto', montoCentavos: 100, fecha: '2026-11-05', nota: '', creadoEn: 1 }],
      categorias: [{ id: 'comida', nombre: 'Comida', emoji: '🍽️', color: '#e07a3f', orden: 1 }],
    });
    const db = nuevaBase();
    await db.tarjetas.add({
      id: 'vieja', nombre: 'X', banco: '', limiteCentavos: 1, diaCorte: 1, diaPago: 1,
      saldoInicialCentavos: 0, pendienteInicialCentavos: 0, fechaSaldo: '2026-01-01', color: '#000', creadoEn: 0,
    });
    await restaurarRespaldo(db, leerRespaldo(v1));
    expect(await db.movimientos.count()).toBe(1);
    expect(await db.tarjetas.count()).toBe(0);
  });

  it('al pasar a la versión 3 la fecha de saldo de las tarjetas se mueve un día atrás', async () => {
    const nombre = `prueba-${++contador}`;
    const v2 = new Dexie(nombre);
    v2.version(2).stores({ movimientos: 'id, fecha, tipo, tarjetaId, prestamoId', categorias: 'id, orden', tarjetas: 'id', prestamos: 'id' });
    await v2.table('tarjetas').add({
      id: 't', nombre: 'X', banco: '', limiteCentavos: 1, diaCorte: 1, diaPago: 1,
      saldoInicialCentavos: 0, pendienteInicialCentavos: 0, fechaSaldo: '2026-11-01', color: '#000', creadoEn: 0,
    });
    v2.close();
    const nueva = new BaseDeDatos(nombre);
    expect((await nueva.tarjetas.get('t'))?.fechaSaldo).toBe('2026-10-31');
  });

  it('una base creada con la versión 1 conserva sus datos al actualizar', async () => {
    const nombre = `prueba-${++contador}`;
    const vieja = new Dexie(nombre);
    vieja.version(1).stores({ movimientos: 'id, fecha, tipo', categorias: 'id, orden' });
    await vieja.table('movimientos').add({ id: 'a', tipo: 'gasto', montoCentavos: 500, fecha: '2026-11-05', nota: '', creadoEn: 1 });
    await vieja.table('categorias').bulkAdd(CATEGORIAS_INICIALES);
    vieja.close();

    const nueva = new BaseDeDatos(nombre);
    expect(await nueva.movimientos.count()).toBe(1);
    expect(await nueva.categorias.get('intereses')).toBeDefined();
    expect(await nueva.tarjetas.count()).toBe(0);
  });

  it('rechaza archivos que no son respaldos', () => {
    expect(() => leerRespaldo('hola')).toThrow('no es un respaldo válido');
    expect(() => leerRespaldo('{"app":"otra"}')).toThrow('no es un respaldo de Mis Finanzas');
    expect(() => leerRespaldo('{"app":"mis-finanzas","version":4}')).toThrow('versión más nueva');
    expect(() => leerRespaldo('{"app":"mis-finanzas","version":1}')).toThrow('incompleto');
  });

  it('rechaza movimientos dañados sin tocar los datos', () => {
    const base = { app: 'mis-finanzas', version: 1, categorias: [] };
    const malo = (m: object) => JSON.stringify({ ...base, movimientos: [m] });
    const bueno = { id: 'a', tipo: 'gasto', montoCentavos: 100, fecha: '2026-11-05' };
    expect(() => leerRespaldo(malo({ ...bueno, montoCentavos: 10.5 }))).toThrow('montoCentavos');
    expect(() => leerRespaldo(malo({ ...bueno, montoCentavos: -1 }))).toThrow('montoCentavos');
    expect(() => leerRespaldo(malo({ ...bueno, fecha: '2026-02-30' }))).toThrow('fecha');
    expect(() => leerRespaldo(malo({ ...bueno, tipo: 'otro' }))).toThrow('tipo');
    expect(() => leerRespaldo(malo({ ...bueno, tipo: 'pago' }))).toThrow('destino del pago');
    expect(() => leerRespaldo(malo({ ...bueno, montoCentavos: 0 }))).toThrow('montoCentavos');
    expect(leerRespaldo(malo(bueno)).movimientos[0].nota).toBe('');
  });
});
