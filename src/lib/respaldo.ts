import type { Ajuste, BaseDeDatos, Categoria, Foto, Movimiento, Prestamo, Recurrente, Tarjeta, UltimoEstado } from '../db';
import { cifrar, esSobre, type Sobre } from './cripto';
import { esFechaValida } from './fechas';

// Los datos viven solo en el dispositivo, así que el respaldo es la única
// forma de no perderlos al cambiar de celular o borrar los datos del navegador.

export interface Respaldo {
  app: 'mis-finanzas';
  /**
   * 1: ingresos, gastos y categorías. 2: más tarjetas y préstamos.
   * 3: más ajustes, historial y recurrentes. Todas se pueden restaurar.
   */
  version: 3;
  exportadoEn: string;
  movimientos: Movimiento[];
  categorias: Categoria[];
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  ajustes: Ajuste[];
  historial: Foto[];
  recurrentes: Recurrente[];
}

/**
 * Ajustes que no viajan en el respaldo: el bloqueo y el respaldo automático
 * (con su contraseña) son de cada dispositivo.
 */
const AJUSTES_LOCALES = new Set(['bloqueo', 'respaldoAuto']);

export async function crearRespaldo(db: BaseDeDatos): Promise<Respaldo> {
  const [movimientos, categorias, tarjetas, prestamos, ajustes, historial, recurrentes] = await Promise.all([
    db.movimientos.toArray(),
    db.categorias.toArray(),
    db.tarjetas.toArray(),
    db.prestamos.toArray(),
    db.ajustes.toArray(),
    db.historial.toArray(),
    db.recurrentes.toArray(),
  ]);
  return {
    app: 'mis-finanzas',
    version: 3,
    exportadoEn: new Date().toISOString(),
    movimientos,
    categorias,
    tarjetas,
    prestamos,
    ajustes: ajustes.filter((a) => !AJUSTES_LOCALES.has(a.id)),
    historial,
    recurrentes,
  };
}

/** El texto del archivo de respaldo, cifrado si se da una contraseña. */
export async function textoRespaldo(respaldo: Respaldo, clave?: string): Promise<string> {
  const plano = JSON.stringify(respaldo, null, 2);
  return clave ? JSON.stringify(await cifrar(plano, clave), null, 2) : plano;
}

/** Si el archivo es un respaldo cifrado, devuelve el sobre para pedir la contraseña. */
export function sobreDeRespaldo(texto: string): Sobre | null {
  try {
    const datos: unknown = JSON.parse(texto);
    return esSobre(datos) ? datos : null;
  } catch {
    return null;
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const esTextoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Entero de centavos, cero o más. */
const esCentavos = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

const esDiaDelMes = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;

export function leerTarjeta(v: unknown, i: number): Tarjeta {
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
    formaPago: v.formaPago === 'minimo' || v.formaPago === 'total' || v.formaPago === 'recomendado' ? v.formaPago : undefined,
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
    planes: Array.isArray(v.planes)
      ? v.planes
          .filter(esObjeto)
          .filter(
            (p) =>
              esCentavos(p.cuotaCentavos) && esCentavos(p.saldoCentavos) && typeof p.tasaMensual === 'number' &&
              Number.isInteger(p.cuotaActual) && Number.isInteger(p.cuotasTotales),
          )
          .map((p) => ({
            descripcion: typeof p.descripcion === 'string' ? p.descripcion : 'Compra a plazos',
            tasaMensual: p.tasaMensual as number,
            cuotaActual: p.cuotaActual as number,
            cuotasTotales: p.cuotasTotales as number,
            cuotaCentavos: p.cuotaCentavos as number,
            saldoCentavos: p.saldoCentavos as number,
          }))
      : undefined,
  };
}

export function leerPrestamo(v: unknown, i: number): Prestamo {
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
    cargosCentavos: esCentavos(v.cargosCentavos) && v.cargosCentavos < v.cuotaCentavos ? v.cargosCentavos : undefined,
    cargosBaseCentavos: esCentavos(v.cargosBaseCentavos) && v.cargosBaseCentavos > 0 ? v.cargosBaseCentavos : undefined,
    inicioPeriodo: esFechaValida(v.inicioPeriodo) ? v.inicioPeriodo : undefined,
    actualizadoEn: esFechaValida(v.actualizadoEn) ? v.actualizadoEn : undefined,
    desgloseCuota:
      esObjeto(v.desgloseCuota) && esFechaValida(v.desgloseCuota.fecha) && esCentavos(v.desgloseCuota.capitalCentavos)
        ? { fecha: v.desgloseCuota.fecha, capitalCentavos: v.desgloseCuota.capitalCentavos }
        : undefined,
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
    cargosCentavos: prestamoId && esCentavos(v.cargosCentavos) ? v.cargosCentavos : undefined,
    cuotaCentavos: prestamoId && v.esExtra !== true && esCentavos(v.cuotaCentavos) && v.cuotaCentavos > 0 ? v.cuotaCentavos : undefined,
    esDevolucion: v.tipo === 'pago' && tarjetaId && !prestamoId && v.esDevolucion === true ? true : undefined,
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
    limiteCentavos: esCentavos(v.limiteCentavos) && v.limiteCentavos > 0 ? v.limiteCentavos : undefined,
  };
}

function leerAjuste(v: unknown): Ajuste | null {
  if (!esObjeto(v) || !esTextoNoVacio(v.id) || AJUSTES_LOCALES.has(v.id) || !esObjeto(v.valor)) return null;
  return { id: v.id, valor: v.valor };
}

function leerFoto(v: unknown): Foto | null {
  if (!esObjeto(v) || typeof v.mes !== 'string' || !/^\d{4}-\d{2}$/.test(v.mes) || !esFechaValida(v.fecha)) return null;
  if (typeof v.disponibleCentavos !== 'number' || !esCentavos(v.deudaTotalCentavos) || !Array.isArray(v.deudas)) return null;
  return {
    mes: v.mes,
    fecha: v.fecha,
    disponibleCentavos: Math.round(v.disponibleCentavos),
    deudaTotalCentavos: v.deudaTotalCentavos,
    deudas: v.deudas
      .filter(esObjeto)
      .filter((d) => (d.tipo === 'tarjeta' || d.tipo === 'prestamo') && esTextoNoVacio(d.id) && typeof d.saldoCentavos === 'number')
      .map((d) => ({
        tipo: d.tipo as 'tarjeta' | 'prestamo',
        id: d.id as string,
        nombre: typeof d.nombre === 'string' ? d.nombre : '',
        saldoCentavos: Math.round(d.saldoCentavos as number),
      })),
  };
}

function leerRecurrente(v: unknown, i: number): Recurrente {
  const error = (campo: string) => new Error(`Movimiento recurrente ${i + 1}: "${campo}" no es válido.`);
  if (!esObjeto(v) || !esTextoNoVacio(v.id)) throw new Error(`Movimiento recurrente ${i + 1}: formato no válido.`);
  if (v.tipo !== 'gasto' && v.tipo !== 'ingreso' && v.tipo !== 'pago') throw error('tipo');
  if (!esCentavos(v.montoCentavos) || v.montoCentavos === 0) throw error('montoCentavos');
  if (!esDiaDelMes(v.dia)) throw error('dia');
  if (!esFechaValida(v.proxima)) throw error('proxima');
  const texto = (x: unknown) => (typeof x === 'string' && x !== '' ? x : undefined);
  return {
    id: v.id,
    tipo: v.tipo,
    montoCentavos: v.montoCentavos,
    categoriaId: v.tipo === 'gasto' ? texto(v.categoriaId) : undefined,
    tarjetaId: v.tipo === 'ingreso' ? undefined : texto(v.tarjetaId),
    prestamoId: v.tipo === 'pago' ? texto(v.prestamoId) : undefined,
    esPago: v.tipo === 'ingreso' ? v.esPago === true : undefined,
    nota: typeof v.nota === 'string' ? v.nota : '',
    dia: v.dia,
    proxima: v.proxima,
    activo: v.activo !== false,
    creadoEn: typeof v.creadoEn === 'number' ? v.creadoEn : Date.now(),
  };
}

/** Valida el contenido de un archivo de respaldo. Lanza un Error con un mensaje para mostrar. */
/** Deja una sola vez cada clave (la última que aparece). */
function sinRepetidos<T>(lista: T[], clave: (x: T) => string): T[] {
  return [...new Map(lista.map((x) => [clave(x), x])).values()];
}

export function leerRespaldo(texto: string): Respaldo {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un respaldo válido.');
  }
  if (esSobre(datos)) {
    throw new Error('Este respaldo está protegido con contraseña.');
  }
  if (!esObjeto(datos) || datos.app !== 'mis-finanzas') {
    throw new Error('El archivo no es un respaldo de Mis Finanzas.');
  }
  if (datos.version !== 1 && datos.version !== 2 && datos.version !== 3) {
    throw new Error('Este respaldo es de una versión más nueva de la app.');
  }
  if (!Array.isArray(datos.movimientos) || !Array.isArray(datos.categorias)) {
    throw new Error('El respaldo está incompleto.');
  }
  // Un mismo dato repetido (por ejemplo, de un archivo editado a mano) haría
  // fallar la restauración: se queda el último.
  const prestamos = sinRepetidos(Array.isArray(datos.prestamos) ? datos.prestamos.map(leerPrestamo) : [], (p) => p.id);
  // Respaldos anteriores a la 2.3: las cuotas no traen cuánto era la cuota; se toma la del préstamo.
  const cuotaDe = new Map(prestamos.map((p) => [p.id, p.cuotaCentavos]));
  const conCuota = (m: Movimiento): Movimiento =>
    m.tipo === 'pago' && m.prestamoId && !m.esExtra && m.cuotaCentavos === undefined && cuotaDe.has(m.prestamoId)
      ? { ...m, cuotaCentavos: cuotaDe.get(m.prestamoId) }
      : m;
  return {
    app: 'mis-finanzas',
    version: 3,
    exportadoEn: typeof datos.exportadoEn === 'string' ? datos.exportadoEn : '',
    movimientos: sinRepetidos(datos.movimientos.map(leerMovimiento), (m) => m.id).map(conCuota),
    categorias: sinRepetidos(datos.categorias.map(leerCategoria), (c) => c.id),
    tarjetas: sinRepetidos(Array.isArray(datos.tarjetas) ? datos.tarjetas.map(leerTarjeta) : [], (t) => t.id),
    prestamos,
    ajustes: sinRepetidos(Array.isArray(datos.ajustes) ? datos.ajustes.map(leerAjuste).filter((a): a is Ajuste => a !== null) : [], (a) => a.id),
    historial: sinRepetidos(Array.isArray(datos.historial) ? datos.historial.map(leerFoto).filter((f): f is Foto => f !== null) : [], (f) => f.mes),
    recurrentes: sinRepetidos(Array.isArray(datos.recurrentes) ? datos.recurrentes.map(leerRecurrente) : [], (r) => r.id),
  };
}

/**
 * Reemplaza todo lo que hay en el dispositivo por el contenido del respaldo.
 * El bloqueo de este dispositivo se conserva.
 */
export async function restaurarRespaldo(db: BaseDeDatos, respaldo: Respaldo): Promise<void> {
  const tablas = [db.movimientos, db.categorias, db.tarjetas, db.prestamos, db.ajustes, db.historial, db.recurrentes];
  await db.transaction('rw', tablas, async () => {
    const locales = (await db.ajustes.toArray()).filter((a) => AJUSTES_LOCALES.has(a.id));
    await Promise.all(tablas.map((t) => t.clear()));
    await db.categorias.bulkAdd(respaldo.categorias);
    await db.tarjetas.bulkAdd(respaldo.tarjetas);
    await db.prestamos.bulkAdd(respaldo.prestamos);
    await db.movimientos.bulkAdd(respaldo.movimientos);
    await db.ajustes.bulkAdd([...respaldo.ajustes, ...locales]);
    await db.historial.bulkAdd(respaldo.historial);
    await db.recurrentes.bulkAdd(respaldo.recurrentes);
  });
}

export function nombreArchivoRespaldo(fecha: string): string {
  return `mis-finanzas-${fecha}.json`;
}
