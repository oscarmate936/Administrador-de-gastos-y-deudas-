import { describe, expect, it } from 'vitest';
import type { Movimiento } from '../db';
import { resumenWidget } from './widget';

const pago: Movimiento = { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 90000, fecha: '2026-11-01', nota: '', creadoEn: 1 };
const gasto: Movimiento = { id: 'b', tipo: 'gasto', montoCentavos: 15000, fecha: '2026-11-05', nota: '', creadoEn: 2 };

describe('resumenWidget', () => {
  it('muestra el disponible, lo que toca por día y cuándo se actualizó', () => {
    const r = resumenWidget({ movimientos: [pago, gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 9, 41));
    expect(r.etiqueta).toBe('Disponible');
    expect(r.monto).toBe('$750.00');
    // Próximo pago estimado el 16 nov: 6 días → $125 por día
    expect(r.detalle).toMatch(/^\$125\.00 por día · Actualizado 10 nov, 9:41/);
  });
  it('sin pago registrado solo dice cuándo se actualizó', () => {
    const r = resumenWidget({ movimientos: [gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 18, 5), 0, 20000);
    expect(r.monto).toBe('$50.00');
    expect(r.detalle).toMatch(/^Actualizado 10 nov, 6:05/);
  });
  it('sin cifras en negativo: pide el dato que falta o dice cuánto falta para los pagos', () => {
    const r = resumenWidget({ movimientos: [gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 18, 5));
    expect(r).toMatchObject({ etiqueta: 'Falta un dato', monto: '¿Cuánto tienes?' });
    const prestamo = { id: 'p', nombre: 'P', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 0, cuotaCentavos: 30000, primeraCuota: '2026-11-15', creadoEn: 0 };
    const f = resumenWidget({ movimientos: [pago, gasto], tarjetas: [], prestamos: [prestamo] }, '2026-11-10', new Date(2026, 10, 10, 18, 5), 0, -70000);
    // Tiene $50 y la cuota es de $300: faltan $250.
    expect(f).toMatchObject({ etiqueta: 'Te faltan para tus pagos', monto: '$250.00' });
  });
});
