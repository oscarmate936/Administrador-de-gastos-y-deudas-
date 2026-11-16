import type { Movimiento, Tarjeta } from '../db';
import { proximosPagos } from './deudas';
import { mesDe, moverMes } from './fechas';

// Fondo de emergencia: dinero que sigue en tu cuenta pero que apartas para
// imprevistos. No se resta de lo que tienes, sí de lo que te queda para gastar
// (lib/sueldo.ts), así no lo gastas sin darte cuenta.

/** Lo que se apartaría de una tarjeta en los próximos días si se paga el total o solo el mínimo. */
export interface ApartadoTarjeta {
  totalCentavos: number;
  minimoCentavos: number;
  /** El mínimo es un cálculo de la app (no se importó el estado de cuenta). */
  minimoAprox: boolean;
}

/** `hasta`: el día del próximo sueldo; cuenta lo que vence antes (y lo vencido). */
export function apartadoPorForma(tarjeta: Tarjeta, movimientos: Movimiento[], hoy: string, hasta: string): ApartadoTarjeta {
  const con = (formaPago: 'total' | 'minimo') =>
    proximosPagos([{ ...tarjeta, formaPago }], [], movimientos, hoy).filter((p) => p.fecha < hasta);
  const minimos = con('minimo');
  return {
    totalCentavos: con('total').reduce((t, p) => t + p.montoCentavos, 0),
    minimoCentavos: minimos.reduce((t, p) => t + p.montoCentavos, 0),
    minimoAprox: minimos.some((p) => p.estimado),
  };
}

/** Meta cuando todavía no hay gastos para calcular una. */
export const META_INICIAL = 30000;

/**
 * Meta sugerida: lo que gastas en un mes (promedio de los últimos 3 meses
 * completos con gastos), redondeado a $50 y de al menos $100.
 */
export function sugerirMeta(movimientos: Movimiento[], hoy: string): number {
  const mesActual = mesDe(hoy);
  const meses = [1, 2, 3].map((n) => moverMes(mesActual, -n));
  const porMes = meses
    .map((mes) => movimientos.filter((m) => m.tipo === 'gasto' && mesDe(m.fecha) === mes).reduce((t, m) => t + m.montoCentavos, 0))
    .filter((total) => total > 0);
  if (porMes.length === 0) return META_INICIAL;
  const promedio = porMes.reduce((a, b) => a + b, 0) / porMes.length;
  return Math.max(10000, Math.round(promedio / 5000) * 5000);
}

/** Lo que queda en el fondo después de apartar o usar. null si se quiere usar más de lo que hay. */
export function moverFondo(apartadoCentavos: number, accion: 'apartar' | 'usar', montoCentavos: number): number | null {
  if (montoCentavos <= 0) return null;
  if (accion === 'apartar') return apartadoCentavos + montoCentavos;
  return montoCentavos > apartadoCentavos ? null : apartadoCentavos - montoCentavos;
}
