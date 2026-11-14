// Combina lo leído por los dos motores de reconocimiento.

export interface Lectura<T> {
  valor: T | undefined;
  /** Los motores leyeron cosas distintas: hay que confirmarlo. */
  dudoso: boolean;
  /** La otra lectura, cuando es dudoso. */
  alternativa?: T;
}

/**
 * Si los dos motores coinciden, el dato es confiable. Si solo uno lo leyó, se
 * usa ese. Si leyeron distinto, se prefiere `preferido` y se marca como dudoso.
 */
export function combinar<T>(preferido: T | undefined | null, otro: T | undefined | null): Lectura<T> {
  const a = preferido ?? undefined;
  const b = otro ?? undefined;
  if (a === undefined) return { valor: b, dudoso: false };
  if (b === undefined || a === b) return { valor: a, dudoso: false };
  return { valor: a, dudoso: true, alternativa: b };
}
