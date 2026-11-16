import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { formatearDinero } from './dinero';
import { calcularLibre } from './fondo';
import { calcularRitmo } from './ritmo';

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
  fondoCentavos = 0,
  ajusteSaldoCentavos = 0,
): ResumenWidget {
  const { cifra, conLibre, disponible } = calcularLibre(datos, hoy, fondoCentavos, ajusteSaldoCentavos);
  const ritmo = calcularRitmo(datos.movimientos, hoy, cifra);
  const actualizado = `Actualizado ${fmtDia.format(ahora).replace('.', '')}, ${fmtHora.format(ahora)}`;
  // Igual que Inicio: sin cifras en negativo.
  if (disponible < 0) return { etiqueta: 'Falta un dato', monto: '¿Cuánto tienes?', detalle: `Abre la app y dilo · ${actualizado}` };
  if (cifra < 0) return { etiqueta: 'Te faltan para tus pagos', monto: formatearDinero(-cifra), detalle: actualizado };
  return {
    etiqueta: conLibre ? 'Libre para gastar' : 'Disponible',
    monto: formatearDinero(cifra),
    detalle: ritmo?.porDiaCentavos ? `${formatearDinero(ritmo.porDiaCentavos)} por día · ${actualizado}` : actualizado,
  };
}
