import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { proximosPagos, totalPorPagar } from './deudas';
import { mesDe, moverMes } from './fechas';
import { calcularDisponible } from './resumen';

// Fondo de emergencia y «libre para gastar». El fondo es dinero que sigue en tu
// cuenta pero que apartas para imprevistos: no se resta de lo disponible, sí de
// lo libre para gastar, así no lo gastas sin darte cuenta.

/** Días hacia adelante cuyos pagos se apartan al calcular lo libre. */
export const DIAS_A_APARTAR = 15;
/** Meta cuando todavía no hay gastos para calcular una. */
export const META_INICIAL = 30000;

export interface Libre {
  disponible: number;
  /** Pagos de tarjetas y préstamos de los próximos días. */
  porApartar: number;
  /** Lo que está en el fondo de emergencia. */
  fondo: number;
  /** Lo que se muestra arriba en Inicio y en el widget. */
  cifra: number;
  /** true si hay algo apartado (la cifra es «libre para gastar», no «disponible»). */
  conLibre: boolean;
}

export function calcularLibre(
  datos: { movimientos: Movimiento[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
  hoy: string,
  fondoCentavos = 0,
): Libre {
  const disponible = calcularDisponible(datos.movimientos);
  const porApartar = totalPorPagar(proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy), DIAS_A_APARTAR);
  const fondo = Math.max(0, fondoCentavos);
  const conLibre = porApartar > 0 || fondo > 0;
  return { disponible, porApartar, fondo, cifra: conLibre ? disponible - porApartar - fondo : disponible, conLibre };
}

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
