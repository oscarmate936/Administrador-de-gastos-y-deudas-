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

/** Si toca guardar el respaldo automático ahora. */
export function tocaRespaldoAuto(r: AjustesRespaldoAuto, ahora: Date): boolean {
  if (!r.activo || !r.clave || !r.archivo) return false;
  return !r.ultimo || ahora.getTime() - Date.parse(r.ultimo) >= HORAS_ENTRE_RESPALDOS * 3_600_000;
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

/** Guarda el respaldo cifrado en Documentos/MisFinanzas; el anterior queda como copia. */
export async function guardarRespaldoAuto(clave: string, archivo: string, ahora = new Date()): Promise<void> {
  const texto = await textoRespaldo(await crearRespaldo(db), clave);
  const { Filesystem, Encoding, opciones } = await archivos();
  const ruta = `${CARPETA}/${archivo}`;
  try {
    await Filesystem.copy({ from: ruta, to: `${CARPETA}/${anteriorDe(archivo)}`, directory: opciones.directory, toDirectory: opciones.directory });
  } catch {
    // La primera vez no hay respaldo anterior.
  }
  await Filesystem.writeFile({ path: ruta, data: texto, encoding: Encoding.UTF8, recursive: true, ...opciones });
  await guardarAjuste('respaldoAuto', { ultimo: ahora.toISOString(), error: undefined });
}

/** Guarda el respaldo automático si toca. No lanza errores: los deja en Ajustes. */
export async function respaldarSiToca(ahora = new Date()): Promise<boolean> {
  if (!esNativo) return false;
  const { respaldoAuto } = await leerAjustes();
  if (!tocaRespaldoAuto(respaldoAuto, ahora)) return false;
  if ((await db.movimientos.count()) + (await db.tarjetas.count()) + (await db.prestamos.count()) === 0) return false;
  try {
    await guardarRespaldoAuto(respaldoAuto.clave!, respaldoAuto.archivo!, ahora);
    return true;
  } catch (e) {
    await guardarAjuste('respaldoAuto', { error: e instanceof Error ? e.message : 'No se pudo guardar.' });
    return false;
  }
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
