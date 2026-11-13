import type { BaseDeDatos, Categoria, Movimiento } from '../db';
import { esFechaValida } from './fechas';

// Los datos viven solo en el dispositivo, así que el respaldo es la única
// forma de no perderlos al cambiar de celular o borrar los datos del navegador.

export interface Respaldo {
  app: 'mis-finanzas';
  version: 1;
  exportadoEn: string;
  movimientos: Movimiento[];
  categorias: Categoria[];
}

export async function crearRespaldo(db: BaseDeDatos): Promise<Respaldo> {
  const [movimientos, categorias] = await Promise.all([
    db.movimientos.toArray(),
    db.categorias.toArray(),
  ]);
  return {
    app: 'mis-finanzas',
    version: 1,
    exportadoEn: new Date().toISOString(),
    movimientos,
    categorias,
  };
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const esTextoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function leerMovimiento(v: unknown, i: number): Movimiento {
  const error = (campo: string) => new Error(`Movimiento ${i + 1}: "${campo}" no es válido.`);
  if (!esObjeto(v)) throw new Error(`Movimiento ${i + 1}: formato no válido.`);
  if (!esTextoNoVacio(v.id)) throw error('id');
  if (v.tipo !== 'ingreso' && v.tipo !== 'gasto') throw error('tipo');
  if (typeof v.montoCentavos !== 'number' || !Number.isSafeInteger(v.montoCentavos) || v.montoCentavos <= 0) {
    throw error('montoCentavos');
  }
  if (!esFechaValida(v.fecha)) throw error('fecha');
  return {
    id: v.id,
    tipo: v.tipo,
    montoCentavos: v.montoCentavos,
    fecha: v.fecha,
    categoriaId: typeof v.categoriaId === 'string' ? v.categoriaId : undefined,
    esPago: v.tipo === 'ingreso' ? v.esPago === true : undefined,
    nota: typeof v.nota === 'string' ? v.nota : '',
    creadoEn: typeof v.creadoEn === 'number' ? v.creadoEn : Date.now(),
  };
}

function leerCategoria(v: unknown, i: number): Categoria {
  if (!esObjeto(v) || !esTextoNoVacio(v.id) || !esTextoNoVacio(v.nombre)) {
    throw new Error(`Categoría ${i + 1}: formato no válido.`);
  }
  return {
    id: v.id,
    nombre: v.nombre,
    emoji: typeof v.emoji === 'string' ? v.emoji : '📦',
    color: typeof v.color === 'string' ? v.color : '#7c8791',
    orden: typeof v.orden === 'number' ? v.orden : i + 1,
  };
}

/** Valida el contenido de un archivo de respaldo. Lanza un Error con un mensaje para mostrar. */
export function leerRespaldo(texto: string): Respaldo {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un respaldo válido.');
  }
  if (!esObjeto(datos) || datos.app !== 'mis-finanzas') {
    throw new Error('El archivo no es un respaldo de Mis Finanzas.');
  }
  if (datos.version !== 1) {
    throw new Error('Este respaldo es de una versión más nueva de la app.');
  }
  if (!Array.isArray(datos.movimientos) || !Array.isArray(datos.categorias)) {
    throw new Error('El respaldo está incompleto.');
  }
  return {
    app: 'mis-finanzas',
    version: 1,
    exportadoEn: typeof datos.exportadoEn === 'string' ? datos.exportadoEn : '',
    movimientos: datos.movimientos.map(leerMovimiento),
    categorias: datos.categorias.map(leerCategoria),
  };
}

/** Reemplaza todo lo que hay en el dispositivo por el contenido del respaldo. */
export async function restaurarRespaldo(db: BaseDeDatos, respaldo: Respaldo): Promise<void> {
  await db.transaction('rw', db.movimientos, db.categorias, async () => {
    await db.movimientos.clear();
    await db.categorias.clear();
    await db.categorias.bulkAdd(respaldo.categorias);
    await db.movimientos.bulkAdd(respaldo.movimientos);
  });
}

export function nombreArchivoRespaldo(fecha: string): string {
  return `mis-finanzas-${fecha}.json`;
}
