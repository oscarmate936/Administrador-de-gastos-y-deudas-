import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta, repartirPago } from './deudas';
import { fechaCorta } from './fechas';

// «Ya pagué» desde un recordatorio: registra el pago con el monto exacto sin
// abrir el formulario. Solo si ese pago sigue pendiente, para no duplicarlo.

/** El pago al que se refiere el recordatorio: la deuda y su fecha de pago. */
export interface ClavePago {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  /** Último día de pago de la tarjeta o fecha de la cuota del préstamo. */
  fecha: string;
  /** En tarjetas: «Pagué el mínimo» registra el mínimo en vez del pago de contado. */
  modo?: 'total' | 'minimo';
  /** En el aviso de una tarjeta: se conoce el mínimo y se ofrece «Pagué el mínimo». */
  conMinimo?: boolean;
}

export type ResultadoPago =
  | { ok: true; movimiento: Movimiento; nombre: string }
  /** `abrirPago`: hay un pago anterior pendiente o falta un dato; conviene abrir el formulario. */
  | { ok: false; motivo: string; abrirPago?: boolean };

/** Comprueba que lo que trae una notificación sea una clave de pago válida. */
export function esClavePago(v: unknown): v is ClavePago {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    (c.tipo === 'tarjeta' || c.tipo === 'prestamo') &&
    typeof c.id === 'string' &&
    typeof c.fecha === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) &&
    (c.modo === undefined || c.modo === 'total' || c.modo === 'minimo')
  );
}

/** Id fijo para el pago de ese recordatorio: tocar «Ya pagué» dos veces no lo duplica. */
export const idPagoRapido = (c: ClavePago) => `aviso-${c.tipo}-${c.id}-${c.fecha}`;

export function pagoRapido(
  datos: { tarjetas: Tarjeta[]; prestamos: Prestamo[]; movimientos: Movimiento[] },
  c: ClavePago,
  hoy: string,
  creadoEn = Date.now(),
): ResultadoPago {
  const base = { id: idPagoRapido(c), tipo: 'pago' as const, fecha: hoy, nota: '', creadoEn };
  if (datos.movimientos.some((m) => m.id === base.id)) return { ok: false, motivo: 'Ese pago ya está registrado.' };

  if (c.tipo === 'tarjeta') {
    const t = datos.tarjetas.find((x) => x.id === c.id);
    if (!t) return { ok: false, motivo: 'Esa tarjeta ya no existe.' };
    const e = estadoTarjeta(t, datos.movimientos, hoy);
    if (e.pendienteCentavos > 0 && e.fechaLimite < c.fecha) {
      return { ok: false, motivo: `Falta el pago de ${t.nombre} del ${fechaCorta(e.fechaLimite)}.`, abrirPago: true };
    }
    if (e.pendienteCentavos <= 0 || e.fechaLimite !== c.fecha) {
      return { ok: false, motivo: `El pago de ${t.nombre} ya está registrado.` };
    }
    if (c.modo === 'minimo') {
      if (!e.pagoMinimoCentavos) return { ok: false, motivo: `No sé el pago mínimo de ${t.nombre}: escribe cuánto pagaste.`, abrirPago: true };
      return { ok: true, nombre: t.nombre, movimiento: { ...base, montoCentavos: e.pagoMinimoCentavos, tarjetaId: t.id } };
    }
    return { ok: true, nombre: t.nombre, movimiento: { ...base, montoCentavos: e.pendienteCentavos, tarjetaId: t.id } };
  }

  const p = datos.prestamos.find((x) => x.id === c.id);
  if (!p) return { ok: false, motivo: 'Ese préstamo ya no existe.' };
  const e = estadoPrestamo(p, datos.movimientos, hoy);
  if (e.proximaFecha && e.proximaFecha < c.fecha) {
    return { ok: false, motivo: `Falta la cuota de ${p.nombre} del ${fechaCorta(e.proximaFecha)}.`, abrirPago: true };
  }
  if (!e.proximaFecha || e.proximaFecha !== c.fecha) {
    return { ok: false, motivo: `La cuota de ${p.nombre} ya está registrada.` };
  }
  const monto = e.proximaCuotaCentavos;
  const { capitalCentavos, cargosCentavos } = repartirPago(p, e, monto, false, hoy);
  return { ok: true, nombre: p.nombre, movimiento: { ...base, montoCentavos: monto, prestamoId: p.id, capitalCentavos, cargosCentavos } };
}
