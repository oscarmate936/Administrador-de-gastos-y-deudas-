import { describe, expect, it } from 'vitest';
import type { Movimiento, Tarjeta } from '../db';
import { apartadoPorForma, META_INICIAL, moverFondo, sugerirMeta } from './fondo';

let n = 0;
const mov = (m: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento => ({ id: `m${n++}`, nota: '', creadoEn: 0, ...m });

describe('fondo de emergencia', () => {
  it('sugiere como meta un mes de gastos, redondeado a $50', () => {
    expect(sugerirMeta([], '2026-11-15')).toBe(META_INICIAL);
    const gastos = [
      mov({ tipo: 'gasto', montoCentavos: 41000, fecha: '2026-08-10' }),
      mov({ tipo: 'gasto', montoCentavos: 52000, fecha: '2026-09-10' }),
      mov({ tipo: 'gasto', montoCentavos: 47000, fecha: '2026-10-10' }),
      // El mes en curso todavía no cuenta.
      mov({ tipo: 'gasto', montoCentavos: 999900, fecha: '2026-11-02' }),
    ];
    // Promedio de ago, sep y oct: (41000 + 52000 + 47000) / 3 = 46667 → $450.
    expect(sugerirMeta(gastos, '2026-11-15')).toBe(45000);
    // Solo cuentan los meses con gastos.
    expect(sugerirMeta(gastos.slice(1), '2026-11-15')).toBe(50000);
    expect(sugerirMeta([mov({ tipo: 'gasto', montoCentavos: 3000, fecha: '2026-10-01' })], '2026-11-15')).toBe(10000);
  });

  it('apartar suma y usar resta, sin pasar de lo que hay', () => {
    expect(moverFondo(10000, 'apartar', 2500)).toBe(12500);
    expect(moverFondo(10000, 'usar', 2500)).toBe(7500);
    expect(moverFondo(10000, 'usar', 10000)).toBe(0);
    expect(moverFondo(10000, 'usar', 10001)).toBeNull();
    expect(moverFondo(10000, 'apartar', 0)).toBeNull();
  });
});

describe('pagar el total o solo el mínimo de una tarjeta', () => {
  // Debe $3,000 y el estado de cuenta pide $2,000 de contado o $80 de mínimo; vence el 20.
  const tarjeta: Tarjeta = {
    id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 400000, diaCorte: 25, diaPago: 20,
    saldoInicialCentavos: 300000, pendienteInicialCentavos: 200000, fechaSaldo: '2026-10-25', color: '', creadoEn: 0, tasaAnual: 30,
    ultimoEstado: { fechaCorte: '2026-10-25', fechaLimite: '2026-11-20', pagoContadoCentavos: 200000, pagoMinimoCentavos: 8000, saldoCentavos: 300000 },
  };

  it('da el monto de cada forma de pago', () => {
    // Recomendado: el mayor entre el mínimo ($80) y los intereses del mes más el 1 % ($50 + $20).
    expect(apartadoPorForma(tarjeta, [], '2026-11-15', '2026-11-30')).toEqual({ totalCentavos: 200000, recomendadoCentavos: 8000, minimoCentavos: 8000, minimoAprox: false });
  });

});
