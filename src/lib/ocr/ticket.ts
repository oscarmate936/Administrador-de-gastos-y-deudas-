import { normalizar } from '../estados/lectura';
import { esFechaValida } from '../fechas';

// Interpreta el texto que el reconocimiento óptico saca de la foto de un
// ticket o de una captura de la app del banco. El resultado siempre se revisa
// en el formulario antes de guardar.

export interface DatosTicket {
  montoCentavos: number | null;
  fecha: string | null;
  comercio: string | null;
}

/** "1,234.56", "1.234,56", "25,50", "$ 25.50" -> centavos. Exige dos decimales. */
export function leerImporte(texto: string): number | null {
  const t = texto.replace(/[$\s]/g, '').replace(/[oO]/g, '0');
  let m = /^(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})$/.exec(t);
  if (m) return Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]);
  m = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/.exec(t);
  if (m) return Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]);
  return null;
}

const IMPORTE = /\$?\s?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b|\$?\s?\d+[.,]\d{2}\b/g;

function importesDe(linea: string): number[] {
  return (linea.match(IMPORTE) ?? []).map(leerImporte).filter((n): n is number => n !== null && n > 0);
}

const MESES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
};

/** Primera fecha válida del texto que no sea futura ni de hace más de un año. */
export function buscarFecha(texto: string, hoy: string): string | null {
  const t = normalizar(texto);
  const candidatas: string[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    candidatas.push(`${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s?(?:DE\s)?([A-Z]{3})[A-Z]*\.?\s?(?:DE\s)?(\d{4})\b/g)) {
    const mes = MESES[m[2]];
    if (mes) candidatas.push(`${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  const haceUnAnio = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`;
  return candidatas.find((f) => esFechaValida(f) && f <= hoy && f >= haceUnAnio) ?? null;
}

const NO_ES_COMERCIO =
  /^(FACTURA|TICKET|COMPROBANTE|CREDITO FISCAL|CONSUMIDOR FINAL|NIT|NRC|DUI|GIRO|CAJA|CAJERO|FECHA|HORA|SUCURSAL|DIRECCION|TEL|RESOLUCION|SERIE|DOCUMENTO|CLIENTE|GRACIAS|BIENVENIDO|COPIA|ORIGINAL|\d)/;

export function leerTicket(texto: string, hoy: string): DatosTicket {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const plano = lineas.join(' ');

  // Capturas de la app del banco: "Compra por $25.00 en SUPER SELECTOS".
  const app = /(?:COMPRA|PAGO|CARGO|TRANSACCION)[^$\d]{0,40}?\$?\s?(\d[\d.,]*[.,]\d{2})\s+(?:EN|A)\s+([A-Z0-9*&.' -]{3,40})/i.exec(plano);
  if (app) {
    return {
      montoCentavos: leerImporte(app[1]),
      fecha: buscarFecha(plano, hoy),
      comercio: app[2].trim().replace(/\s+(EL|CON|POR|A LAS)\b.*$/i, ''),
    };
  }

  // Tickets: la última línea de total (sin "SUBTOTAL"); si no hay, el importe mayor.
  let monto: number | null = null;
  for (const linea of lineas) {
    const n = normalizar(linea);
    if (/\b(TOTAL|A PAGAR|IMPORTE|TOTAL A PAGAR|VENTA TOTAL|MONTO)\b/.test(n) && !/SUB\s?TOTAL|TOTAL ITEMS|ARTICULOS|EXENTA|GRAVADA|IVA\b/.test(n)) {
      const importes = importesDe(linea);
      if (importes.length > 0) monto = importes[importes.length - 1];
    }
  }
  if (monto === null) {
    const todos = lineas.flatMap(importesDe);
    monto = todos.length > 0 ? Math.max(...todos) : null;
  }

  const comercio =
    lineas.find((l) => {
      const n = normalizar(l);
      return (n.match(/[A-Z]/g) ?? []).length >= 3 && !NO_ES_COMERCIO.test(n) && importesDe(l).length === 0;
    }) ?? null;

  return { montoCentavos: monto, fecha: buscarFecha(plano, hoy), comercio: comercio ? comercio.slice(0, 60) : null };
}
