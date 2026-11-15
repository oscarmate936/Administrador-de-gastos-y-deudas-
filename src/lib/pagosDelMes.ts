import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta } from './deudas';
import { mesDe } from './fechas';
import { minimoEstimado } from './plan';

// «Próximos pagos» de Inicio: lo menos que hay que pagar este mes a cada deuda.
// Tarjetas: el pago mínimo pendiente del estado de cuenta que vence este mes.
// Préstamos: la cuota de este mes. También lo vencido de meses anteriores.

export interface PagoDelMes {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  nombre: string;
  /** Lo que falta pagar del mínimo o de la cuota. */
  montoCentavos: number;
  /** Último día de pago o fecha de la cuota. */
  fecha: string;
  /** «minimo» en tarjetas, «cuota» en préstamos. */
  clase: 'minimo' | 'cuota';
  /** true si el mínimo es un cálculo de la app (no se importó el estado de cuenta). */
  estimado: boolean;
  vencido: boolean;
}

export function pagosDelMes(datos: { tarjetas: Tarjeta[]; prestamos: Prestamo[]; movimientos: Movimiento[] }, hoy: string): PagoDelMes[] {
  const mes = mesDe(hoy);
  const lista: PagoDelMes[] = [];
  for (const t of datos.tarjetas) {
    const e = estadoTarjeta(t, datos.movimientos, hoy);
    if (e.pendienteCentavos <= 0 || (mesDe(e.fechaLimite) !== mes && !e.vencido)) continue;
    // El mínimo del estado de cuenta, menos lo ya pagado; sin estado de cuenta, un cálculo.
    const estimado = e.pagoMinimoCentavos === null;
    const minimo = estimado ? Math.min(e.pendienteCentavos, minimoEstimado(e.saldoCentavos, t.tasaAnual ?? 0)) : e.pagoMinimoCentavos!;
    if (minimo <= 0) continue;
    lista.push({ tipo: 'tarjeta', id: t.id, nombre: t.nombre, montoCentavos: minimo, fecha: e.fechaLimite, clase: 'minimo', estimado, vencido: e.vencido });
  }
  for (const p of datos.prestamos) {
    const e = estadoPrestamo(p, datos.movimientos, hoy);
    if (!e.proximaFecha || e.proximaCuotaCentavos <= 0 || (mesDe(e.proximaFecha) !== mes && !e.vencido)) continue;
    lista.push({
      tipo: 'prestamo',
      id: p.id,
      nombre: p.nombre,
      montoCentavos: e.proximaCuotaCentavos,
      fecha: e.proximaFecha,
      clase: 'cuota',
      estimado: false,
      vencido: e.vencido,
    });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
