import type { Movimiento, Prestamo, Tarjeta } from '../db';
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
}

export interface Costos {
  totalCentavos: number;
  interesesCentavos: number;
  comisionesCentavos: number;
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
    if (!d) porDeuda.set(clave, (d = { tipo, id, nombre, interesesCentavos: 0, comisionesCentavos: 0 }));
    return d;
  };
  const avances = { cantidad: 0, montoCentavos: 0 };

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
      const interes = m.montoCentavos - (m.capitalCentavos ?? 0);
      if (interes > 0) {
        const p = datos.prestamos.find((x) => x.id === m.prestamoId);
        deuda('prestamo', m.prestamoId, p?.nombre ?? 'Préstamo eliminado').interesesCentavos += interes;
      }
    }
  }

  const lista = [...porDeuda.values()].sort(
    (a, b) => b.interesesCentavos + b.comisionesCentavos - (a.interesesCentavos + a.comisionesCentavos),
  );
  const intereses = lista.reduce((t, d) => t + d.interesesCentavos, 0);
  const comisiones = lista.reduce((t, d) => t + d.comisionesCentavos, 0);
  return { totalCentavos: intereses + comisiones, interesesCentavos: intereses, comisionesCentavos: comisiones, porDeuda: lista, avances };
}
