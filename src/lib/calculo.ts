import { textoACentavos } from './dinero';

// Monto escrito con el teclado de la app: números con decimales y sumas o
// restas ("5+3.50-1"). Se guarda como texto mientras se escribe y se
// convierte a centavos al guardar.

export type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '-' | 'borrar' | 'limpiar';

const ES_OPERADOR = /[+-]/;
/** Hasta 7 cifras enteras por número ($9,999,999). */
const MAX_ENTEROS = 7;

/** El número que se está escribiendo (lo que va después del último + o −). */
function terminoActual(expr: string): string {
  const partes = expr.split(ES_OPERADOR);
  return partes[partes.length - 1];
}

/** Aplica una tecla al texto del monto. Ignora lo que formaría un monto inválido. */
export function agregarTecla(expr: string, tecla: Tecla): string {
  if (tecla === 'limpiar') return '';
  if (tecla === 'borrar') return expr.slice(0, -1);
  const ultimo = expr.slice(-1);

  if (tecla === '+' || tecla === '-') {
    if (expr === '') return '';
    if (ES_OPERADOR.test(ultimo)) return expr.slice(0, -1) + tecla;
    if (ultimo === '.') return expr.slice(0, -1) + tecla;
    return expr + tecla;
  }

  const termino = terminoActual(expr);
  if (tecla === '.') {
    if (termino.includes('.')) return expr;
    return expr + (termino === '' ? '0.' : '.');
  }

  // Un dígito
  const [enteros, decimales] = termino.split('.');
  if (decimales !== undefined) return decimales.length >= 2 ? expr : expr + tecla;
  if (enteros === '0') return expr.slice(0, -1) + tecla;
  if (enteros.length >= MAX_ENTEROS) return expr;
  return expr + tecla;
}

/** true si el texto tiene una suma o resta (para mostrar el resultado). */
export function tieneOperacion(expr: string): boolean {
  return ES_OPERADOR.test(expr.replace(/[+-]$/, ''));
}

/**
 * Resultado en centavos, o null si no es un monto válido mayor que cero.
 * Un + o − al final se ignora ("5+" vale 5).
 */
export function evaluarMonto(expr: string): number | null {
  const limpio = expr.replace(/\s/g, '').replace(/[+-]$/, '');
  if (limpio === '' || /^[+-]/.test(limpio)) return null;
  const terminos = limpio.match(/[+-]?[^+-]+/g);
  if (!terminos) return null;
  let total = 0;
  for (const t of terminos) {
    const signo = t.startsWith('-') ? -1 : 1;
    const centavos = textoACentavos(t.replace(/^[+-]/, ''));
    if (centavos === null) return null;
    total += signo * centavos;
  }
  return total > 0 ? total : null;
}

/** El texto como se muestra: "5 + 3.50 − 1". */
export function mostrarExpresion(expr: string): string {
  return expr.replace(/\+/g, ' + ').replace(/-/g, ' − ');
}
