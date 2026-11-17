import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta } from './deudas';
import { diasEntre, mesDe } from './fechas';

// «Próximos pagos» de Inicio: una fila por deuda con lo que hay que pagar.
// Tarjetas: el pago mínimo pendiente del estado de cuenta (y, como dato, el pago
// de contado); cubierto el mínimo, lo que falta del total si la tarjeta se paga
// completa. Préstamos: la cuota. Entra lo vencido y lo que vence antes del
// próximo sueldo (`hasta`); sin sueldo configurado, lo de este mes y lo de los
// próximos 7 días aunque sea del mes siguiente.

/** Días hacia adelante que se muestran aunque el pago sea del mes siguiente. */
export const DIAS_ADELANTE = 7;

export interface PagoDelMes {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  nombre: string;
  /** Lo que falta pagar: del mínimo, del total o de la cuota, según `clase`. */
  montoCentavos: number;
  /** Último día de pago o fecha de la cuota. */
  fecha: string;
  clase: 'minimo' | 'recomendado' | 'total' | 'cuota';
  /** true si el mínimo es un cálculo de la app (no se importó el estado de cuenta). */
  estimado: boolean;
  /** No se cubrió el mínimo o la cuota y ya pasó la fecha. */
  vencido: boolean;
  /** En tarjetas con mínimo pendiente: el pago de contado, para no generar intereses. */
  totalCentavos?: number;
}

export function pagosDelMes(
  datos: { tarjetas: Tarjeta[]; prestamos: Prestamo[]; movimientos: Movimiento[] },
  hoy: string,
  /** Día del próximo sueldo: entra lo que vence antes. Sin él, lo de este mes y los próximos 7 días. */
  hasta?: string,
): PagoDelMes[] {
  const mes = mesDe(hoy);
  const enVentana = (fecha: string) => {
    const dias = diasEntre(hoy, fecha);
    if (dias < 0) return false;
    return hasta ? fecha < hasta : mesDe(fecha) === mes || dias <= DIAS_ADELANTE;
  };
  const lista: PagoDelMes[] = [];
  for (const t of datos.tarjetas) {
    const e = estadoTarjeta(t, datos.movimientos, hoy);
    if (!e.vencido && !enVentana(e.fechaLimite)) {
      // Con el estado de cuenta actual ya cerrado, el siguiente puede vencer antes del próximo sueldo.
      if (hasta && e.proximoEstadoCentavos > 0 && enVentana(e.proximaFechaLimite)) {
        const forma = t.formaPago ?? 'total';
        const monto = forma === 'minimo' ? e.proximoMinimoCentavos : forma === 'recomendado' ? e.proximoRecomendadoCentavos : e.proximoEstadoCentavos;
        if (monto > 0) {
          lista.push({
            tipo: 'tarjeta', id: t.id, nombre: t.nombre, fecha: e.proximaFechaLimite, vencido: false, estimado: true, montoCentavos: monto,
            clase: forma === 'total' ? 'total' : forma,
            totalCentavos: forma !== 'total' && e.proximoEstadoCentavos > monto ? e.proximoEstadoCentavos : undefined,
          });
        }
      }
      continue;
    }
    const base = { tipo: 'tarjeta' as const, id: t.id, nombre: t.nombre, fecha: e.fechaLimite, vencido: e.vencido };
    // Quien paga lo recomendado ve ese monto (más que el mínimo, para que la deuda baje).
    if (t.formaPago === 'recomendado' && e.recomendadoPendienteCentavos > 0) {
      lista.push({
        ...base,
        montoCentavos: e.recomendadoPendienteCentavos,
        clase: 'recomendado',
        estimado: e.minimoEsEstimado,
        totalCentavos: e.pendienteCentavos > e.recomendadoPendienteCentavos ? e.pendienteCentavos : undefined,
      });
    } else if (e.minimoPendienteCentavos > 0) {
      lista.push({
        ...base,
        montoCentavos: e.minimoPendienteCentavos,
        clase: 'minimo',
        estimado: e.minimoEsEstimado,
        totalCentavos: e.pendienteCentavos > e.minimoPendienteCentavos ? e.pendienteCentavos : undefined,
      });
    } else if (t.formaPago !== 'minimo' && t.formaPago !== 'recomendado' && e.pendienteCentavos > 0) {
      // Mínimo cubierto: quien paga el total ve lo que le falta hasta el último día de pago.
      lista.push({ ...base, montoCentavos: e.pendienteCentavos, clase: 'total', estimado: false });
    }
  }
  for (const p of datos.prestamos) {
    const e = estadoPrestamo(p, datos.movimientos, hoy);
    if (!e.proximaFecha || e.proximaCuotaCentavos <= 0 || (!e.vencido && !enVentana(e.proximaFecha))) continue;
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
