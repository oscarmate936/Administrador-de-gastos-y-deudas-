import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo } from '../db';
import { AJUSTES_INICIALES } from './ajustes';
import { resumenWidget } from './widget';

const pago: Movimiento = { id: 'a', tipo: 'ingreso', esPago: true, montoCentavos: 90000, fecha: '2026-11-01', nota: '', creadoEn: 1 };
const gasto: Movimiento = { id: 'b', tipo: 'gasto', montoCentavos: 15000, fecha: '2026-11-05', nota: '', creadoEn: 2 };
const sueldo = AJUSTES_INICIALES.sueldo;

describe('resumenWidget', () => {
  it('muestra lo que queda, cuánto toca por día hasta el próximo sueldo y cuándo se actualizó', () => {
    const r = resumenWidget({ movimientos: [pago, gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 9, 41), { sueldo });
    expect(r.etiqueta).toBe('Te quedan para gastar');
    expect(r.monto).toBe('$750.00');
    // Sueldo mensual el día 1: el próximo es el 1 de diciembre, en 21 días → $35.71 por día.
    expect(r.detalle).toMatch(/^\$35\.71 por día · Actualizado 10 nov, 9:41/);
  });
  it('con lo que dijiste tener, sin sueldo registrado', () => {
    const r = resumenWidget({ movimientos: [gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 18, 5), {
      sueldo,
      ajusteSaldoCentavos: 20000,
    });
    expect(r.monto).toBe('$50.00');
  });
  it('sin cifras en negativo: pide el dato que falta o dice cuánto falta para los pagos', () => {
    const r = resumenWidget({ movimientos: [gasto], tarjetas: [], prestamos: [] }, '2026-11-10', new Date(2026, 10, 10, 18, 5), { sueldo });
    expect(r).toMatchObject({ etiqueta: 'Falta un dato', monto: '¿Cuánto tienes?' });
    const prestamo: Prestamo = { id: 'p', nombre: 'P', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 0, cuotaCentavos: 30000, primeraCuota: '2026-11-15', creadoEn: 0 };
    const f = resumenWidget({ movimientos: [pago, gasto], tarjetas: [], prestamos: [prestamo] }, '2026-11-10', new Date(2026, 10, 10, 18, 5), {
      sueldo,
      ajusteSaldoCentavos: -70000,
    });
    // Tiene $50 y la cuota es de $300: faltan $250.
    expect(f).toMatchObject({ etiqueta: 'Te faltan para tus pagos', monto: '$250.00' });
  });
});
