import { nuevoId, type Movimiento, type Tarjeta } from '../../db';
import { aDate } from '../fechas';
import { sugerirCategoria } from './categorias';
import { normalizar } from './lectura';
import type { EstadoCuentaTarjeta, MovimientoEstado } from './tipos';

export interface FilaImportar {
  mov: MovimientoEstado;
  incluir: boolean;
  /** Ya existe un movimiento igual (misma tarjeta, fecha, monto y tipo). */
  duplicado: boolean;
  categoriaId?: string;
}

/** La tarjeta registrada con los mismos últimos 4 dígitos, si existe. */
export function buscarTarjeta(estado: EstadoCuentaTarjeta, tarjetas: Tarjeta[]): Tarjeta | undefined {
  return estado.ultimos4 ? tarjetas.find((t) => t.ultimos4 === estado.ultimos4) : undefined;
}

/** true si la tarjeta ya tiene datos de un corte posterior al de este estado de cuenta. */
export function esEstadoViejo(estado: EstadoCuentaTarjeta, tarjeta: Tarjeta | undefined): boolean {
  return tarjeta !== undefined && tarjeta.fechaSaldo > estado.fechaCorte;
}

/**
 * Filas para la pantalla de revisión. Los cargos se proponen marcados y con
 * categoría sugerida; los abonos (pagos a la tarjeta) sin marcar, porque
 * restarían del disponible y suelen estar ya registrados. Lo que ya existe en
 * la tarjeta se marca como duplicado, contando repeticiones (tres cargos iguales
 * el mismo día solo coinciden con tres registrados).
 *
 * La categoría propuesta es la que la persona usó la última vez para ese mismo
 * comercio; si nunca lo categorizó, la de las reglas generales.
 */
export function prepararFilas(
  estado: EstadoCuentaTarjeta,
  movimientos: Movimiento[],
  tarjetaId: string | undefined,
  categoriasExistentes: Set<string>,
): FilaImportar[] {
  const clave = (tipo: string, fecha: string, monto: number) => `${tipo}|${fecha}|${monto}`;
  const disponibles = new Map<string, number>();
  if (tarjetaId) {
    for (const m of movimientos) {
      if (m.tarjetaId !== tarjetaId || m.tipo === 'ingreso') continue;
      const k = clave(m.tipo === 'gasto' ? 'cargo' : 'abono', m.fecha, m.montoCentavos);
      disponibles.set(k, (disponibles.get(k) ?? 0) + 1);
    }
  }
  const aprendidas = new Map<string, string>();
  for (const m of [...movimientos].sort((a, b) => a.creadoEn - b.creadoEn)) {
    if (m.tipo === 'gasto' && m.nota && m.categoriaId && categoriasExistentes.has(m.categoriaId)) {
      aprendidas.set(normalizar(m.nota), m.categoriaId);
    }
  }
  return estado.movimientos.map((mov) => {
    const k = clave(mov.tipo, mov.fecha, mov.montoCentavos);
    const quedan = disponibles.get(k) ?? 0;
    const duplicado = quedan > 0;
    if (duplicado) disponibles.set(k, quedan - 1);
    const sugerida =
      mov.tipo === 'cargo' ? (aprendidas.get(normalizar(mov.concepto)) ?? sugerirCategoria(mov.concepto)) : undefined;
    return {
      mov,
      duplicado,
      incluir: mov.tipo === 'cargo' && !duplicado,
      categoriaId: sugerida && categoriasExistentes.has(sugerida) ? sugerida : undefined,
    };
  });
}

/** "Mastercard Clasica ···1234" */
export function nombreSugerido(estado: EstadoCuentaTarjeta): string {
  return estado.ultimos4 ? `${estado.producto} ···${estado.ultimos4}` : estado.producto;
}

/**
 * La tarjeta con los datos del estado de cuenta. Si es nueva se crea; si existe,
 * se actualiza. Un estado de cuenta más viejo que lo que ya tiene la tarjeta no
 * cambia sus saldos.
 */
export function tarjetaDesdeEstado(
  estado: EstadoCuentaTarjeta,
  base: Tarjeta | undefined,
  datos: { nombre: string; color: string },
): Tarjeta {
  if (base && esEstadoViejo(estado, base)) return { ...base, ultimos4: base.ultimos4 ?? estado.ultimos4 ?? undefined };
  const saldo = Math.max(0, estado.saldoCentavos);
  return {
    id: base?.id ?? nuevoId(),
    nombre: base?.nombre ?? (datos.nombre.trim() || nombreSugerido(estado)),
    banco: estado.banco,
    limiteCentavos: estado.limiteCentavos ?? base?.limiteCentavos ?? 0,
    diaCorte: aDate(estado.fechaCorte).getDate(),
    diaPago: aDate(estado.fechaLimite).getDate(),
    saldoInicialCentavos: saldo,
    pendienteInicialCentavos: Math.min(saldo, estado.pagoContadoCentavos),
    // El estado de cuenta incluye todo hasta el día de corte.
    fechaSaldo: estado.fechaCorte,
    color: base?.color ?? datos.color,
    creadoEn: base?.creadoEn ?? Date.now(),
    ultimos4: estado.ultimos4 ?? base?.ultimos4,
    tasaAnual: estado.tasaAnual ?? base?.tasaAnual,
    ultimoEstado: {
      fechaCorte: estado.fechaCorte,
      fechaLimite: estado.fechaLimite,
      pagoContadoCentavos: estado.pagoContadoCentavos,
      pagoMinimoCentavos: estado.pagoMinimoCentavos ?? undefined,
      saldoCentavos: saldo,
      disponibleCentavos: estado.disponibleCentavos ?? undefined,
    },
  };
}

/**
 * Movimientos a guardar. Los cargos quedan como gastos con tarjeta y los abonos
 * como pagos a la tarjeta. Como son de la fecha de corte o antes, no cambian la
 * deuda (ya está en el saldo del estado de cuenta): sirven de historial.
 */
export function movimientosDesdeFilas(filas: FilaImportar[], tarjetaId: string, ahora = Date.now()): Movimiento[] {
  return filas
    .filter((f) => f.incluir)
    .map((f, i) => ({
      id: nuevoId(),
      tipo: f.mov.tipo === 'cargo' ? ('gasto' as const) : ('pago' as const),
      montoCentavos: f.mov.montoCentavos,
      fecha: f.mov.fecha,
      categoriaId: f.mov.tipo === 'cargo' ? f.categoriaId : undefined,
      tarjetaId,
      nota: f.mov.concepto.slice(0, 80),
      creadoEn: ahora + i,
    }));
}
