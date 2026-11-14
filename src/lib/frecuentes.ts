import type { Movimiento } from '../db';
import { sumarDias } from './fechas';

// Lo que más usas, primero: orden de categorías y tarjetas por uso reciente, y
// lo que elegiste la última vez para un mismo comercio o nota.

/** Días hacia atrás que cuentan como "uso reciente". */
const DIAS_RECIENTES = 90;

/** Texto comparable: minúsculas, sin tildes ni espacios repetidos. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function gastosRecientes(movimientos: Movimiento[], hoy: string): Movimiento[] {
  const desde = sumarDias(hoy, -DIAS_RECIENTES);
  return movimientos.filter((m) => m.tipo === 'gasto' && m.fecha >= desde && m.fecha <= hoy);
}

/**
 * Ordena por cuántas veces se usó cada id en los gastos recientes, de más a
 * menos. Los que se usan igual (o nunca) conservan su orden original.
 */
export function ordenarPorUso<T extends { id: string }>(
  items: T[],
  movimientos: Movimiento[],
  hoy: string,
  campo: 'categoriaId' | 'tarjetaId',
): T[] {
  const usos = new Map<string, number>();
  for (const m of gastosRecientes(movimientos, hoy)) {
    const id = m[campo];
    if (id) usos.set(id, (usos.get(id) ?? 0) + 1);
  }
  return items
    .map((item, i) => ({ item, i, n: usos.get(item.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.item);
}

/** Más reciente primero: por fecha y, el mismo día, por cuándo se registró. */
const masReciente = (a: Movimiento, b: Movimiento) => b.fecha.localeCompare(a.fecha) || b.creadoEn - a.creadoEn;

export interface Recuerdo {
  categoriaId?: string;
  /** undefined = efectivo o débito. */
  tarjetaId?: string;
}

/**
 * Lo que se eligió la última vez para la misma nota (sin importar mayúsculas
 * ni tildes). null si la nota es muy corta o no hay un gasto anterior con ella.
 */
export function recordarComercio(movimientos: Movimiento[], nota: string, excepto?: string): Recuerdo | null {
  const clave = normalizar(nota);
  if (clave.length < 3) return null;
  const anterior = movimientos
    .filter((m) => m.tipo === 'gasto' && m.id !== excepto && normalizar(m.nota) === clave)
    .sort(masReciente)[0];
  return anterior ? { categoriaId: anterior.categoriaId, tarjetaId: anterior.tarjetaId } : null;
}

/** Notas de gastos usadas antes, la más reciente primero y sin repetir, para sugerir al escribir. */
export function notasRecientes(movimientos: Movimiento[], limite = 30): string[] {
  const vistas = new Set<string>();
  const lista: string[] = [];
  for (const m of [...movimientos].filter((x) => x.tipo === 'gasto' && x.nota.trim()).sort(masReciente)) {
    const clave = normalizar(m.nota);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    lista.push(m.nota.trim());
    if (lista.length >= limite) break;
  }
  return lista;
}
