import { db } from '../db';
import { guardarAjuste, leerAjustes } from './ajustes';
import { esNativo } from './nativo';
import { crearRespaldo, textoRespaldo } from './respaldo';

// Copias automáticas del respaldo dentro del dispositivo. En Android se guardan
// como archivos en la carpeta privada de la app (aparte de los datos del
// WebView); en la versión web, en una tabla de la base de datos.

const MAXIMO = 7;
const CARPETA = 'copias';
const HORAS_ENTRE_COPIAS = 20;

export interface InfoCopia {
  id: string;
  creadaEn: string;
}

const sello = (fecha: Date) => fecha.toISOString().replace(/[:.]/g, '-');

async function sistemaArchivos() {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  return { Filesystem, opciones: { directory: Directory.Data }, Encoding };
}

export async function listarCopias(): Promise<InfoCopia[]> {
  if (!esNativo) {
    const filas = await db.copias.orderBy('creadaEn').reverse().toArray();
    return filas.map(({ id, creadaEn }) => ({ id, creadaEn }));
  }
  const { Filesystem, opciones } = await sistemaArchivos();
  try {
    const { files } = await Filesystem.readdir({ path: CARPETA, ...opciones });
    return files
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => ({ id: f.name, creadaEn: new Date(f.mtime ?? 0).toISOString() }))
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  } catch {
    return [];
  }
}

export async function leerCopia(id: string): Promise<string> {
  if (!esNativo) {
    const copia = await db.copias.get(id);
    if (!copia) throw new Error('La copia ya no existe.');
    return copia.texto;
  }
  const { Filesystem, opciones, Encoding } = await sistemaArchivos();
  const { data } = await Filesystem.readFile({ path: `${CARPETA}/${id}`, encoding: Encoding.UTF8, ...opciones });
  return typeof data === 'string' ? data : await data.text();
}

async function borrarCopia(id: string) {
  if (!esNativo) return db.copias.delete(id);
  const { Filesystem, opciones } = await sistemaArchivos();
  await Filesystem.deleteFile({ path: `${CARPETA}/${id}`, ...opciones });
}

/**
 * Borra todas las copias automáticas. Se usa al borrar los datos por un PIN
 * olvidado: si quedaran, cualquiera podría restaurarlas sin saber el PIN.
 */
export async function borrarCopias(): Promise<void> {
  for (const c of await listarCopias()) await borrarCopia(c.id).catch(() => undefined);
}

/** Hace una copia si la última tiene más de un día. Devuelve true si la hizo. */
export async function copiarSiToca(ahora = new Date()): Promise<boolean> {
  const { respaldo } = await leerAjustes();
  if (respaldo.ultimaCopia && ahora.getTime() - Date.parse(respaldo.ultimaCopia) < HORAS_ENTRE_COPIAS * 3_600_000) {
    return false;
  }
  if ((await db.movimientos.count()) + (await db.tarjetas.count()) + (await db.prestamos.count()) === 0) return false;

  const texto = await textoRespaldo(await crearRespaldo(db));
  const id = `mis-finanzas-${sello(ahora)}.json`;
  if (esNativo) {
    const { Filesystem, opciones, Encoding } = await sistemaArchivos();
    await Filesystem.writeFile({ path: `${CARPETA}/${id}`, data: texto, encoding: Encoding.UTF8, recursive: true, ...opciones });
  } else {
    await db.copias.put({ id, creadaEn: ahora.toISOString(), texto });
  }
  for (const vieja of (await listarCopias()).slice(MAXIMO)) await borrarCopia(vieja.id);
  await guardarAjuste('respaldo', { ultimaCopia: ahora.toISOString() });
  return true;
}
