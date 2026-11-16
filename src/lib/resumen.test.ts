import { describe, expect, it } from 'vitest';
import type { Movimiento } from '../db';
import {
  agruparPorDia,
  calcularDisponible,
  gastosPorCategoria,
  ordenarRecientes,
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
    expect(t.salidasCentavos).toBe(11000);
    expect(t.conTarjetaCentavos).toBe(0);
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

describe('tarjetas y pagos de deudas', () => {
  const pago = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 100000, fecha: '2026-11-01' });
  const efectivo = mov({ tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-02', categoriaId: 'comida' });
  const conTarjeta = mov({ tipo: 'gasto', montoCentavos: 30000, fecha: '2026-11-03', tarjetaId: 't1' });
  const pagoTarjeta = mov({ tipo: 'pago', montoCentavos: 20000, fecha: '2026-11-04', tarjetaId: 't1' });
  const pagoPrestamo = mov({ tipo: 'pago', montoCentavos: 15000, fecha: '2026-11-05', prestamoId: 'p1', capitalCentavos: 10000 });
  const movs = [pago, efectivo, conTarjeta, pagoTarjeta, pagoPrestamo];

  it('la compra con tarjeta no baja el disponible; pagar la tarjeta o el préstamo sí', () => {
    expect(calcularDisponible(movs)).toBe(100000 - 5000 - 20000 - 15000);
  });

  it('los totales del mes separan salidas y compras con tarjeta', () => {
    const t = totalesDelMes(movs, '2026-11');
    expect(t.ingresosCentavos).toBe(100000);
    expect(t.salidasCentavos).toBe(40000);
    expect(t.conTarjetaCentavos).toBe(30000);
  });
});
