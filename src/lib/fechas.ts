// Las fechas se guardan como texto "AAAA-MM-DD" en hora local.
// No se usa toISOString() porque convierte a UTC y de noche cambiaría el día.

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export function aFechaTexto(d: Date): string {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

export function hoy(): string {
  return aFechaTexto(new Date());
}

export function aDate(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  return aFechaTexto(aDate(fecha)) === fecha;
}

/** Días completos entre dos fechas (hasta - desde). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = aDate(hasta).getTime() - aDate(desde).getTime();
  return Math.round(ms / 86_400_000);
}

/** "2026-11" a partir de "2026-11-13" */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}`;
}

const fmtDiaCorto = new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short' });
const fmtDiaLargo = new Intl.DateTimeFormat('es-SV', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtMes = new Intl.DateTimeFormat('es-SV', { month: 'long', year: 'numeric' });

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "5 nov" */
export function fechaCorta(fecha: string): string {
  return fmtDiaCorto.format(aDate(fecha));
}

/** "Hoy", "Ayer" o "Jueves, 5 de noviembre" */
export function fechaRelativa(fecha: string, referencia: string = hoy()): string {
  const dias = diasEntre(fecha, referencia);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return mayuscula(fmtDiaLargo.format(aDate(fecha)));
}

/** "Noviembre de 2026" */
export function nombreMes(mes: string): string {
  return mayuscula(fmtMes.format(aDate(`${mes}-01`)));
}

/** "hoy", "ayer", "hace 8 días" */
export function haceCuanto(fecha: string, referencia: string = hoy()): string {
  const dias = diasEntre(fecha, referencia);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

const fmtMesCorto = new Intl.DateTimeFormat('es-SV', { month: 'short', year: 'numeric' });

/** "sep 2027" */
export function mesCorto(fecha: string): string {
  return fmtMesCorto.format(aDate(fecha));
}

/** Para vencimientos: "hoy", "mañana", "faltan 5 días", "venció ayer", "venció hace 3 días". */
export function textoFaltan(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias > 1) return `faltan ${dias} días`;
  if (dias === -1) return 'venció ayer';
  return `venció hace ${-dias} días`;
}
