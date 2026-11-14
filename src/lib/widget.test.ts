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
    const r = resumenWidget({ movimientos: [gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 18, 5));
    expect(r.monto).toBe('-$150.00');
    expect(r.detalle).toMatch(/^Actualizado 10 nov, 6:05/);
  });
});
