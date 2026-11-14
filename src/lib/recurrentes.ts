import { nuevoId, type BaseDeDatos, type Movimiento, type Recurrente } from '../db';
import { fechaConDia } from './deudas';
import { aDate } from './fechas';

/** Los que ya tocan (su fecha es hoy o pasó) y siguen activos, del más viejo al más nuevo. */
export function pendientes(recurrentes: Recurrente[], hoy: string): Recurrente[] {
  return recurrentes.filter((r) => r.activo && r.proxima <= hoy).sort((a, b) => a.proxima.localeCompare(b.proxima));
}

/** La fecha del mes siguiente con el día de la plantilla (ajustado a meses cortos). */
export function siguienteFecha(r: Pick<Recurrente, 'proxima' | 'dia'>): string {
  const d = aDate(r.proxima);
  return fechaConDia(d.getFullYear(), d.getMonth() + 1, r.dia);
}

/** Primera fecha de la plantilla: el mismo día del mes siguiente a `fecha`. */
export function primeraFecha(fecha: string): { dia: number; proxima: string } {
  const d = aDate(fecha);
  return { dia: d.getDate(), proxima: fechaConDia(d.getFullYear(), d.getMonth() + 1, d.getDate()) };
}

export function movimientoDesde(r: Recurrente, ahora = Date.now()): Movimiento {
  return {
    id: nuevoId(),
    tipo: r.tipo,
    montoCentavos: r.montoCentavos,
    fecha: r.proxima,
    categoriaId: r.tipo === 'gasto' ? r.categoriaId : undefined,
    esPago: r.tipo === 'ingreso' ? r.esPago : undefined,
    tarjetaId: r.tipo === 'ingreso' ? undefined : r.tarjetaId,
    nota: r.nota,
    creadoEn: ahora,
  };
}

/** Registra el movimiento con la fecha que tocaba y pasa la plantilla al mes siguiente. */
export async function registrarRecurrente(db: BaseDeDatos, r: Recurrente): Promise<void> {
  await db.transaction('rw', db.movimientos, db.recurrentes, async () => {
    // Si ya se registró (por ejemplo, con un doble toque), no se repite.
    const actual = await db.recurrentes.get(r.id);
    if (!actual || actual.proxima !== r.proxima) return;
    await db.movimientos.add(movimientoDesde(r));
    await db.recurrentes.update(r.id, { proxima: siguienteFecha(r) });
  });
}

/** Salta esta vez sin registrar nada. */
export async function omitirRecurrente(db: BaseDeDatos, r: Recurrente): Promise<void> {
  await db.transaction('rw', db.recurrentes, async () => {
    const actual = await db.recurrentes.get(r.id);
    if (!actual || actual.proxima !== r.proxima) return;
    await db.recurrentes.update(r.id, { proxima: siguienteFecha(r) });
  });
}
