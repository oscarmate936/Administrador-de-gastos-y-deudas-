import type { Movimiento } from '../db';
import { diasEntre, sumarDias } from './fechas';
import { resumenDesdeUltimoPago } from './resumen';

// Cuánto puedes gastar por día y hasta cuándo te alcanza. Como no hay día de
// pago fijo, el próximo pago se estima con cada cuántos días te han pagado.

/** Sin al menos dos pagos registrados se supone una quincena. */
export const INTERVALO_SUPUESTO = 15;

export interface Intervalo {
  dias: number;
  /** true si no hay historia suficiente y se usa la quincena supuesta. */
  supuesto: boolean;
}

/** Cada cuántos días llegan tus pagos: la mediana de los últimos 6 intervalos, entre 7 y 45 días. */
export function intervaloDePago(movimientos: Movimiento[], hoy: string): Intervalo {
  const fechas = [...new Set(movimientos.filter((m) => m.tipo === 'ingreso' && m.esPago && m.fecha <= hoy).map((m) => m.fecha))].sort();
  if (fechas.length < 2) return { dias: INTERVALO_SUPUESTO, supuesto: true };
  const intervalos = fechas.slice(1).map((f, i) => diasEntre(fechas[i], f)).slice(-6).sort((a, b) => a - b);
  const medio = Math.floor(intervalos.length / 2);
  const mediana = intervalos.length % 2 ? intervalos[medio] : Math.round((intervalos[medio - 1] + intervalos[medio]) / 2);
  return { dias: Math.min(45, Math.max(7, mediana)), supuesto: false };
}

export interface Ritmo {
  intervalo: Intervalo;
  ultimoPago: string;
  /** Fecha estimada del próximo pago (como mínimo, mañana). */
  proximoPago: string;
  /** true si ya pasó la fecha en que solía llegar el pago. */
  pagoAtrasado: boolean;
  diasRestantes: number;
  /** Lo libre repartido en los días que faltan; null si no queda nada libre. */
  porDiaCentavos: number | null;
  /** Gastos en efectivo o débito por día desde el pago (sin pagos de deudas). */
  gastoDiarioCentavos: number;
  /** Día en que se acabaría lo libre al ritmo actual; null si no hay gastos o no queda nada. */
  alcanzaHasta: string | null;
  /** Gasto acumulado por día desde el pago (índice 0 = día del pago) hasta hoy. */
  acumulado: number[];
  /** Total que podrías gastar en el periodo: lo ya gastado más lo libre. */
  totalPeriodoCentavos: number;
  /** Días del periodo, del pago al próximo pago estimado. */
  diasPeriodo: number;
  /** Lo que habrías gastado hoy a ritmo parejo. */
  idealHoyCentavos: number;
}

export function calcularRitmo(movimientos: Movimiento[], hoy: string, libreCentavos: number): Ritmo | null {
  const periodo = resumenDesdeUltimoPago(movimientos, hoy);
  if (!periodo) return null;
  const intervalo = intervaloDePago(movimientos, hoy);
  const ultimoPago = periodo.pago.fecha;
  const esperado = sumarDias(ultimoPago, intervalo.dias);
  const manana = sumarDias(hoy, 1);
  const pagoAtrasado = esperado <= hoy;
  const proximoPago = pagoAtrasado ? manana : esperado;
  const diasRestantes = Math.max(1, diasEntre(hoy, proximoPago));

  const transcurridos = diasEntre(ultimoPago, hoy);
  const acumulado: number[] = [];
  let suma = 0;
  for (let d = 0; d <= transcurridos; d++) {
    const fecha = sumarDias(ultimoPago, d);
    suma += periodo.gastos.filter((g) => g.fecha === fecha).reduce((t, g) => t + g.montoCentavos, 0);
    acumulado.push(suma);
  }
  const gastoDiarioCentavos = Math.round(suma / (transcurridos + 1));

  const libre = Math.max(0, libreCentavos);
  const porDiaCentavos = libre > 0 ? Math.floor(libre / diasRestantes) : null;
  const alcanzaHasta = libre > 0 && gastoDiarioCentavos > 0 ? sumarDias(hoy, Math.floor(libre / gastoDiarioCentavos)) : null;

  const diasPeriodo = Math.max(1, diasEntre(ultimoPago, proximoPago));
  const totalPeriodoCentavos = suma + libre;
  const idealHoyCentavos = Math.round((totalPeriodoCentavos * Math.min(transcurridos + 1, diasPeriodo)) / diasPeriodo);

  return {
    intervalo,
    ultimoPago,
    proximoPago,
    pagoAtrasado,
    diasRestantes,
    porDiaCentavos,
    gastoDiarioCentavos,
    alcanzaHasta,
    acumulado,
    totalPeriodoCentavos,
    diasPeriodo,
    idealHoyCentavos,
  };
}
