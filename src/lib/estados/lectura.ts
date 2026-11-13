import { textoACentavos } from '../dinero';
import { esFechaValida } from '../fechas';
import type { Item } from './tipos';

// Herramientas para encontrar datos en el texto de un PDF a partir de su posición.

/** Mayúsculas, sin tildes y con espacios simples, para comparar etiquetas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2,468.10", "$ 215.50", "-10.00" -> centavos (con signo). Exige dos decimales. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, '');
  const m = /^(-?)(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/.exec(limpio);
  if (!m) return null;
  const centavos = textoACentavos(`${m[2]}.${m[3]}`);
  if (centavos === null) return null;
  return m[1] === '-' ? -centavos : centavos;
}

const MESES: Record<string, string> = {
  ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
  JUL: '07', AGO: '08', SEP: '09', SET: '09', OCT: '10', NOV: '11', DIC: '12',
};

/** "08/11/2026" o "03 DIC 2026" -> "2026-11-08". */
export function leerFecha(texto: string): string | null {
  const t = normalizar(texto);
  let a: string, m: string | undefined, d: string;
  let r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (r) {
    [, d, m, a] = r;
  } else {
    r = /^(\d{1,2})[ -]([A-Z]{3})[A-Z]*[ -](\d{4})$/.exec(t);
    if (!r) return null;
    d = r[1];
    m = MESES[r[2]];
    a = r[3];
    if (!m) return null;
  }
  const fecha = `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return esFechaValida(fecha) ? fecha : null;
}

/** "39.90% ANUAL", "47.00" -> 39.9 / 47. */
export function leerTasa(texto: string): number | null {
  const m = /^(\d{1,3}(?:\.\d+)?)\s*%?(?:\s*ANUAL)?$/.exec(normalizar(texto));
  if (!m) return null;
  const tasa = Number(m[1]);
  return tasa <= 200 ? tasa : null;
}

const centro = (i: Item) => i.x + i.ancho / 2;

/** Orden de lectura: de arriba hacia abajo y de izquierda a derecha. */
export const ordenLectura = (a: Item, b: Item) => b.y - a.y || a.x - b.x;

export interface Renglon {
  y: number;
  items: Item[];
}

/** Agrupa los fragmentos en renglones (misma altura, con tolerancia) ordenados de arriba hacia abajo. */
export function renglones(items: Item[], tolerancia = 2.5): Renglon[] {
  const lista: Renglon[] = [];
  for (const it of [...items].sort(ordenLectura)) {
    const r = lista.find((l) => Math.abs(l.y - it.y) <= tolerancia);
    if (r) r.items.push(it);
    else lista.push({ y: it.y, items: [it] });
  }
  for (const r of lista) r.items.sort((a, b) => a.x - b.x);
  return lista.sort((a, b) => b.y - a.y);
}

/**
 * Busca la etiqueta y devuelve el primer valor legible a su derecha, en el
 * mismo renglón y antes de la siguiente etiqueta. Si no lo hay, lo busca un poco
 * arriba o abajo (algunos bancos lo imprimen desfasado), dentro de esa misma columna.
 * Prueba las etiquetas en orden de lectura y devuelve el primer valor que encuentra.
 */
export function buscarValor<T>(items: Item[], etiqueta: RegExp, leer: (texto: string) => T | null): T | null {
  const etiquetas = items.filter((i) => etiqueta.test(normalizar(i.texto))).sort(ordenLectura);
  for (const e of etiquetas) {
    // El valor de una etiqueta nunca está a más de ~150 puntos: más allá empieza otra columna.
    let limiteX = e.x + 150;
    const mismoRenglon = items
      .filter((i) => i !== e && Math.abs(i.y - e.y) <= 2.5 && i.x > e.x && i.x < limiteX)
      .sort((a, b) => a.x - b.x);
    for (const i of mismoRenglon) {
      const valor = leer(i.texto);
      if (valor !== null) return valor;
      limiteX = i.x;
      break;
    }
    const cerca = items
      .filter((i) => i !== e && Math.abs(i.y - e.y) > 2.5 && Math.abs(i.y - e.y) <= 5 && i.x > e.x && i.x < limiteX)
      .map((i) => ({ i, valor: leer(i.texto) }))
      .filter((c) => c.valor !== null)
      .sort((a, b) => Math.abs(a.i.y - e.y) - Math.abs(b.i.y - e.y) || a.i.x - b.i.x);
    if (cerca.length > 0) return cerca[0].valor;
  }
  return null;
}

/** Todos los montos a la derecha de la etiqueta en su mismo renglón, en orden. */
export function montosDelRenglon(items: Item[], etiqueta: RegExp): number[] | null {
  const e = items.filter((i) => etiqueta.test(normalizar(i.texto))).sort(ordenLectura)[0];
  if (!e) return null;
  return items
    .filter((i) => Math.abs(i.y - e.y) <= 2.5 && i.x > e.x)
    .sort((a, b) => a.x - b.x)
    .map((i) => leerMonto(i.texto))
    .filter((m): m is number => m !== null);
}

export interface Columnas {
  /** Altura del encabezado de la tabla. */
  y: number;
  xFecha: number;
  xAutorizacion: number | null;
  centroCargos: number;
  centroAbonos: number;
}

/** Encuentra el encabezado de la tabla de movimientos (columnas CARGOS y ABONOS). */
export function columnasMovimientos(items: Item[]): Columnas | null {
  const cargos = items.find((i) => normalizar(i.texto) === 'CARGOS');
  if (!cargos) return null;
  const abonos = items.find((i) => normalizar(i.texto) === 'ABONOS' && Math.abs(i.y - cargos.y) <= 3);
  if (!abonos) return null;
  const cercaDelEncabezado = (i: Item) => Math.abs(i.y - cargos.y) <= 9;
  const fechas = items.filter((i) => cercaDelEncabezado(i) && /^FECHA/.test(normalizar(i.texto))).sort((a, b) => a.x - b.x);
  if (fechas.length === 0) return null;
  const autorizacion = items.find((i) => cercaDelEncabezado(i) && /AUTORIZACION/.test(normalizar(i.texto)));
  return {
    y: cargos.y,
    xFecha: fechas[0].x,
    xAutorizacion: autorizacion?.x ?? null,
    centroCargos: centro(cargos),
    centroAbonos: centro(abonos),
  };
}

const FIN_DE_TABLA = /^(RESUMEN DE|TOTAL TRANSACCIONES|DESGLOSE|-{5,})/;

/** Lee las filas de la tabla de movimientos que hay debajo del encabezado. */
export function leerMovimientos(items: Item[], c: Columnas) {
  const frontera = (c.centroCargos + c.centroAbonos) / 2;
  const movimientos: Array<{ fecha: string; concepto: string; montoCentavos: number; tipo: 'cargo' | 'abono' }> = [];
  for (const r of renglones(items.filter((i) => i.y < c.y - 2))) {
    if (r.items.some((i) => FIN_DE_TABLA.test(normalizar(i.texto)) && i.x > c.xFecha - 20)) break;
    const fechaItem = r.items.find((i) => Math.abs(i.x - c.xFecha) <= 30 && leerFecha(i.texto));
    if (!fechaItem) continue;
    const montos = r.items
      .filter((i) => centro(i) > c.centroCargos - 45)
      .map((i) => ({ i, m: leerMonto(i.texto) }))
      .filter((x): x is { i: Item; m: number } => x.m !== null && x.m !== 0);
    if (montos.length === 0) continue;
    const concepto = r.items
      .filter(
        (i) =>
          i.x > fechaItem.x + 30 &&
          centro(i) < c.centroCargos - 45 &&
          !leerFecha(i.texto) &&
          leerMonto(i.texto) === null &&
          i.texto.trim() !== '$' &&
          (c.xAutorizacion === null || Math.abs(i.x - c.xAutorizacion) > 25),
      )
      .map((i) => i.texto.trim())
      .join(' ')
      .replace(/\s+/g, ' ');
    for (const { i, m } of montos) {
      const enAbonos = centro(i) > frontera;
      // Un monto negativo en una columna es un movimiento del tipo contrario (por ejemplo, una reversión).
      const tipo = enAbonos !== m < 0 ? 'abono' : 'cargo';
      movimientos.push({ fecha: leerFecha(fechaItem.texto)!, concepto, montoCentavos: Math.abs(m), tipo });
    }
  }
  return movimientos;
}
