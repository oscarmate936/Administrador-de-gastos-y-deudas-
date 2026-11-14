import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { proximosPagos, totalPorPagar } from './deudas';
import { formatearDinero } from './dinero';
import { calcularDisponible } from './resumen';
import { calcularRitmo } from './ritmo';

// Lo que muestra el widget de Android: la misma cifra de Inicio (libre para
// gastar o disponible), cuánto toca por día y cuándo se actualizó.

/** Igual que en Inicio. */
const DIAS_A_APARTAR = 15;

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
): ResumenWidget {
  const disponible = calcularDisponible(datos.movimientos);
  const porApartar = totalPorPagar(proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy), DIAS_A_APARTAR);
  const conLibre = porApartar > 0;
  const cifra = conLibre ? disponible - porApartar : disponible;
  const ritmo = calcularRitmo(datos.movimientos, hoy, cifra);
  const actualizado = `Actualizado ${fmtDia.format(ahora).replace('.', '')}, ${fmtHora.format(ahora)}`;
  return {
    etiqueta: conLibre ? 'Libre para gastar' : 'Disponible',
    monto: formatearDinero(cifra),
    detalle: ritmo?.porDiaCentavos ? `${formatearDinero(ritmo.porDiaCentavos)} por día · ${actualizado}` : actualizado,
  };
}
