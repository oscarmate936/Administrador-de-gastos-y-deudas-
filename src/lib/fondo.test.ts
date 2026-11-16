import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { apartadoPorForma, calcularLibre, META_INICIAL, moverFondo, sugerirMeta } from './fondo';

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

  it('«¿Cuánto dinero tienes hoy?» corrige lo disponible y lo libre', () => {
    // Sin ingresos anotados y con $50 de gastos, la app calculaba −$50; la persona dice tener $300.
    const gasto = mov({ tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-10' });
    const datos = { movimientos: [gasto], tarjetas: [], prestamos: [prestamo] };
    expect(calcularLibre(datos, '2026-11-15').disponible).toBe(-5000);
    const ajuste = 30000 - -5000;
    expect(calcularLibre(datos, '2026-11-15', 0, ajuste)).toMatchObject({ disponible: 30000, porApartar: 10000, cifra: 20000 });
    // Un gasto posterior sigue restando.
    const otro = mov({ tipo: 'gasto', montoCentavos: 2500, fecha: '2026-11-16' });
    expect(calcularLibre({ ...datos, movimientos: [gasto, otro] }, '2026-11-16', 0, ajuste).disponible).toBe(27500);
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

describe('pagar el total o solo el mínimo de una tarjeta', () => {
  // Debe $3,000 y el estado de cuenta pide $2,000 de contado o $80 de mínimo; vence el 20.
  const tarjeta: Tarjeta = {
    id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 400000, diaCorte: 25, diaPago: 20,
    saldoInicialCentavos: 300000, pendienteInicialCentavos: 200000, fechaSaldo: '2026-10-25', color: '', creadoEn: 0, tasaAnual: 30,
    ultimoEstado: { fechaCorte: '2026-10-25', fechaLimite: '2026-11-20', pagoContadoCentavos: 200000, pagoMinimoCentavos: 8000, saldoCentavos: 300000 },
  };
  const sueldo: Movimiento = { id: 's', tipo: 'ingreso', esPago: true, montoCentavos: 50000, fecha: '2026-11-01', nota: '', creadoEn: 0 };

  it('da el monto de cada forma de pago', () => {
    expect(apartadoPorForma(tarjeta, [], '2026-11-15')).toEqual({ totalCentavos: 200000, minimoCentavos: 8000, minimoAprox: false });
  });

  it('con «el mínimo» la app aparta el mínimo y ya no queda en rojo', () => {
    const total = calcularLibre({ movimientos: [sueldo], tarjetas: [tarjeta], prestamos: [] }, '2026-11-15');
    expect(total).toMatchObject({ porApartar: 200000, cifra: -150000 });
    const minimo = calcularLibre({ movimientos: [sueldo], tarjetas: [{ ...tarjeta, formaPago: 'minimo' }], prestamos: [] }, '2026-11-15');
    expect(minimo).toMatchObject({ porApartar: 8000, cifra: 42000 });
  });
});
