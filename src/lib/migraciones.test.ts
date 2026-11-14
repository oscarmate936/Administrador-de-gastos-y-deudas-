import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { BaseDeDatos } from '../db';
import { crearRespaldo, leerRespaldo, textoRespaldo } from './respaldo';

describe('actualizar desde versiones anteriores', () => {
  it('una base de la versión 3 (app 0.3) pasa a la actual sin perder datos', async () => {
    const nombre = 'migracion-v3';
    const vieja = new Dexie(nombre);
    vieja.version(3).stores({ movimientos: 'id, fecha, tipo, tarjetaId, prestamoId', categorias: 'id, orden', tarjetas: 'id', prestamos: 'id' });
    await vieja.table('categorias').add({ id: 'comida', nombre: 'Comida', emoji: '🍽️', color: '#e07a3f', orden: 1 });
    await vieja.table('tarjetas').add({
      id: 't', nombre: 'Visa', banco: 'Banco Agrícola', limiteCentavos: 60000, diaCorte: 6, diaPago: 1,
      saldoInicialCentavos: 38113, pendienteInicialCentavos: 38113, fechaSaldo: '2026-11-06', color: '#000', creadoEn: 1,
    });
    await vieja.table('prestamos').add({
      id: 'p', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000, primeraCuota: '2026-11-30', creadoEn: 2,
    });
    await vieja.table('movimientos').bulkAdd([
      { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 90000, fecha: '2026-11-01', nota: '', creadoEn: 1 },
      { id: 'b', tipo: 'gasto', montoCentavos: 1250, fecha: '2026-11-10', categoriaId: 'comida', tarjetaId: 't', nota: 'Almuerzo', creadoEn: 2 },
    ]);
    vieja.close();

    const nueva = new BaseDeDatos(nombre);
    expect(nueva.verno).toBe(4);
    expect(await nueva.movimientos.count()).toBe(2);
    expect((await nueva.tarjetas.get('t'))?.fechaSaldo).toBe('2026-11-06');
    expect(await nueva.prestamos.count()).toBe(1);
    // Las tablas nuevas existen y están vacías.
    expect(await nueva.ajustes.count()).toBe(0);
    expect(await nueva.historial.count()).toBe(0);
    expect(await nueva.recurrentes.count()).toBe(0);
    // Y se puede respaldar y volver a leer.
    const r = leerRespaldo(await textoRespaldo(await crearRespaldo(nueva)));
    expect(r.movimientos).toHaveLength(2);
    expect(r.tarjetas[0].nombre).toBe('Visa');
  });
});
