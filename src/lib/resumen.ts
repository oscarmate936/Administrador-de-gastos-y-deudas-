import type { Movimiento } from '../db';
import { diasEntre, mesDe } from './fechas';

/** Orden para mostrar: lo más reciente primero. */
export function ordenarRecientes(movimientos: Movimiento[]): Movimiento[] {
  return [...movimientos].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn - a.creadoEn,
  );
}

const sumar = (movs: Movimiento[]) => movs.reduce((total, m) => total + m.montoCentavos, 0);

/** Todo lo recibido menos todo lo gastado. Puede ser negativo. */
export function calcularDisponible(movimientos: Movimiento[]): number {
  let total = 0;
  for (const m of movimientos) {
    total += m.tipo === 'ingreso' ? m.montoCentavos : -m.montoCentavos;
  }
  return total;
}

export interface ResumenPeriodo {
  /** El último pago recibido (hoy o antes). */
  pago: Movimiento;
  /** Gastos hechos desde ese pago, incluido el mismo día. */
  gastadoCentavos: number;
  /** Otros ingresos recibidos después de ese pago. */
  otrosIngresosCentavos: number;
  diasTranscurridos: number;
  /** Gasto promedio por día desde el pago. */
  promedioDiarioCentavos: number;
  gastos: Movimiento[];
}

/**
 * Resumen "desde tu último pago". Como no hay día de pago fijo, el periodo
 * empieza cuando la persona registra un ingreso marcado como pago.
 */
export function resumenDesdeUltimoPago(
  movimientos: Movimiento[],
  fechaHoy: string,
): ResumenPeriodo | null {
  const pago = ordenarRecientes(movimientos).find(
    (m) => m.tipo === 'ingreso' && m.esPago && m.fecha <= fechaHoy,
  );
  if (!pago) return null;

  const enPeriodo = movimientos.filter((m) => m.fecha >= pago.fecha && m.fecha <= fechaHoy);
  const gastos = enPeriodo.filter((m) => m.tipo === 'gasto');
  const otrosIngresos = enPeriodo.filter((m) => m.tipo === 'ingreso' && m.id !== pago.id);

  const gastadoCentavos = sumar(gastos);
  const diasTranscurridos = diasEntre(pago.fecha, fechaHoy);
  return {
    pago,
    gastadoCentavos,
    otrosIngresosCentavos: sumar(otrosIngresos),
    diasTranscurridos,
    // El día del pago cuenta como día 1.
    promedioDiarioCentavos: Math.round(gastadoCentavos / (diasTranscurridos + 1)),
    gastos,
  };
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
  gastosCentavos: number;
  movimientos: Movimiento[];
}

export function totalesDelMes(movimientos: Movimiento[], mes: string): TotalesMes {
  const delMes = ordenarRecientes(movimientos.filter((m) => mesDe(m.fecha) === mes));
  return {
    ingresosCentavos: sumar(delMes.filter((m) => m.tipo === 'ingreso')),
    gastosCentavos: sumar(delMes.filter((m) => m.tipo === 'gasto')),
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
