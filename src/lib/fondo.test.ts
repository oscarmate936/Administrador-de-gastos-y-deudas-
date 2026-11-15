import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo } from '../db';
import { calcularLibre, META_INICIAL, moverFondo, sugerirMeta } from './fondo';

let n = 0;
const mov = (m: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento => ({ id: `m${n++}`, nota: '', creadoEn: 0, ...m });

describe('fondo de emergencia', () => {
  const prestamo: Prestamo = {
    id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000,
    primeraCuota: '2026-11-20', creadoEn: 0,
  };
  const pago = mov({ tipo: 'ingreso', montoCentavos: 90000, fecha: '2026-11-01', esPago: true });

  it('lo apartado se resta de lo libre, no de lo disponible', () => {
    const sin = calcularLibre({ movimientos: [pago], tarjetas: [], prestamos: [prestamo] }, '2026-11-15');
    expect(sin).toEqual({ disponible: 90000, porApartar: 10000, fondo: 0, cifra: 80000, conLibre: true });
    const con = calcularLibre({ movimientos: [pago], tarjetas: [], prestamos: [prestamo] }, '2026-11-15', 15000);
    expect(con).toMatchObject({ disponible: 90000, fondo: 15000, cifra: 65000, conLibre: true });
    // Sin pagos próximos, solo con fondo, la cifra también es «libre para gastar».
    expect(calcularLibre({ movimientos: [pago], tarjetas: [], prestamos: [] }, '2026-11-15', 5000)).toMatchObject({ cifra: 85000, conLibre: true });
    expect(calcularLibre({ movimientos: [pago], tarjetas: [], prestamos: [] }, '2026-11-15')).toMatchObject({ cifra: 90000, conLibre: false });
  });

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
