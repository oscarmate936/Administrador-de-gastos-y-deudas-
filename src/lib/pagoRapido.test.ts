import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta, interesPorDias } from './deudas';
import { esClavePago, idPagoRapido, pagoRapido } from './pagoRapido';

const tarjeta: Tarjeta = {
  id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
  saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-12', color: '#000', creadoEn: 0,
};
const prestamo: Prestamo = {
  id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000,
  primeraCuota: '2026-11-30', creadoEn: 0,
};
const datos = (movimientos: Movimiento[] = [], p: Prestamo = prestamo) => ({ tarjetas: [tarjeta], prestamos: [p], movimientos });

describe('«Ya pagué» desde un recordatorio', () => {
  it('registra el pago de contado de la tarjeta', () => {
    const r = pagoRapido(datos(), { tipo: 'tarjeta', id: 't1', fecha: '2026-11-15' }, '2026-11-14', 1);
    expect(r.ok && r.movimiento).toEqual({
      id: 'aviso-tarjeta-t1-2026-11-15', tipo: 'pago', fecha: '2026-11-14', nota: '', creadoEn: 1, montoCentavos: 10000, tarjetaId: 't1',
    });
    // Después del pago ya no queda nada pendiente.
    if (r.ok) expect(estadoTarjeta(tarjeta, [r.movimiento], '2026-11-14').pendienteCentavos).toBe(0);
  });

  it('registra la cuota con el capital por días hasta el día del pago', () => {
    const r = pagoRapido(datos(), { tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' }, '2026-11-30');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movimiento.montoCentavos).toBe(10000);
    expect(r.movimiento.capitalCentavos).toBe(10000 - interesPorDias(100000, 12, 31));
    expect(estadoPrestamo(prestamo, [r.movimiento], '2026-12-01').proximaFecha).toBe('2026-12-30');
  });

  it('usa el desglose del banco cuando lo hay', () => {
    const conDesglose = { ...prestamo, desgloseCuota: { fecha: '2026-11-30', capitalCentavos: 8888 } };
    const r = pagoRapido(datos([], conDesglose), { tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' }, '2026-11-29');
    expect(r.ok && r.movimiento.capitalCentavos).toBe(8888);
  });

  it('no duplica un pago que ya está registrado', () => {
    const clave = { tipo: 'tarjeta' as const, id: 't1', fecha: '2026-11-15' };
    const hecho: Movimiento = { id: 'x', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-13', tarjetaId: 't1', nota: '', creadoEn: 1 };
    expect(pagoRapido(datos([hecho]), clave, '2026-11-14')).toEqual({ ok: false, motivo: 'El pago de Visa ya está registrado.' });
    const mismo: Movimiento = { ...hecho, id: idPagoRapido(clave), montoCentavos: 100 };
    expect(pagoRapido(datos([mismo]), clave, '2026-11-14').ok).toBe(false);
    // Una cuota ya pagada (la próxima es otra) tampoco se vuelve a registrar.
    const cuota: Movimiento = { id: 'c', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-30', prestamoId: 'p1', capitalCentavos: 9000, nota: '', creadoEn: 1 };
    expect(pagoRapido(datos([cuota]), { tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' }, '2026-12-01')).toEqual({
      ok: false,
      motivo: 'La cuota de Personal ya está registrada.',
    });
    expect(pagoRapido(datos(), { tipo: 'prestamo', id: 'otro', fecha: '2026-11-30' }, '2026-11-30').ok).toBe(false);
  });

  it('si falta una cuota anterior, lo dice y pide abrir el pago', () => {
    expect(pagoRapido(datos(), { tipo: 'prestamo', id: 'p1', fecha: '2026-12-30' }, '2026-12-30')).toEqual({
      ok: false,
      motivo: 'Falta la cuota de Personal del 30 nov.',
      abrirPago: true,
    });
  });

  it('«Pagué el mínimo» registra el mínimo del estado de cuenta', () => {
    const conMinimo: Tarjeta = {
      ...tarjeta,
      fechaSaldo: '2026-10-20',
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-15', pagoContadoCentavos: 10000, pagoMinimoCentavos: 2500, saldoCentavos: 30000 },
    };
    const d = { tarjetas: [conMinimo], prestamos: [], movimientos: [] };
    const r = pagoRapido(d, { tipo: 'tarjeta', id: 't1', fecha: '2026-11-15', modo: 'minimo' }, '2026-11-14');
    expect(r.ok && r.movimiento.montoCentavos).toBe(2500);
    // Sin mínimo conocido, pide escribir el monto.
    expect(pagoRapido(datos(), { tipo: 'tarjeta', id: 't1', fecha: '2026-11-15', modo: 'minimo' }, '2026-11-14')).toMatchObject({ ok: false, abrirPago: true });
  });

  it('el pago de la cuota guarda la parte de seguros', () => {
    const conSeguro = { ...prestamo, cargosCentavos: 500, cargosBaseCentavos: 100000 };
    const r = pagoRapido(datos([], conSeguro), { tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' }, '2026-11-30');
    expect(r.ok && r.movimiento.cargosCentavos).toBe(500);
    expect(r.ok && r.movimiento.capitalCentavos).toBe(10000 - interesPorDias(100000, 12, 31) - 500);
  });

  it('solo acepta claves de pago bien formadas', () => {
    expect(esClavePago({ tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' })).toBe(true);
    expect(esClavePago({ tipo: 'gasto', id: 'p1', fecha: '2026-11-30' })).toBe(false);
    expect(esClavePago({ tipo: 'tarjeta', id: 't1', fecha: 'mañana' })).toBe(false);
    expect(esClavePago(null)).toBe(false);
    expect(esClavePago({ tipo: 'tarjeta', id: 't1', fecha: '2026-11-15', modo: 'minimo' })).toBe(true);
    expect(esClavePago({ tipo: 'tarjeta', id: 't1', fecha: '2026-11-15', modo: 'todo' })).toBe(false);
  });
});
