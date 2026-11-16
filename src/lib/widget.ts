import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { formatearDinero } from './dinero';
import { planDelSueldo, type OpcionesSueldo } from './sueldo';

// Lo que muestra el widget de Android: la misma cifra de Inicio (libre para
// gastar o disponible), cuánto toca por día y cuándo se actualizó.

export interface ResumenWidget {
  etiqueta: string;
  monto: string;
  detalle: string;
}

const fmtHora = new Intl.DateTimeFormat('es-SV', { hour: 'numeric', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short' });

export function resumenWidget(
  datos: { movimientos: Movimiento[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
  hoy: string,
  ahora: Date,
  opciones: OpcionesSueldo,
): ResumenWidget {
  const plan = planDelSueldo(datos, hoy, opciones);
  const actualizado = `Actualizado ${fmtDia.format(ahora).replace('.', '')}, ${fmtHora.format(ahora)}`;
  // Igual que Inicio: sin cifras en negativo.
  if (plan.disponibleCentavos < 0) return { etiqueta: 'Falta un dato', monto: '¿Cuánto tienes?', detalle: `Abre la app y dilo · ${actualizado}` };
  if (plan.libreCentavos < 0) return { etiqueta: 'Te faltan para tus pagos', monto: formatearDinero(-plan.libreCentavos), detalle: actualizado };
  return {
    etiqueta: 'Te quedan para gastar',
    monto: formatearDinero(plan.libreCentavos),
    detalle: plan.porDiaCentavos ? `${formatearDinero(plan.porDiaCentavos)} por día · ${actualizado}` : actualizado,
  };
}
