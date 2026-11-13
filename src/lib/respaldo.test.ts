import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { BaseDeDatos, CATEGORIAS_INICIALES } from '../db';
import { crearRespaldo, leerRespaldo, restaurarRespaldo } from './respaldo';

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
    });
    await origen.prestamos.add({
      id: 'p1', nombre: 'Personal', acreedor: 'Davivienda', montoOriginalCentavos: 200000, saldoInicialCentavos: 100000,
      tasaAnual: 12.5, cuotaCentavos: 10000, primeraCuota: '2026-11-30', creadoEn: 4,
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
    expect(() => leerRespaldo('{"app":"mis-finanzas","version":3}')).toThrow('versión más nueva');
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
