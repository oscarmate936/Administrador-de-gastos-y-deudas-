// PIN y respaldos cifrados con la Web Crypto del navegador o WebView.

const ITERACIONES_PIN = 150_000;
const ITERACIONES_RESPALDO = 250_000;

/** Por trozos: pasar un respaldo grande entero a `String.fromCharCode` desborda la pila. */
function aBase64(bytes: Uint8Array): string {
  const TROZO = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  return btoa(binario);
}
const deBase64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const texto = new TextEncoder();

async function derivarBits(secreto: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', texto.encode(secreto), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export const esPinValido = (pin: string) => /^\d{4,6}$/.test(pin);

/** Lo que se guarda del PIN: nunca el PIN mismo. */
export async function protegerPin(pin: string): Promise<{ pinHash: string; sal: string }> {
  const sal = aleatorio(16);
  return { pinHash: aBase64(await derivarBits(pin, sal, ITERACIONES_PIN)), sal: aBase64(sal) };
}

export async function verificarPin(pin: string, guardado: { pinHash?: string; sal?: string }): Promise<boolean> {
  if (!guardado.pinHash || !guardado.sal) return false;
  const calculado = aBase64(await derivarBits(pin, deBase64(guardado.sal), ITERACIONES_PIN));
  // Comparación de largo fijo para no filtrar en qué posición difiere.
  let diferencia = calculado.length ^ guardado.pinHash.length;
  for (let i = 0; i < calculado.length; i++) diferencia |= calculado.charCodeAt(i) ^ guardado.pinHash.charCodeAt(i % guardado.pinHash.length);
  return diferencia === 0;
}

export interface Sobre {
  app: 'mis-finanzas';
  cifrado: 'AES-GCM';
  iteraciones: number;
  sal: string;
  iv: string;
  datos: string;
}

async function llave(clave: string, sal: Uint8Array, iteraciones: number) {
  const bits = await derivarBits(clave, sal, iteraciones);
  return crypto.subtle.importKey('raw', bits as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrar(contenido: string, clave: string): Promise<Sobre> {
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    await llave(clave, sal, ITERACIONES_RESPALDO),
    texto.encode(contenido),
  );
  return {
    app: 'mis-finanzas',
    cifrado: 'AES-GCM',
    iteraciones: ITERACIONES_RESPALDO,
    sal: aBase64(sal),
    iv: aBase64(iv),
    datos: aBase64(new Uint8Array(cifrado)),
  };
}

export function esSobre(v: unknown): v is Sobre {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.app === 'mis-finanzas' && o.cifrado === 'AES-GCM' && typeof o.datos === 'string';
}

/** Lanza un Error con mensaje para mostrar si la contraseña no es correcta. */
export async function descifrar(sobre: Sobre, clave: string): Promise<string> {
  try {
    const plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(sobre.iv) as BufferSource },
      await llave(clave, deBase64(sobre.sal), sobre.iteraciones),
      deBase64(sobre.datos) as BufferSource,
    );
    return new TextDecoder().decode(plano);
  } catch {
    throw new Error('La contraseña no es correcta o el archivo está dañado.');
  }
}
