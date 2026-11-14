import { describe, expect, it } from 'vitest';
import { BaseDeDatos, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { fotoDeHoy, guardarFoto } from './historial';

const tarjeta: Tarjeta = {
  id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
  saldoInicialCentavos: 30000, pendienteInicialCentavos: 0, fechaSaldo: '2026-11-01', color: '#000', creadoEn: 0,
};
const prestamo: Prestamo = {
  id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000,
  primeraCuota: '2026-11-30', creadoEn: 0,
};
const movimientos: Movimiento[] = [
  { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 50000, fecha: '2026-11-02', nota: '', creadoEn: 1 },
  { id: 'b', tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-03', tarjetaId: 't1', nota: '', creadoEn: 2 },
  { id: 'c', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-04', prestamoId: 'p1', capitalCentavos: 9000, nota: '', creadoEn: 3 },
];

describe('historial de saldos', () => {
  it('toma la foto de deudas y disponible', () => {
    const f = fotoDeHoy({ movimientos, tarjetas: [tarjeta], prestamos: [prestamo] }, '2026-11-14');
    expect(f).toEqual({
      mes: '2026-11',
      fecha: '2026-11-14',
      disponibleCentavos: 40000,
      deudaTotalCentavos: 35000 + 91000,
      deudas: [
        { tipo: 'tarjeta', id: 't1', nombre: 'Visa', saldoCentavos: 35000 },
        { tipo: 'prestamo', id: 'p1', nombre: 'Personal', saldoCentavos: 91000 },
      ],
    });
  });

  it('guarda una foto por mes con los últimos valores', async () => {
    const db = new BaseDeDatos('historial-prueba');
    const datos = { movimientos, tarjetas: [tarjeta], prestamos: [prestamo] };
    await guardarFoto(db, fotoDeHoy(datos, '2026-11-14'));
    await guardarFoto(db, fotoDeHoy(datos, '2026-11-15'));
    expect((await db.historial.get('2026-11'))?.fecha).toBe('2026-11-14');
    await guardarFoto(db, fotoDeHoy({ ...datos, movimientos: movimientos.slice(0, 2) }, '2026-11-16'));
    expect((await db.historial.get('2026-11'))?.fecha).toBe('2026-11-16');
    await guardarFoto(db, fotoDeHoy(datos, '2026-12-01'));
    expect(await db.historial.count()).toBe(2);
  });
});
