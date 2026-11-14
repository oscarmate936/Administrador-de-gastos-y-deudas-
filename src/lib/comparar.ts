import type { Movimiento, Recurrente } from '../db';
import { mesDe, moverMes } from './fechas';
import { normalizar } from './frecuentes';

// Análisis del mes: cambios por categoría respecto al mes anterior, y cuánto
// de lo que sale es fijo (se repite cada mes) y cuánto variable.

export interface Cambio {
  categoriaId: string | undefined;
  actualCentavos: number;
  anteriorCentavos: number;
  diferenciaCentavos: number;
  /** null si el mes anterior fue 0. */
  porcentaje: number | null;
}

/** Diferencia mínima para mencionar un cambio: $5. */
const MINIMO = 500;

const porCategoria = (movs: Movimiento[], mes: string) => {
  const m = new Map<string | undefined, number>();
  for (const x of movs) if (x.tipo === 'gasto' && mesDe(x.fecha) === mes) m.set(x.categoriaId, (m.get(x.categoriaId) ?? 0) + x.montoCentavos);
  return m;
};

/** Los cambios más grandes por categoría contra el mes anterior (con y sin tarjeta). */
export function cambiosContraMesAnterior(movimientos: Movimiento[], mes: string, limite = 3): Cambio[] {
  const actual = porCategoria(movimientos, mes);
  const anterior = porCategoria(movimientos, moverMes(mes, -1));
  if (anterior.size === 0) return [];
  const ids = new Set([...actual.keys(), ...anterior.keys()]);
  return [...ids]
    .map((categoriaId) => {
      const a = actual.get(categoriaId) ?? 0;
      const b = anterior.get(categoriaId) ?? 0;
      return {
        categoriaId,
        actualCentavos: a,
        anteriorCentavos: b,
        diferenciaCentavos: a - b,
        porcentaje: b > 0 ? Math.round(((a - b) / b) * 100) : null,
      };
    })
    .filter((c) => Math.abs(c.diferenciaCentavos) >= MINIMO)
    .sort((x, y) => Math.abs(y.diferenciaCentavos) - Math.abs(x.diferenciaCentavos))
    .slice(0, limite);
}

export interface FijosVariables {
  fijosCentavos: number;
  variablesCentavos: number;
  /** Nombres de lo fijo, del más grande al más chico. */
  fijos: Array<{ nombre: string; montoCentavos: number }>;
}

/** ¿Este gasto viene de una plantilla que se repite? Misma nota, o misma categoría y monto. */
function esDePlantilla(m: Movimiento, plantillas: Recurrente[]): Recurrente | undefined {
  const nota = normalizar(m.nota);
  return plantillas.find(
    (r) =>
      (r.nota.trim() !== '' && normalizar(r.nota) === nota) ||
      (r.categoriaId !== undefined && r.categoriaId === m.categoriaId && r.montoCentavos === m.montoCentavos),
  );
}

/**
 * Fijos: gastos del mes que coinciden con un movimiento que se repite y cuotas
 * de préstamos (sin abonos extra). Variables: el resto de los gastos, con y sin
 * tarjeta. Los pagos a tarjetas no cuentan: sus compras ya están en los gastos.
 */
export function fijosYVariables(
  movimientos: Movimiento[],
  recurrentes: Recurrente[],
  nombrePrestamo: (id: string) => string,
  nombreCategoria: (id: string | undefined) => string,
  mes: string,
): FijosVariables {
  const plantillas = recurrentes.filter((r) => r.tipo === 'gasto');
  const fijos = new Map<string, number>();
  let fijosCentavos = 0;
  let variablesCentavos = 0;
  for (const m of movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    if (m.tipo === 'pago' && m.prestamoId && !m.esExtra) {
      const nombre = `Cuota ${nombrePrestamo(m.prestamoId)}`;
      fijos.set(nombre, (fijos.get(nombre) ?? 0) + m.montoCentavos);
      fijosCentavos += m.montoCentavos;
    } else if (m.tipo === 'gasto') {
      const r = esDePlantilla(m, plantillas);
      if (r) {
        const nombre = r.nota.trim() || nombreCategoria(r.categoriaId);
        fijos.set(nombre, (fijos.get(nombre) ?? 0) + m.montoCentavos);
        fijosCentavos += m.montoCentavos;
      } else variablesCentavos += m.montoCentavos;
    }
  }
  return {
    fijosCentavos,
    variablesCentavos,
    fijos: [...fijos].map(([nombre, montoCentavos]) => ({ nombre, montoCentavos })).sort((a, b) => b.montoCentavos - a.montoCentavos),
  };
}
