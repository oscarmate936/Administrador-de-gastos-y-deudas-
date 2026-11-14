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

export interface AjustesRecordatorios {
  activo: boolean;
  /** "HH:MM" */
  hora: string;
  pagos: boolean;
  cortes: boolean;
  estados: boolean;
  respaldo: boolean;
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
}

export type SeccionInicio = 'asistente' | 'atencion' | 'semana' | 'mes' | 'ultimos';
export const SECCIONES_INICIO: SeccionInicio[] = ['asistente', 'atencion', 'semana', 'mes', 'ultimos'];

export interface AjustesInicio {
  orden: SeccionInicio[];
  ocultas: SeccionInicio[];
  /** La lista de primeros pasos se cerró a mano. */
  primerosPasosOculto: boolean;
}

/** Orden guardado, sin secciones desconocidas y con las nuevas al final. */
export function ordenInicio(a: AjustesInicio): SeccionInicio[] {
  const validas = a.orden.filter((s, i) => SECCIONES_INICIO.includes(s) && a.orden.indexOf(s) === i);
  return [...validas, ...SECCIONES_INICIO.filter((s) => !validas.includes(s))];
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
  recordatorios: AjustesRecordatorios;
  plan: AjustesPlan;
  apariencia: AjustesApariencia;
  inicio: AjustesInicio;
  metas: AjustesMetas;
}

export const AJUSTES_INICIALES: Ajustes = {
  bloqueo: { activo: false, huella: false, esperaMinutos: 1 },
  respaldo: { recordarCadaDias: 7 },
  recordatorios: {
    activo: false,
    hora: '08:00',
    pagos: true,
    cortes: true,
    estados: true,
    respaldo: true,
    diasTarjeta: [5, 2, 0],
    diasPrestamo: [3, 0],
  },
  plan: { metodo: 'avalancha' },
  apariencia: { tema: 'sistema', vibracion: true },
  inicio: { orden: [...SECCIONES_INICIO], ocultas: [], primerosPasosOculto: false },
  metas: { hitos: [], prestamos: [] },
};

export type ClaveAjuste = keyof Ajustes;

export async function leerAjustes(base: BaseDeDatos = db): Promise<Ajustes> {
  const filas = await base.ajustes.toArray();
  return combinar(filas);
}

function combinar(filas: Array<{ id: string; valor: unknown }>): Ajustes {
  const ajustes = structuredClone(AJUSTES_INICIALES);
  for (const f of filas) {
    if (f.id in ajustes && typeof f.valor === 'object' && f.valor !== null) {
      const clave = f.id as ClaveAjuste;
      Object.assign(ajustes[clave], f.valor);
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
