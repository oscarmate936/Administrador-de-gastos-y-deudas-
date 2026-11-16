import type { Movimiento } from '../db';
import { mesDe } from './fechas';

/** Orden para mostrar: lo más reciente primero. */
export function ordenarRecientes(movimientos: Movimiento[]): Movimiento[] {
  return [...movimientos].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn - a.creadoEn,
  );
}

const sumar = (movs: Movimiento[]) => movs.reduce((total, m) => total + m.montoCentavos, 0);

/** Un gasto pagado con tarjeta de crédito: aumenta la deuda, no sale del disponible. */
export const esGastoConTarjeta = (m: Movimiento) => m.tipo === 'gasto' && m.tarjetaId !== undefined;

/** Dinero que sale del disponible: gastos en efectivo o débito y pagos a deudas. */
export const esSalida = (m: Movimiento) => esPagoDeDeuda(m) || (m.tipo === 'gasto' && m.tarjetaId === undefined);

/** Un pago a una tarjeta o préstamo hecho con tu dinero (no una devolución del comercio). */
export const esPagoDeDeuda = (m: Movimiento) => m.tipo === 'pago' && !m.esDevolucion;

/**
 * Lo recibido menos lo que ha salido: gastos en efectivo y pagos de tarjetas
 * y préstamos. Las compras con tarjeta no cuentan hasta que se paga la tarjeta.
 * Puede ser negativo.
 */
export function calcularDisponible(movimientos: Movimiento[]): number {
  let total = 0;
  for (const m of movimientos) {
    if (m.tipo === 'ingreso') total += m.montoCentavos;
    else if (esSalida(m)) total -= m.montoCentavos;
  }
  return total;
}

export interface TotalCategoria {
  /** undefined agrupa los gastos sin categoría (o con una categoría borrada). */
  categoriaId: string | undefined;
  totalCentavos: number;
}

/** Totales de gasto por categoría, de mayor a menor. */
export function gastosPorCategoria(
  gastos: Movimiento[],
  categoriasExistentes: Set<string>,
): TotalCategoria[] {
  const totales = new Map<string | undefined, number>();
  for (const g of gastos) {
    if (g.tipo !== 'gasto') continue;
    const clave =
      g.categoriaId && categoriasExistentes.has(g.categoriaId) ? g.categoriaId : undefined;
    totales.set(clave, (totales.get(clave) ?? 0) + g.montoCentavos);
  }
  return [...totales.entries()]
    .map(([categoriaId, totalCentavos]) => ({ categoriaId, totalCentavos }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export interface TotalesMes {
  ingresosCentavos: number;
  /** Gastos en efectivo o débito más pagos de tarjetas y préstamos. */
  salidasCentavos: number;
  /** Compras hechas con tarjeta de crédito. */
  conTarjetaCentavos: number;
  movimientos: Movimiento[];
}

export function totalesDelMes(movimientos: Movimiento[], mes: string): TotalesMes {
  const delMes = ordenarRecientes(movimientos.filter((m) => mesDe(m.fecha) === mes));
  return {
    ingresosCentavos: sumar(delMes.filter((m) => m.tipo === 'ingreso')),
    salidasCentavos: sumar(delMes.filter(esSalida)),
    conTarjetaCentavos: sumar(delMes.filter(esGastoConTarjeta)),
    movimientos: delMes,
  };
}

/** Agrupa por día manteniendo el orden recibido. */
export function agruparPorDia(movimientos: Movimiento[]): Array<[string, Movimiento[]]> {
  const grupos = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const lista = grupos.get(m.fecha);
    if (lista) lista.push(m);
    else grupos.set(m.fecha, [m]);
  }
  return [...grupos.entries()];
}
