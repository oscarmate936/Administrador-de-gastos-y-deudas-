import type { Foto, Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta } from './deudas';

// Camino a «libre de deudas»: cuánto has bajado desde lo más alto que debiste
// (según la foto mensual del historial) y las metas que se celebran.

export const HITOS = [25, 50, 75, 100] as const;

export interface Progreso {
  /** Lo más alto que has debido desde que usas la app. */
  maximoCentavos: number;
  actualCentavos: number;
  pagadoCentavos: number;
  /** 0 a 100, hacia abajo (99.6 % no cuenta como 100 %). */
  porcentaje: number;
}

export function deudaTotalActual(tarjetas: Tarjeta[], prestamos: Prestamo[], movimientos: Movimiento[], hoy: string): number {
  return (
    tarjetas.reduce((t, x) => t + estadoTarjeta(x, movimientos, hoy).deudaTotalCentavos, 0) +
    prestamos.reduce((t, x) => t + estadoPrestamo(x, movimientos, hoy).saldoCentavos, 0)
  );
}

/** null si nunca has tenido deudas registradas. */
export function progresoDeudas(historial: Foto[], actualCentavos: number): Progreso | null {
  const maximoCentavos = Math.max(actualCentavos, ...historial.map((f) => f.deudaTotalCentavos));
  if (maximoCentavos <= 0) return null;
  const pagadoCentavos = Math.max(0, maximoCentavos - actualCentavos);
  return {
    maximoCentavos,
    actualCentavos,
    pagadoCentavos,
    porcentaje: actualCentavos <= 0 ? 100 : Math.min(99, Math.floor((pagadoCentavos / maximoCentavos) * 100)),
  };
}

/** Metas alcanzadas que aún no se han celebrado, de menor a mayor. */
export function hitosNuevos(porcentaje: number, celebrados: number[]): number[] {
  return HITOS.filter((h) => porcentaje >= h && !celebrados.includes(h));
}

/** Préstamos que ya quedaron en cero. */
export function prestamosSaldados(prestamos: Prestamo[], movimientos: Movimiento[], hoy: string): Prestamo[] {
  return prestamos.filter((p) => estadoPrestamo(p, movimientos, hoy).saldoCentavos === 0);
}
