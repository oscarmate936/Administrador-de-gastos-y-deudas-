import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BaseDeDatos } from '../db';

// Ajustes de la app, guardados en la tabla `ajustes` (una fila por grupo).

export interface AjustesBloqueo {
  activo: boolean;
  /** PIN derivado con PBKDF2 (base64). */
  pinHash?: string;
  sal?: string;
  /** Cantidad de dígitos del PIN, para entrar sin tocar un botón. */
  largoPin?: number;
  huella: boolean;
  /** Minutos en segundo plano antes de volver a pedir el PIN. */
  esperaMinutos: number;
}

export interface AjustesRespaldo {
  /** Último respaldo guardado fuera del dispositivo (ISO). */
  ultimoExterno?: string;
  /** Última copia automática (ISO). */
  ultimaCopia?: string;
  /** Cada cuántos días recordar el respaldo externo. */
  recordarCadaDias: number;
}

/**
 * Respaldo automático cifrado en la carpeta Documentos del celular. Es de cada
 * dispositivo: la contraseña nunca viaja dentro de un respaldo.
 */
export interface AjustesRespaldoAuto {
  activo: boolean;
  /**
   * Solo en la versión 2.0: la contraseña se guardaba aquí. Ahora vive en un
   * archivo que no va a la copia de Google (lib/respaldoAuto.ts) y se mueve sola.
   */
  clave?: string;
  /**
   * Nombre del archivo, con una marca al azar elegida al activarlo: tras
   * reinstalar la app, Android no deja reescribir el archivo de la instalación
   * anterior, así que el nuevo usa otro nombre.
   */
  archivo?: string;
  /** Último respaldo automático guardado (ISO). */
  ultimo?: string;
  /** Texto del último error al guardarlo, para mostrarlo en Ajustes. */
  error?: string;
}

export interface AjustesRecordatorios {
  activo: boolean;
  /** "HH:MM" */
  hora: string;
  pagos: boolean;
  cortes: boolean;
  estados: boolean;
  respaldo: boolean;
  /** Recordar cada mes actualizar los préstamos con una captura del banco. */
  actualizar: boolean;
  /** Aviso el día 1 con el resumen del mes que terminó. */
  resumen: boolean;
  diasTarjeta: number[];
  diasPrestamo: number[];
}

export interface AjustesPlan {
  pagoMensualCentavos?: number;
  metodo: 'avalancha' | 'bola';
}

export type Tema = 'sistema' | 'claro' | 'oscuro';

export interface AjustesApariencia {
  tema: Tema;
  /** Vibración corta al guardar. */
  vibracion: boolean;
  /** Tamaño de la letra de toda la app. */
  letra: 'normal' | 'grande';
}

export type SeccionInicio = 'asistente' | 'atencion' | 'semana' | 'fondo' | 'mes' | 'ultimos';
export const SECCIONES_INICIO: SeccionInicio[] = ['asistente', 'atencion', 'semana', 'fondo', 'mes', 'ultimos'];

export interface AjustesInicio {
  orden: SeccionInicio[];
  ocultas: SeccionInicio[];
  /** La lista de primeros pasos se cerró a mano. */
  primerosPasosOculto: boolean;
  /** Mes ("AAAA-MM") cuyo resumen de cierre ya se cerró en Inicio. */
  resumenVisto?: string;
}

/** Orden guardado, sin secciones desconocidas y con las nuevas al final. */
export function ordenInicio(a: AjustesInicio): SeccionInicio[] {
  const validas = a.orden.filter((s, i) => SECCIONES_INICIO.includes(s) && a.orden.indexOf(s) === i);
  return [...validas, ...SECCIONES_INICIO.filter((s) => !validas.includes(s))];
}

/** Fondo de emergencia: dinero apartado que no cuenta como libre para gastar. */
export interface AjustesFondo {
  /** Meta del fondo; ausente mientras no se crea. */
  metaCentavos?: number;
  apartadoCentavos: number;
}

export interface AjustesMetas {
  /** Porcentajes del camino a «libre de deudas» ya celebrados. */
  hitos: number[];
  /** Préstamos cuya liquidación ya se celebró. */
  prestamos: string[];
}

export interface Ajustes {
  bloqueo: AjustesBloqueo;
  respaldo: AjustesRespaldo;
  respaldoAuto: AjustesRespaldoAuto;
  recordatorios: AjustesRecordatorios;
  plan: AjustesPlan;
  apariencia: AjustesApariencia;
  inicio: AjustesInicio;
  metas: AjustesMetas;
  fondo: AjustesFondo;
}

export const AJUSTES_INICIALES: Ajustes = {
  bloqueo: { activo: false, huella: false, esperaMinutos: 1 },
  respaldo: { recordarCadaDias: 7 },
  respaldoAuto: { activo: false },
  recordatorios: {
    activo: false,
    hora: '08:00',
    pagos: true,
    cortes: true,
    estados: true,
    respaldo: true,
    actualizar: true,
    resumen: true,
    diasTarjeta: [5, 2, 0],
    diasPrestamo: [3, 0],
  },
  plan: { metodo: 'avalancha' },
  apariencia: { tema: 'sistema', vibracion: true, letra: 'normal' },
  inicio: { orden: [...SECCIONES_INICIO], ocultas: [], primerosPasosOculto: false },
  metas: { hitos: [], prestamos: [] },
  fondo: { apartadoCentavos: 0 },
};

export type ClaveAjuste = keyof Ajustes;

export async function leerAjustes(base: BaseDeDatos = db): Promise<Ajustes> {
  const filas = await base.ajustes.toArray();
  return combinar(filas);
}

/**
 * Lo guardado de un grupo, sin valores de tipo equivocado (de un respaldo
 * dañado o de otra versión): si un dato no es del tipo esperado, queda el
 * valor normal.
 */
export function limpiarGrupo(normal: object, valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return {};
  const base = normal as Record<string, unknown>;
  const limpio: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    const esperado = base[clave];
    if (esperado === undefined) {
      // Datos opcionales (PIN, meta del fondo…): solo valores simples o listas.
      if (['string', 'number', 'boolean'].includes(typeof v) || Array.isArray(v)) limpio[clave] = v;
      continue;
    }
    if (Array.isArray(esperado) ? Array.isArray(v) : typeof v === typeof esperado) limpio[clave] = v;
  }
  return limpio;
}

function combinar(filas: Array<{ id: string; valor: unknown }>): Ajustes {
  const ajustes = structuredClone(AJUSTES_INICIALES);
  for (const f of filas) {
    if (f.id in ajustes) {
      const clave = f.id as ClaveAjuste;
      Object.assign(ajustes[clave], limpiarGrupo(AJUSTES_INICIALES[clave], f.valor));
    }
  }
  return ajustes;
}

export async function guardarAjuste<K extends ClaveAjuste>(
  clave: K,
  cambios: Partial<Ajustes[K]>,
  base: BaseDeDatos = db,
): Promise<void> {
  await base.transaction('rw', base.ajustes, async () => {
    const actual = (await leerAjustes(base))[clave];
    await base.ajustes.put({ id: clave, valor: { ...actual, ...cambios } });
  });
}

/** Ajustes en vivo; undefined mientras cargan. */
export function useAjustes(): Ajustes | undefined {
  return useLiveQuery(async () => combinar(await db.ajustes.toArray()), []);
}
