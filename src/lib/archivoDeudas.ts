import type { BaseDeDatos, Movimiento, Prestamo, Tarjeta } from '../db';
import { guardarAjuste, leerAjustes, limpiarGrupo, AJUSTES_INICIALES, type AjustesSueldo } from './ajustes';
import { ajustarPrestamo } from './deudas';
import { normalizar } from './estados/lectura';
import { leerPrestamo, leerTarjeta } from './respaldo';

// Archivo de deudas: tus tarjetas, préstamos y cómo te pagan, para cargarlos de
// una vez. A diferencia de un respaldo, no reemplaza nada: agrega lo que falta
// y pone al día lo que ya está, sin tocar movimientos ni pagos.

export interface ArchivoDeudas {
  app: 'mis-finanzas';
  tipo: 'deudas';
  version: 1;
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  /** Cada cuánto te pagan y el bono de comida (opcional). */
  sueldo?: Partial<AjustesSueldo>;
}

/** true si el texto es un archivo de deudas (y no un respaldo completo). */
export function esArchivoDeudas(texto: string): boolean {
  try {
    const v: unknown = JSON.parse(texto);
    return typeof v === 'object' && v !== null && (v as Record<string, unknown>).app === 'mis-finanzas' && (v as Record<string, unknown>).tipo === 'deudas';
  } catch {
    return false;
  }
}

/** Valida el archivo. Lanza un Error con un mensaje para mostrar. */
export function leerArchivoDeudas(texto: string): ArchivoDeudas {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    throw new Error('El archivo no es un archivo de deudas válido.');
  }
  if (v.app !== 'mis-finanzas' || v.tipo !== 'deudas') throw new Error('El archivo no es un archivo de deudas de Mis Finanzas.');
  if (v.version !== 1) throw new Error('Este archivo es de una versión más nueva de la app.');
  const tarjetas = Array.isArray(v.tarjetas) ? v.tarjetas.map(leerTarjeta) : [];
  const prestamos = Array.isArray(v.prestamos) ? v.prestamos.map(leerPrestamo) : [];
  if (tarjetas.length + prestamos.length === 0) throw new Error('El archivo no trae tarjetas ni préstamos.');
  const sueldo = limpiarGrupo(AJUSTES_INICIALES.sueldo, v.sueldo) as Partial<AjustesSueldo>;
  return { app: 'mis-finanzas', tipo: 'deudas', version: 1, tarjetas, prestamos, sueldo: Object.keys(sueldo).length ? sueldo : undefined };
}

export interface PlanImportacion {
  /** Tarjetas a guardar: nuevas o la existente puesta al día (mismo id). */
  tarjetas: Array<{ tarjeta: Tarjeta; nueva: boolean; sinCambios?: boolean }>;
  prestamos: Array<{ prestamo: Prestamo; nuevo: boolean }>;
  sueldo?: Partial<AjustesSueldo>;
}

/** La tarjeta del celular que corresponde a la del archivo: por los 4 últimos dígitos o, sin ellos, mismo banco y día de corte. */
function tarjetaIgual(t: Tarjeta, actuales: Tarjeta[]): Tarjeta | undefined {
  if (t.ultimos4) {
    const porDigitos = actuales.find((a) => a.ultimos4 === t.ultimos4);
    if (porDigitos) return porDigitos;
  }
  const candidatas = actuales.filter((a) => !a.ultimos4 && normalizar(a.banco) === normalizar(t.banco) && a.diaCorte === t.diaCorte);
  return candidatas.length === 1 ? candidatas[0] : undefined;
}

/** El préstamo del celular que corresponde: mismo id, mismo nombre, o el único con el mismo acreedor. */
function prestamoIgual(p: Prestamo, actuales: Prestamo[], delArchivo: Prestamo[]): Prestamo | undefined {
  const porId = actuales.find((a) => a.id === p.id);
  if (porId) return porId;
  const porNombre = actuales.filter((a) => normalizar(a.nombre) === normalizar(p.nombre));
  if (porNombre.length === 1) return porNombre[0];
  if (!p.acreedor) return undefined;
  const mismo = (lista: Prestamo[]) => lista.filter((a) => normalizar(a.acreedor) === normalizar(p.acreedor));
  const aqui = mismo(actuales);
  return aqui.length === 1 && mismo(delArchivo).length === 1 ? aqui[0] : undefined;
}

/** Qué se agrega y qué se pone al día, sin guardar nada todavía. */
export function planImportacion(
  archivo: ArchivoDeudas,
  actuales: { tarjetas: Tarjeta[]; prestamos: Prestamo[]; movimientos: Movimiento[] },
  hoy: string,
  ahora = Date.now(),
): PlanImportacion {
  const tarjetas = archivo.tarjetas.map((t, i) => {
    const igual = tarjetaIgual(t, actuales.tarjetas);
    if (!igual) return { tarjeta: { ...t, creadoEn: ahora + i }, nueva: true };
    // Si en el celular ya hay datos de un corte más reciente, solo se toma la forma de pago y la tasa.
    if (igual.fechaSaldo > t.fechaSaldo) {
      return { tarjeta: { ...igual, formaPago: t.formaPago ?? igual.formaPago, tasaAnual: igual.tasaAnual ?? t.tasaAnual }, nueva: false, sinCambios: true };
    }
    return {
      tarjeta: { ...t, id: igual.id, nombre: igual.nombre, color: igual.color, creadoEn: igual.creadoEn, ultimos4: t.ultimos4 ?? igual.ultimos4 },
      nueva: false,
    };
  });
  const prestamos = archivo.prestamos.map((p, i) => {
    const igual = prestamoIgual(p, actuales.prestamos, archivo.prestamos);
    if (!igual) return { prestamo: { ...p, creadoEn: ahora + 100 + i }, nuevo: true };
    // Con pagos ya registrados: se ajusta a lo que dice el archivo sin borrarlos.
    const ajustado = ajustarPrestamo(igual, actuales.movimientos, hoy, {
      saldoCentavos: p.saldoInicialCentavos,
      cuotaCentavos: p.cuotaCentavos,
      tasaAnual: p.tasaAnual,
      proximaFecha: p.primeraCuota,
      montoOriginalCentavos: p.montoOriginalCentavos,
      cargosCentavos: p.cargosCentavos ?? 0,
      desgloseCuota: p.desgloseCuota,
      inicioPeriodo: p.inicioPeriodo,
    });
    return { prestamo: { ...ajustado, acreedor: igual.acreedor || p.acreedor }, nuevo: false };
  });
  return { tarjetas, prestamos, sueldo: archivo.sueldo };
}

/** Guarda el plan de una vez: si algo falla, no queda nada a medias. */
export async function aplicarImportacion(db: BaseDeDatos, plan: PlanImportacion): Promise<void> {
  await db.transaction('rw', db.tarjetas, db.prestamos, db.ajustes, async () => {
    await db.tarjetas.bulkPut(plan.tarjetas.map((x) => x.tarjeta));
    await db.prestamos.bulkPut(plan.prestamos.map((x) => x.prestamo));
    if (plan.sueldo) {
      const actual = (await leerAjustes(db)).sueldo;
      await guardarAjuste('sueldo', { ...actual, ...plan.sueldo }, db);
    }
  });
}
