import { nuevoId, type Movimiento, type Tarjeta } from '../../db';
import { aDate, diasEntre } from '../fechas';
import { sugerirCategoria } from './categorias';
import { normalizar } from './lectura';
import type { EstadoCuentaTarjeta, MovimientoEstado } from './tipos';

export interface FilaImportar {
  mov: MovimientoEstado;
  incluir: boolean;
  /**
   * Ya existe un movimiento igual en la tarjeta: mismo tipo y monto, el mismo día
   * o hasta 3 días antes o después (el banco suele publicar la compra un día o
   * dos después de hecha).
   */
  duplicado: boolean;
  /** Fecha del movimiento ya registrado, si no es la misma del estado de cuenta. */
  registradoEl?: string;
  /** Abono que no es un pago tuyo (devolución o reverso del comercio). */
  devolucion: boolean;
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
  // Movimientos de esta tarjeta que aún pueden emparejarse con una fila (cada uno una sola vez).
  const libres = tarjetaId
    ? movimientos
        .filter((m) => m.tarjetaId === tarjetaId && m.tipo !== 'ingreso')
        .map((m) => ({ tipo: m.tipo === 'gasto' ? 'cargo' : 'abono', fecha: m.fecha, monto: m.montoCentavos, usado: false }))
    : [];
  /** Primero el mismo día; si no hay, el más cercano dentro de 3 días. */
  const emparejar = (mov: MovimientoEstado) => {
    const candidatos = libres.filter((l) => !l.usado && l.tipo === mov.tipo && l.monto === mov.montoCentavos);
    const elegido =
      candidatos.find((l) => l.fecha === mov.fecha) ??
      candidatos
        .map((l) => ({ l, d: Math.abs(diasEntre(l.fecha, mov.fecha)) }))
        .filter((x) => x.d <= 3)
        .sort((a, b) => a.d - b.d)[0]?.l;
    if (elegido) elegido.usado = true;
    return elegido;
  };
  const aprendidas = new Map<string, string>();
  for (const m of [...movimientos].sort((a, b) => a.creadoEn - b.creadoEn)) {
    if (m.tipo === 'gasto' && m.nota && m.categoriaId && categoriasExistentes.has(m.categoriaId)) {
      aprendidas.set(normalizar(m.nota), m.categoriaId);
    }
  }
  // Primero se emparejan los del mismo día, para que uno cercano no se lleve el exacto de otra fila.
  const exactos = new Map<number, boolean>();
  estado.movimientos.forEach((mov, i) => {
    const l = libres.find((x) => !x.usado && x.tipo === mov.tipo && x.monto === mov.montoCentavos && x.fecha === mov.fecha);
    if (l) {
      l.usado = true;
      exactos.set(i, true);
    }
  });
  return estado.movimientos.map((mov, i) => {
    const cercano = exactos.has(i) ? undefined : emparejar(mov);
    const duplicado = exactos.has(i) || cercano !== undefined;
    const sugerida =
      mov.tipo === 'cargo' ? (aprendidas.get(normalizar(mov.concepto)) ?? sugerirCategoria(mov.concepto)) : undefined;
    return {
      mov,
      duplicado,
      registradoEl: cercano?.fecha,
      devolucion: esDevolucion(mov),
      incluir: mov.tipo === 'cargo' && !duplicado,
      categoriaId: sugerida && categoriasExistentes.has(sugerida) ? sugerida : undefined,
    };
  });
}

/** Un abono del estado de cuenta que no es un pago: devolución, reverso o crédito del comercio. */
export function esDevolucion(mov: MovimientoEstado): boolean {
  if (mov.tipo !== 'abono') return false;
  const t = normalizar(mov.concepto);
  if (/\bPAGO|\bABONO|DEPOSITO|TRANSFERENCIA|SU PAGO|BANCA|\bPAG\b/.test(t)) return false;
  return /DEVOLUCION|REVERS|REEMBOLSO|CREDITO|NOTA DE CREDITO|ANULACION|CASHBACK|BONIFICACION/.test(t);
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
    formaPago: base?.formaPago,
    ultimoEstado: {
      fechaCorte: estado.fechaCorte,
      fechaLimite: estado.fechaLimite,
      pagoContadoCentavos: estado.pagoContadoCentavos,
      pagoMinimoCentavos: estado.pagoMinimoCentavos ?? undefined,
      pagoRecomendadoCentavos: estado.pagoRecomendadoCentavos ?? undefined,
      saldoCentavos: saldo,
      disponibleCentavos: estado.disponibleCentavos ?? undefined,
      planes: estado.planes.length > 0 ? estado.planes : undefined,
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
      esDevolucion: f.devolucion || undefined,
      nota: f.mov.concepto.slice(0, 80),
      creadoEn: ahora + i,
    }));
}
