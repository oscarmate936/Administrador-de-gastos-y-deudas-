import { normalizar } from '../estados/lectura';
import { aDate, aFechaTexto, sumarDias } from '../fechas';
import { fechaConDia } from '../deudas';

// Piezas para entender frases en español: montos, fechas y periodos.

const NUMEROS: Record<string, number> = {
  UN: 1, UNO: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10,
  QUINCE: 15, VEINTE: 20, VEINTICINCO: 25, TREINTA: 30, CUARENTA: 40, CINCUENTA: 50, CIEN: 100,
};

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

export interface Fragmento<T> {
  valor: T;
  /** El texto normalizado sin la parte reconocida. */
  resto: string;
}

/** Busca una fecha dicha en la frase ("ayer", "el lunes", "el 5", "5 de noviembre", "05/11"). */
export function extraerFecha(t: string, hoy: string): Fragmento<string> | null {
  const quitar = (m: RegExpExecArray) => t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  let m = /\b(ANTEAYER|ANTIER|ANTE AYER)\b/.exec(t);
  if (m) return { valor: sumarDias(hoy, -2), resto: quitar(m) };
  m = /\bAYER\b/.exec(t);
  if (m) return { valor: sumarDias(hoy, -1), resto: quitar(m) };
  m = /\bHOY\b/.exec(t);
  if (m) return { valor: hoy, resto: quitar(m) };
  // "hace 2 días", "hace una semana"
  m = new RegExp(`\\bHACE\\s+(\\d{1,2}|${Object.keys(NUMEROS).join('|')}|UNA)\\s+(DIAS?|SEMANAS?)\\b`).exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === 'UNA' ? 1 : NUMEROS[m[1]];
    return { valor: sumarDias(hoy, -n * (m[2].startsWith('SEMANA') ? 7 : 1)), resto: quitar(m) };
  }
  m = new RegExp(`\\b(?:EL\\s+)?(${DIAS_SEMANA.join('|')})(?:\\s+PASADO)?\\b`).exec(t);
  if (m) {
    const objetivo = DIAS_SEMANA.indexOf(m[1]);
    const dia = aDate(hoy).getDay();
    return { valor: sumarDias(hoy, -((dia - objetivo + 7) % 7)), resto: quitar(m) };
  }
  m = new RegExp(`\\b(?:EL\\s+)?(\\d{1,2})\\s+DE\\s+(${MESES.join('|')})(?:\\s+(?:DE\\s+)?(\\d{4}))?\\b`).exec(t);
  if (m) {
    const mes = MESES.indexOf(m[2]);
    let anio = m[3] ? Number(m[3]) : aDate(hoy).getFullYear();
    let f = fechaConDia(anio, mes, Number(m[1]));
    if (!m[3] && f > hoy) f = fechaConDia(--anio, mes, Number(m[1]));
    return { valor: f, resto: quitar(m) };
  }
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/.exec(t);
  if (m) {
    const h = aDate(hoy);
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : h.getFullYear();
    return { valor: fechaConDia(anio, Number(m[2]) - 1, Number(m[1])), resto: quitar(m) };
  }
  m = /\bEL\s+(?:DIA\s+)?(\d{1,2})\b(?!\s*(?:DOLAR|\$|USD|\.|,\d))/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    const h = aDate(hoy);
    let f = fechaConDia(h.getFullYear(), h.getMonth(), Number(m[1]));
    if (f > hoy) f = fechaConDia(h.getFullYear(), h.getMonth() - 1, Number(m[1]));
    return { valor: f, resto: quitar(m) };
  }
  return null;
}

/** Primer monto de la frase: "12.50", "12,50", "$12", "1,250.75", "20 dolares", "veinte dolares". */
export function extraerMonto(t: string): Fragmento<number> | null {
  const sinTarjeta = t.replace(/\bTERMINADA EN \d{4}\b/g, ' ');
  // "1.500" (punto y tres cifras) son miles, como "1,500".
  let m = /\$?\s?\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b(?:\s*(?:DOLARES|DOLAR|USD|PESOS))?/.exec(sinTarjeta);
  if (m) {
    let num = m[1];
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(num)) num = num.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{1,2}$/.test(num)) num = num.replace(',', '.');
    num = num.replace(/,/g, '');
    const [ent, dec = ''] = num.split('.');
    const centavos = Number(ent) * 100 + Number(dec.padEnd(2, '0') || '0');
    if (centavos > 0) return { valor: centavos, resto: sinTarjeta.slice(0, m.index) + ' ' + sinTarjeta.slice(m.index + m[0].length) };
  }
  m = new RegExp(`\\b(${Object.keys(NUMEROS).join('|')})\\s+(?:DOLARES|DOLAR)\\b`).exec(sinTarjeta);
  if (m) return { valor: NUMEROS[m[1]] * 100, resto: sinTarjeta.slice(0, m.index) + ' ' + sinTarjeta.slice(m.index + m[0].length) };
  return null;
}

export interface Periodo {
  desde: string;
  hasta: string;
  /** Para la respuesta: "este mes", "en octubre". */
  nombre: string;
}

/** Periodo de una pregunta; por defecto este mes. */
export function extraerPeriodo(t: string, hoy: string): Periodo {
  const h = aDate(hoy);
  const inicioMes = (anio: number, mes: number) => aFechaTexto(new Date(anio, mes, 1));
  const finMes = (anio: number, mes: number) => aFechaTexto(new Date(anio, mes + 1, 0));
  if (/\bHOY\b/.test(t)) return { desde: hoy, hasta: hoy, nombre: 'hoy' };
  if (/\bAYER\b/.test(t)) return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1), nombre: 'ayer' };
  if (/SEMANA PASADA/.test(t)) {
    const lunes = sumarDias(hoy, -((h.getDay() + 6) % 7) - 7);
    return { desde: lunes, hasta: sumarDias(lunes, 6), nombre: 'la semana pasada' };
  }
  if (/\bSEMANA\b/.test(t)) return { desde: sumarDias(hoy, -((h.getDay() + 6) % 7)), hasta: hoy, nombre: 'esta semana' };
  if (/MES PASADO/.test(t)) {
    return { desde: inicioMes(h.getFullYear(), h.getMonth() - 1), hasta: finMes(h.getFullYear(), h.getMonth() - 1), nombre: 'el mes pasado' };
  }
  if (/\b(ESTE ANO|ESTE AÑO|EN EL ANO|EN EL AÑO)\b/.test(t)) return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, nombre: 'este año' };
  const m = new RegExp(`\\b(${MESES.join('|')})\\b`).exec(t);
  if (m) {
    const mes = MESES.indexOf(m[1]);
    const anio = mes > h.getMonth() ? h.getFullYear() - 1 : h.getFullYear();
    return { desde: inicioMes(anio, mes), hasta: finMes(anio, mes), nombre: `en ${m[1].toLowerCase()}` };
  }
  return { desde: inicioMes(h.getFullYear(), h.getMonth()), hasta: hoy, nombre: 'este mes' };
}

export const normal = normalizar;
