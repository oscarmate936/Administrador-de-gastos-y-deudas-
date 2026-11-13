import { describe, expect, it } from 'vitest';
import { BaseDeDatos, CATEGORIAS_INICIALES } from '../db';
import { crearRespaldo, leerRespaldo, restaurarRespaldo } from './respaldo';

let contador = 0;
const nuevaBase = () => new BaseDeDatos(`prueba-${++contador}`);

describe('respaldo', () => {
  it('una base nueva arranca con las categorías iniciales', async () => {
    const db = nuevaBase();
    expect(await db.categorias.count()).toBe(CATEGORIAS_INICIALES.length);
  });

  it('exportar y restaurar en otro dispositivo conserva los datos', async () => {
    const origen = nuevaBase();
    await origen.movimientos.bulkAdd([
      { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 50000, fecha: '2026-11-05', nota: 'Quincena', creadoEn: 1 },
      { id: 'b', tipo: 'gasto', montoCentavos: 1250, fecha: '2026-11-06', categoriaId: 'comida', nota: '', creadoEn: 2 },
    ]);
    await origen.categorias.add({ id: 'x', nombre: 'Mascotas', emoji: '🐶', color: '#123456', orden: 9 });

    const texto = JSON.stringify(await crearRespaldo(origen));

    const destino = nuevaBase();
    await destino.movimientos.add({ id: 'viejo', tipo: 'gasto', montoCentavos: 1, fecha: '2026-01-01', nota: '', creadoEn: 0 });
    await restaurarRespaldo(destino, leerRespaldo(texto));

    expect(await destino.movimientos.toArray()).toEqual(await origen.movimientos.toArray());
    expect(await destino.categorias.toArray()).toEqual(await origen.categorias.toArray());
  });

  it('rechaza archivos que no son respaldos', () => {
    expect(() => leerRespaldo('hola')).toThrow('no es un respaldo válido');
    expect(() => leerRespaldo('{"app":"otra"}')).toThrow('no es un respaldo de Mis Finanzas');
    expect(() => leerRespaldo('{"app":"mis-finanzas","version":2}')).toThrow('versión más nueva');
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
    expect(leerRespaldo(malo(bueno)).movimientos[0].nota).toBe('');
  });
});
