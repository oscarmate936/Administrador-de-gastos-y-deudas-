import type { BaseDeDatos, Foto, Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta } from './deudas';
import { mesDe } from './fechas';
import { calcularDisponible } from './resumen';

/** Foto de cómo están las deudas y el disponible hoy. */
export function fotoDeHoy(
  datos: { movimientos: Movimiento[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
  hoy: string,
  ajusteSaldoCentavos = 0,
): Foto {
  const deudas: Foto['deudas'] = [
    ...datos.tarjetas.map((t) => ({
      tipo: 'tarjeta' as const,
      id: t.id,
      nombre: t.nombre,
      saldoCentavos: estadoTarjeta(t, datos.movimientos, hoy).deudaTotalCentavos,
    })),
    ...datos.prestamos.map((p) => ({
      tipo: 'prestamo' as const,
      id: p.id,
      nombre: p.nombre,
      saldoCentavos: estadoPrestamo(p, datos.movimientos, hoy).saldoCentavos,
    })),
  ];
  return {
    mes: mesDe(hoy),
    fecha: hoy,
    disponibleCentavos: calcularDisponible(datos.movimientos) + ajusteSaldoCentavos,
    deudaTotalCentavos: deudas.reduce((t, d) => t + d.saldoCentavos, 0),
    deudas,
  };
}

/** Guarda la foto del mes si cambió; la del mes queda con los últimos valores vistos. */
export async function guardarFoto(db: BaseDeDatos, foto: Foto): Promise<void> {
  const actual = await db.historial.get(foto.mes);
  const igual = (f: Foto) => JSON.stringify({ ...f, fecha: '' });
  if (actual && igual(actual) === igual(foto)) return;
  await db.historial.put(foto);
}
