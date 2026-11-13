// Todo el dinero se guarda en centavos enteros para evitar errores de redondeo.

const formato = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** 123456 -> "$1,234.56" */
export function formatearDinero(centavos: number): string {
  return formato.format(centavos / 100);
}

/** 123456 -> "1234.56" (para rellenar un campo de texto) */
export function centavosATexto(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * Convierte lo que escribe la persona a centavos.
 * Acepta "12", "12.5", "12,50", "$1,234.56". Devuelve null si no es un monto válido.
 */
export function textoACentavos(texto: string): number | null {
  let limpio = texto.replace(/[$\s]/g, '');
  if (limpio === '') return null;

  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');
  if (tienePunto && tieneComa) {
    // "1,234.56": la coma separa miles
    limpio = limpio.replace(/,/g, '');
  } else if (tieneComa) {
    // "12,50" es decimal; "1,234" son miles
    limpio = /^\d+,\d{1,2}$/.test(limpio) ? limpio.replace(',', '.') : limpio.replace(/,/g, '');
  }

  if (!/^\d*\.?\d*$/.test(limpio) || !/\d/.test(limpio)) return null;

  const [enteros = '', decimales = ''] = limpio.split('.');
  if (decimales.length > 2) return null;
  const centavos = Number(enteros || '0') * 100 + Number(decimales.padEnd(2, '0') || '0');
  return Number.isSafeInteger(centavos) ? centavos : null;
}
