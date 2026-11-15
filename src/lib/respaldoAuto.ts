import { db } from '../db';
import { guardarAjuste, leerAjustes, type AjustesRespaldoAuto } from './ajustes';
import { entregarArchivo, esNativo } from './nativo';
import { crearRespaldo, nombreArchivoRespaldo, textoRespaldo } from './respaldo';
import { hoy } from './fechas';

// Respaldo automático: cada día que se abre la app se guarda un respaldo cifrado
// en Documentos/MisFinanzas. Esa carpeta queda aunque se desinstale la app y se
// puede copiar a la computadora; para tenerlo fuera del celular basta un toque
// (compartirRespaldo) que abre el menú para guardarlo en Drive.

export const CARPETA = 'MisFinanzas';
/** Nombre del archivo del respaldo automático, con una marca al azar. */
export const nuevoNombreArchivo = () => `mis-finanzas-respaldo-${Math.random().toString(36).slice(2, 6)}.json`;
const anteriorDe = (archivo: string) => archivo.replace(/\.json$/, '-anterior.json');
const HORAS_ENTRE_RESPALDOS = 20;
/** Largo mínimo de la contraseña del respaldo automático. */
export const LARGO_CLAVE = 6;

/**
 * La contraseña se guarda en un archivo de la carpeta privada de la app que la
 * copia de seguridad de Google no incluye (res/xml/reglas_copia.xml y
 * reglas_extraccion.xml). Así nunca sale del celular.
 */
const ARCHIVO_CLAVE = 'clave-respaldo.txt';

/** Si toca guardar el respaldo automático ahora. */
export function tocaRespaldoAuto(r: AjustesRespaldoAuto, ahora: Date, tieneClave: boolean): boolean {
  if (!r.activo || !tieneClave || !r.archivo) return false;
  return !r.ultimo || ahora.getTime() - Date.parse(r.ultimo) >= HORAS_ENTRE_RESPALDOS * 3_600_000;
}

/** La contraseña del respaldo automático de este celular, si hay. */
export async function leerClave(): Promise<string | undefined> {
  if (!esNativo) return undefined;
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    const { data } = await Filesystem.readFile({ path: ARCHIVO_CLAVE, directory: Directory.Data, encoding: Encoding.UTF8 });
    const texto = typeof data === 'string' ? data : await data.text();
    return texto || undefined;
  } catch {
    return undefined;
  }
}

/** Guarda (o borra, sin `clave`) la contraseña del respaldo automático. */
export async function guardarClave(clave?: string): Promise<void> {
  if (!esNativo) return;
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  if (clave) {
    await Filesystem.writeFile({ path: ARCHIVO_CLAVE, data: clave, directory: Directory.Data, encoding: Encoding.UTF8 });
  } else {
    await Filesystem.deleteFile({ path: ARCHIVO_CLAVE, directory: Directory.Data }).catch(() => undefined);
  }
}

/** La versión 2.0 guardaba la contraseña en los ajustes (que sí van a la copia de Google): se mueve al archivo. */
export async function moverClaveVieja(): Promise<void> {
  const { respaldoAuto } = await leerAjustes();
  if (!respaldoAuto.clave) return;
  if (esNativo) await guardarClave(respaldoAuto.clave);
  await guardarAjuste('respaldoAuto', { clave: undefined });
}

async function archivos() {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  return { Filesystem, Encoding, opciones: { directory: Directory.Documents } };
}

/** Pide el permiso de almacenamiento que Android 10 o anterior necesita para Documentos. */
export async function permisoDocumentos(): Promise<boolean> {
  if (!esNativo) return false;
  const { Filesystem } = await archivos();
  try {
    let { publicStorage } = await Filesystem.checkPermissions();
    if (publicStorage !== 'granted') ({ publicStorage } = await Filesystem.requestPermissions());
    return publicStorage === 'granted';
  } catch {
    return false;
  }
}

/**
 * Guarda el respaldo cifrado en Documentos/MisFinanzas; el de antes queda como
 * copia «-anterior». La copia se borra y se vuelve a escribir (en vez de copiar
 * encima), para que funcione igual en todos los celulares.
 */
export async function guardarRespaldoAuto(clave: string, archivo: string, ahora = new Date()): Promise<void> {
  const texto = await textoRespaldo(await crearRespaldo(db), clave);
  const { Filesystem, Encoding, opciones } = await archivos();
  const ruta = `${CARPETA}/${archivo}`;
  const anterior = `${CARPETA}/${anteriorDe(archivo)}`;
  try {
    const { data } = await Filesystem.readFile({ path: ruta, encoding: Encoding.UTF8, ...opciones });
    const previo = typeof data === 'string' ? data : await data.text();
    await Filesystem.deleteFile({ path: anterior, ...opciones }).catch(() => undefined);
    await Filesystem.writeFile({ path: anterior, data: previo, encoding: Encoding.UTF8, recursive: true, ...opciones });
  } catch {
    // La primera vez no hay respaldo anterior.
  }
  await Filesystem.deleteFile({ path: ruta, ...opciones }).catch(() => undefined);
  await Filesystem.writeFile({ path: ruta, data: texto, encoding: Encoding.UTF8, recursive: true, ...opciones });
  await guardarAjuste('respaldoAuto', { ultimo: ahora.toISOString(), error: undefined });
}

/** Guarda el respaldo automático si toca. No lanza errores: los deja en Ajustes. */
export async function respaldarSiToca(ahora = new Date()): Promise<boolean> {
  if (!esNativo) return false;
  await moverClaveVieja();
  const { respaldoAuto } = await leerAjustes();
  const clave = await leerClave();
  if (!tocaRespaldoAuto(respaldoAuto, ahora, !!clave)) return false;
  if ((await db.movimientos.count()) + (await db.tarjetas.count()) + (await db.prestamos.count()) === 0) return false;
  try {
    await guardarRespaldoAuto(clave!, respaldoAuto.archivo!, ahora);
    return true;
  } catch (e) {
    await guardarAjuste('respaldoAuto', { error: e instanceof Error ? e.message : 'No se pudo guardar.' });
    return false;
  }
}

/** Fecha de los dos archivos del respaldo automático (para comprobar que se guardan). */
export async function fechasDeArchivos(archivo: string): Promise<{ actual?: Date; anterior?: Date }> {
  if (!esNativo) return {};
  const { Filesystem, opciones } = await archivos();
  const fecha = async (path: string) => {
    try {
      const info = await Filesystem.stat({ path, ...opciones });
      return info.mtime ? new Date(info.mtime) : undefined;
    } catch {
      return undefined;
    }
  };
  return { actual: await fecha(`${CARPETA}/${archivo}`), anterior: await fecha(`${CARPETA}/${anteriorDe(archivo)}`) };
}

/**
 * Abre el menú de compartir con un respaldo cifrado recién hecho, para
 * guardarlo en Drive, el correo o WhatsApp. Lanza AbortError si se cancela.
 */
export async function compartirRespaldo(clave: string): Promise<void> {
  const texto = await textoRespaldo(await crearRespaldo(db), clave);
  await entregarArchivo(nombreArchivoRespaldo(hoy()), texto, 'application/json');
  await guardarAjuste('respaldo', { ultimoExterno: new Date().toISOString() });
}
