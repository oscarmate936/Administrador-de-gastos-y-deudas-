import type { BaseDeDatos, Categoria, Movimiento, Prestamo, Tarjeta, UltimoEstado } from '../db';
import { esFechaValida } from './fechas';

// Los datos viven solo en el dispositivo, así que el respaldo es la única
// forma de no perderlos al cambiar de celular o borrar los datos del navegador.

export interface Respaldo {
  app: 'mis-finanzas';
  /** La versión 1 no tenía tarjetas ni préstamos; se sigue pudiendo restaurar. */
  version: 2;
  exportadoEn: string;
  movimientos: Movimiento[];
  categorias: Categoria[];
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
}

export async function crearRespaldo(db: BaseDeDatos): Promise<Respaldo> {
  const [movimientos, categorias, tarjetas, prestamos] = await Promise.all([
    db.movimientos.toArray(),
    db.categorias.toArray(),
    db.tarjetas.toArray(),
    db.prestamos.toArray(),
  ]);
  return {
    app: 'mis-finanzas',
    version: 2,
    exportadoEn: new Date().toISOString(),
    movimientos,
    categorias,
    tarjetas,
    prestamos,
  };
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const esTextoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Entero de centavos, cero o más. */
const esCentavos = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

const esDiaDelMes = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;

function leerTarjeta(v: unknown, i: number): Tarjeta {
  const error = (campo: string) => new Error(`Tarjeta ${i + 1}: "${campo}" no es válido.`);
  if (!esObjeto(v)) throw new Error(`Tarjeta ${i + 1}: formato no válido.`);
  if (!esTextoNoVacio(v.id)) throw error('id');
  if (!esTextoNoVacio(v.nombre)) throw error('nombre');
  if (!esCentavos(v.limiteCentavos)) throw error('limiteCentavos');
  if (!esDiaDelMes(v.diaCorte)) throw error('diaCorte');
  if (!esDiaDelMes(v.diaPago)) throw error('diaPago');
  if (!esCentavos(v.saldoInicialCentavos)) throw error('saldoInicialCentavos');
  if (!esFechaValida(v.fechaSaldo)) throw error('fechaSaldo');
  return {
    id: v.id,
    nombre: v.nombre,
    banco: typeof v.banco === 'string' ? v.banco : '',
    limiteCentavos: v.limiteCentavos,
    diaCorte: v.diaCorte,
    diaPago: v.diaPago,
    saldoInicialCentavos: v.saldoInicialCentavos,
    pendienteInicialCentavos: esCentavos(v.pendienteInicialCentavos) ? v.pendienteInicialCentavos : 0,
    fechaSaldo: v.fechaSaldo,
    color: typeof v.color === 'string' ? v.color : '#0f6b54',
    creadoEn: typeof v.creadoEn === 'number' ? v.creadoEn : Date.now(),
    ultimos4: typeof v.ultimos4 === 'string' && /^\d{4}$/.test(v.ultimos4) ? v.ultimos4 : undefined,
    tasaAnual: typeof v.tasaAnual === 'number' && Number.isFinite(v.tasaAnual) && v.tasaAnual >= 0 ? v.tasaAnual : undefined,
    ultimoEstado: leerUltimoEstado(v.ultimoEstado),
  };
}

function leerUltimoEstado(v: unknown): UltimoEstado | undefined {
  if (!esObjeto(v)) return undefined;
  if (!esFechaValida(v.fechaCorte) || !esFechaValida(v.fechaLimite)) return undefined;
  if (!esCentavos(v.pagoContadoCentavos) || !esCentavos(v.saldoCentavos)) return undefined;
  return {
    fechaCorte: v.fechaCorte,
    fechaLimite: v.fechaLimite,
    pagoContadoCentavos: v.pagoContadoCentavos,
    pagoMinimoCentavos: esCentavos(v.pagoMinimoCentavos) ? v.pagoMinimoCentavos : undefined,
    saldoCentavos: v.saldoCentavos,
    disponibleCentavos:
      typeof v.disponibleCentavos === 'number' && Number.isSafeInteger(v.disponibleCentavos) ? v.disponibleCentavos : undefined,
  };
}

function leerPrestamo(v: unknown, i: number): Prestamo {
  const error = (campo: string) => new Error(`Préstamo ${i + 1}: "${campo}" no es válido.`);
  if (!esObjeto(v)) throw new Error(`Préstamo ${i + 1}: formato no válido.`);
  if (!esTextoNoVacio(v.id)) throw error('id');
  if (!esTextoNoVacio(v.nombre)) throw error('nombre');
  if (!esCentavos(v.saldoInicialCentavos)) throw error('saldoInicialCentavos');
  if (typeof v.tasaAnual !== 'number' || !Number.isFinite(v.tasaAnual) || v.tasaAnual < 0) throw error('tasaAnual');
  if (!esCentavos(v.cuotaCentavos) || v.cuotaCentavos === 0) throw error('cuotaCentavos');
  if (!esFechaValida(v.primeraCuota)) throw error('primeraCuota');
  return {
    id: v.id,
    nombre: v.nombre,
    acreedor: typeof v.acreedor === 'string' ? v.acreedor : '',
    montoOriginalCentavos: esCentavos(v.montoOriginalCentavos) ? v.montoOriginalCentavos : undefined,
    saldoInicialCentavos: v.saldoInicialCentavos,
    tasaAnual: v.tasaAnual,
    cuotaCentavos: v.cuotaCentavos,
    primeraCuota: v.primeraCuota,
    creadoEn: typeof v.creadoEn === 'number' ? v.creadoEn : Date.now(),
  };
}

function leerMovimiento(v: unknown, i: number): Movimiento {
  const error = (campo: string) => new Error(`Movimiento ${i + 1}: "${campo}" no es válido.`);
  if (!esObjeto(v)) throw new Error(`Movimiento ${i + 1}: formato no válido.`);
  if (!esTextoNoVacio(v.id)) throw error('id');
  if (v.tipo !== 'ingreso' && v.tipo !== 'gasto' && v.tipo !== 'pago') throw error('tipo');
  if (!esCentavos(v.montoCentavos) || v.montoCentavos === 0) throw error('montoCentavos');
  if (!esFechaValida(v.fecha)) throw error('fecha');
  const texto = (x: unknown) => (typeof x === 'string' && x !== '' ? x : undefined);
  const tarjetaId = v.tipo === 'ingreso' ? undefined : texto(v.tarjetaId);
  const prestamoId = v.tipo === 'pago' ? texto(v.prestamoId) : undefined;
  if (v.tipo === 'pago' && !tarjetaId && !prestamoId) throw error('destino del pago');
  return {
    id: v.id,
    tipo: v.tipo,
    montoCentavos: v.montoCentavos,
    fecha: v.fecha,
    categoriaId: v.tipo === 'gasto' ? texto(v.categoriaId) : undefined,
    esPago: v.tipo === 'ingreso' ? v.esPago === true : undefined,
    tarjetaId,
    cuotas:
      v.tipo === 'gasto' && tarjetaId && typeof v.cuotas === 'number' && Number.isInteger(v.cuotas) && v.cuotas > 1
        ? v.cuotas
        : undefined,
    prestamoId,
    capitalCentavos: prestamoId ? (esCentavos(v.capitalCentavos) ? v.capitalCentavos : 0) : undefined,
    esExtra: prestamoId ? v.esExtra === true : undefined,
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
  if (datos.version !== 1 && datos.version !== 2) {
    throw new Error('Este respaldo es de una versión más nueva de la app.');
  }
  if (!Array.isArray(datos.movimientos) || !Array.isArray(datos.categorias)) {
    throw new Error('El respaldo está incompleto.');
  }
  return {
    app: 'mis-finanzas',
    version: 2,
    exportadoEn: typeof datos.exportadoEn === 'string' ? datos.exportadoEn : '',
    movimientos: datos.movimientos.map(leerMovimiento),
    categorias: datos.categorias.map(leerCategoria),
    tarjetas: Array.isArray(datos.tarjetas) ? datos.tarjetas.map(leerTarjeta) : [],
    prestamos: Array.isArray(datos.prestamos) ? datos.prestamos.map(leerPrestamo) : [],
  };
}

/** Reemplaza todo lo que hay en el dispositivo por el contenido del respaldo. */
export async function restaurarRespaldo(db: BaseDeDatos, respaldo: Respaldo): Promise<void> {
  await db.transaction('rw', [db.movimientos, db.categorias, db.tarjetas, db.prestamos], async () => {
    await Promise.all([db.movimientos.clear(), db.categorias.clear(), db.tarjetas.clear(), db.prestamos.clear()]);
    await db.categorias.bulkAdd(respaldo.categorias);
    await db.tarjetas.bulkAdd(respaldo.tarjetas);
    await db.prestamos.bulkAdd(respaldo.prestamos);
    await db.movimientos.bulkAdd(respaldo.movimientos);
  });
}

export function nombreArchivoRespaldo(fecha: string): string {
  return `mis-finanzas-${fecha}.json`;
}
