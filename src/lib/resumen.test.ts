import { describe, expect, it } from 'vitest';
import type { Movimiento } from '../db';
import {
  agruparPorDia,
  calcularDisponible,
  gastosPorCategoria,
  ordenarRecientes,
  resumenDesdeUltimoPago,
  totalesDelMes,
} from './resumen';

let n = 0;
function mov(parcial: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento {
  n += 1;
  return { id: `m${n}`, nota: '', creadoEn: n, ...parcial };
}

const pagoOct = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 50000, fecha: '2026-10-20' });
const gastoOct = mov({ tipo: 'gasto', montoCentavos: 12000, fecha: '2026-10-25', categoriaId: 'super' });
const pagoNov = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 60000, fecha: '2026-11-05' });
const gastoMismoDia = mov({ tipo: 'gasto', montoCentavos: 2500, fecha: '2026-11-05', categoriaId: 'comida' });
const gastoNov = mov({ tipo: 'gasto', montoCentavos: 7500, fecha: '2026-11-10', categoriaId: 'comida' });
const regalo = mov({ tipo: 'ingreso', esPago: false, montoCentavos: 2000, fecha: '2026-11-11' });
const gastoSinCat = mov({ tipo: 'gasto', montoCentavos: 1000, fecha: '2026-11-12' });
const todos = [pagoOct, gastoOct, pagoNov, gastoMismoDia, gastoNov, regalo, gastoSinCat];

describe('calcularDisponible', () => {
  it('suma ingresos y resta gastos', () => {
    expect(calcularDisponible(todos)).toBe(50000 - 12000 + 60000 - 2500 - 7500 + 2000 - 1000);
  });
  it('puede quedar en negativo', () => {
    expect(calcularDisponible([gastoNov])).toBe(-7500);
  });
  it('sin movimientos es cero', () => {
    expect(calcularDisponible([])).toBe(0);
  });
});

describe('resumenDesdeUltimoPago', () => {
  it('cuenta desde el pago más reciente, incluido el mismo día', () => {
    const r = resumenDesdeUltimoPago(todos, '2026-11-13')!;
    expect(r.pago.id).toBe(pagoNov.id);
    expect(r.gastadoCentavos).toBe(2500 + 7500 + 1000);
    expect(r.otrosIngresosCentavos).toBe(2000);
    expect(r.diasTranscurridos).toBe(8);
    expect(r.promedioDiarioCentavos).toBe(Math.round(11000 / 9));
  });

  it('un ingreso que no es pago no reinicia el periodo', () => {
    const r = resumenDesdeUltimoPago(todos, '2026-11-13')!;
    expect(r.pago.id).not.toBe(regalo.id);
  });

  it('ignora pagos con fecha futura', () => {
    const r = resumenDesdeUltimoPago(todos, '2026-11-01')!;
    expect(r.pago.id).toBe(pagoOct.id);
    expect(r.gastadoCentavos).toBe(12000);
  });

  it('devuelve null si no hay ningún pago', () => {
    expect(resumenDesdeUltimoPago([gastoNov, regalo], '2026-11-13')).toBeNull();
  });
});

describe('gastosPorCategoria', () => {
  it('agrupa, ordena de mayor a menor y junta lo que no tiene categoría', () => {
    const r = gastosPorCategoria(todos, new Set(['comida']));
    expect(r).toEqual([
      // "super" no existe en el conjunto, así que cae en sin categoría junto al gasto sin categoría
      { categoriaId: undefined, totalCentavos: 13000 },
      { categoriaId: 'comida', totalCentavos: 10000 },
    ]);
  });
});

describe('listas', () => {
  it('ordena lo más reciente primero y desempata por creación', () => {
    const ids = ordenarRecientes(todos).map((m) => m.id);
    expect(ids[0]).toBe(gastoSinCat.id);
    expect(ids.indexOf(gastoMismoDia.id)).toBeLessThan(ids.indexOf(pagoNov.id));
  });

  it('totales del mes', () => {
    const t = totalesDelMes(todos, '2026-11');
    expect(t.ingresosCentavos).toBe(62000);
    expect(t.gastosCentavos).toBe(11000);
    expect(t.movimientos).toHaveLength(5);
  });

  it('agrupa por día', () => {
    const grupos = agruparPorDia(totalesDelMes(todos, '2026-11').movimientos);
    expect(grupos.map(([fecha, lista]) => [fecha, lista.length])).toEqual([
      ['2026-11-12', 1],
      ['2026-11-11', 1],
      ['2026-11-10', 1],
      ['2026-11-05', 2],
    ]);
  });
});
