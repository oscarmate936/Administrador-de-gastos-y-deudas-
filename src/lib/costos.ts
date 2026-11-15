import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { cargosConSaldo, factorCargos } from './deudas';
import { normalizar } from './estados/lectura';

// Cuánto cuestan las deudas: intereses, comisiones e IVA de las tarjetas
// (cargos en la categoría "Intereses y comisiones") y la parte de intereses de
// las cuotas de préstamos.

export interface CostoDeuda {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  nombre: string;
  interesesCentavos: number;
  comisionesCentavos: number;
  /** Seguros y otros cargos de las cuotas de préstamos (aparte de los intereses). */
  segurosCentavos: number;
}

export interface Costos {
  /** Intereses y comisiones (sin los seguros). */
  totalCentavos: number;
  interesesCentavos: number;
  comisionesCentavos: number;
  /** Seguros y otros cargos de los préstamos: no son intereses, pero tampoco bajan la deuda. */
  segurosCentavos: number;
  porDeuda: CostoDeuda[];
  /** Avances de efectivo con tarjeta: generan comisión e intereses desde el primer día. */
  avances: { cantidad: number; montoCentavos: number };
}

const ES_INTERES = /INTERES/;
const ES_AVANCE = /(AVANCE|ADELANTO|RETIRO) DE EFECTIVO/;

/** Costos con fecha entre `desde` y `hasta`, ambos incluidos. */
export function costosEntre(
  datos: { movimientos: Movimiento[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
  desde: string,
  hasta: string,
): Costos {
  const enRango = datos.movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const porDeuda = new Map<string, CostoDeuda>();
  const deuda = (tipo: 'tarjeta' | 'prestamo', id: string, nombre: string) => {
    const clave = `${tipo}:${id}`;
    let d = porDeuda.get(clave);
    if (!d) porDeuda.set(clave, (d = { tipo, id, nombre, interesesCentavos: 0, comisionesCentavos: 0, segurosCentavos: 0 }));
    return d;
  };
  const avances = { cantidad: 0, montoCentavos: 0 };
  const segurosEstimados = estimarSeguros(datos.movimientos, datos.prestamos);

  for (const m of enRango) {
    if (m.tipo === 'gasto' && m.tarjetaId) {
      const nota = normalizar(m.nota);
      const t = datos.tarjetas.find((x) => x.id === m.tarjetaId);
      if (m.categoriaId === 'intereses') {
        const d = deuda('tarjeta', m.tarjetaId, t?.nombre ?? 'Tarjeta eliminada');
        if (ES_INTERES.test(nota)) d.interesesCentavos += m.montoCentavos;
        else d.comisionesCentavos += m.montoCentavos;
      } else if (ES_AVANCE.test(nota) && !/^CARGO POR/.test(nota)) {
        avances.cantidad += 1;
        avances.montoCentavos += m.montoCentavos;
      }
    }
    if (m.tipo === 'pago' && m.prestamoId) {
      const noCapital = m.montoCentavos - (m.capitalCentavos ?? 0);
      if (noCapital > 0) {
        const p = datos.prestamos.find((x) => x.id === m.prestamoId);
        const seguros = Math.min(noCapital, m.cargosCentavos ?? segurosEstimados.get(m.id) ?? 0);
        const d = deuda('prestamo', m.prestamoId, p?.nombre ?? 'Préstamo eliminado');
        d.interesesCentavos += noCapital - seguros;
        d.segurosCentavos += seguros;
      }
    }
  }

  const lista = [...porDeuda.values()]
    .filter((d) => d.interesesCentavos + d.comisionesCentavos + d.segurosCentavos > 0)
    .sort((a, b) => b.interesesCentavos + b.comisionesCentavos - (a.interesesCentavos + a.comisionesCentavos));
  const intereses = lista.reduce((t, d) => t + d.interesesCentavos, 0);
  const comisiones = lista.reduce((t, d) => t + d.comisionesCentavos, 0);
  const seguros = lista.reduce((t, d) => t + d.segurosCentavos, 0);
  return {
    totalCentavos: intereses + comisiones,
    interesesCentavos: intereses,
    comisionesCentavos: comisiones,
    segurosCentavos: seguros,
    porDeuda: lista,
    avances,
  };
}

/**
 * Seguros de los pagos de préstamos guardados antes de que se anotaran: la
 * parte del saldo que cobra el préstamo (factorCargos) sobre el saldo que había
 * antes de cada pago.
 */
function estimarSeguros(movimientos: Movimiento[], prestamos: Prestamo[]): Map<string, number> {
  const estimados = new Map<string, number>();
  for (const p of prestamos) {
    const factor = factorCargos(p);
    if (factor === 0) continue;
    let saldo = p.saldoInicialCentavos;
    const pagos = movimientos
      .filter((m) => m.tipo === 'pago' && m.prestamoId === p.id)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn - b.creadoEn);
    for (const m of pagos) {
      if (!m.esExtra && m.cargosCentavos === undefined) estimados.set(m.id, cargosConSaldo(saldo, factor));
      saldo = Math.max(0, saldo - (m.capitalCentavos ?? 0));
    }
  }
  return estimados;
}
