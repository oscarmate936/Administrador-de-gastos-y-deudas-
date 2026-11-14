import Dexie, { type EntityTable } from 'dexie';
import { sumarDias } from './lib/fechas';

/**
 * - ingreso: dinero que entra al disponible.
 * - gasto: sin tarjetaId sale del disponible; con tarjetaId aumenta la deuda de esa tarjeta.
 * - pago: sale del disponible y baja la deuda de una tarjeta o de un préstamo.
 */
export type TipoMovimiento = 'ingreso' | 'gasto' | 'pago';

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  /** Siempre positivo; el tipo indica si suma o resta. */
  montoCentavos: number;
  /** "AAAA-MM-DD" en hora local. */
  fecha: string;
  /** Solo en gastos. */
  categoriaId?: string;
  /**
   * Solo en ingresos: true si es "mi pago" (sueldo). El resumen de Inicio
   * cuenta el periodo desde el último pago, no desde cualquier ingreso.
   */
  esPago?: boolean;
  /** En gastos: la tarjeta con la que se pagó. En pagos: la tarjeta que se abona. */
  tarjetaId?: string;
  /** Solo en gastos con tarjeta: número de cuotas (1 o ausente = de contado). */
  cuotas?: number;
  /** Solo en pagos: el préstamo que se abona. */
  prestamoId?: string;
  /** Solo en pagos a préstamos: la parte del pago que baja el saldo (el resto son intereses y cargos). */
  capitalCentavos?: number;
  /** Solo en pagos a préstamos: true si es un abono extra y no cuenta como cuota del mes. */
  esExtra?: boolean;
  nota: string;
  creadoEn: number;
}

export interface Tarjeta {
  id: string;
  nombre: string;
  banco: string;
  limiteCentavos: number;
  /** Día del mes (1-31). Si el mes es más corto se usa su último día. */
  diaCorte: number;
  /** Día del mes del último día de pago. */
  diaPago: number;
  /** Lo que se debía en total al terminar el día `fechaSaldo`. */
  saldoInicialCentavos: number;
  /** Lo que faltaba pagar del último estado de cuenta ese mismo día. */
  pendienteInicialCentavos: number;
  /**
   * Fecha a la que corresponden los dos saldos anteriores: ya incluyen todo lo
   * de ese día y de antes. Solo las compras y pagos posteriores los modifican.
   */
  fechaSaldo: string;
  color: string;
  creadoEn: number;
  /** Últimos 4 dígitos, para reconocer la tarjeta al importar un estado de cuenta. */
  ultimos4?: string;
  tasaAnual?: number;
  /** Datos del último estado de cuenta importado. */
  ultimoEstado?: UltimoEstado;
}

export interface UltimoEstado {
  fechaCorte: string;
  fechaLimite: string;
  pagoContadoCentavos: number;
  pagoMinimoCentavos?: number;
  saldoCentavos: number;
  /** Crédito disponible según el banco (algunos no descuentan los intereses del límite). */
  disponibleCentavos?: number;
}

export interface Prestamo {
  id: string;
  nombre: string;
  acreedor: string;
  /** Opcional: monto con el que empezó el préstamo, para mostrar el avance. */
  montoOriginalCentavos?: number;
  /** Saldo de capital el día que se registró en la app. */
  saldoInicialCentavos: number;
  /** Tasa de interés anual en porcentaje, por ejemplo 12.5. */
  tasaAnual: number;
  cuotaCentavos: number;
  /** Fecha de la primera cuota a pagar después de registrarlo; las siguientes caen el mismo día de cada mes. */
  primeraCuota: string;
  creadoEn: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  emoji: string;
  color: string;
  orden: number;
  /** Límite de gasto al mes (incluye compras con tarjeta). */
  limiteCentavos?: number;
}

/** Un ajuste guardado (la forma de cada uno está en lib/ajustes.ts). */
export interface Ajuste {
  id: string;
  valor: unknown;
}

/** Foto mensual de las deudas y del disponible, para las gráficas. */
export interface Foto {
  /** "AAAA-MM" */
  mes: string;
  /** Último día en que se actualizó. */
  fecha: string;
  disponibleCentavos: number;
  deudaTotalCentavos: number;
  deudas: Array<{ tipo: 'tarjeta' | 'prestamo'; id: string; nombre: string; saldoCentavos: number }>;
}

/** Plantilla de un movimiento que se repite cada mes. */
export interface Recurrente {
  id: string;
  tipo: 'gasto' | 'ingreso' | 'pago';
  montoCentavos: number;
  categoriaId?: string;
  /** Gasto con tarjeta, o pago a una tarjeta. */
  tarjetaId?: string;
  /** Cuota de un préstamo. */
  prestamoId?: string;
  esPago?: boolean;
  nota: string;
  /** Día del mes (1-31). */
  dia: number;
  /** Próxima fecha en que toca, "AAAA-MM-DD". */
  proxima: string;
  activo: boolean;
  creadoEn: number;
}

/** Copia automática del respaldo (solo en la versión web; en Android van a archivos). */
export interface Copia {
  id: string;
  creadaEn: string;
  texto: string;
}

export const CATEGORIAS_INICIALES: Categoria[] = [
  { id: 'comida', nombre: 'Comida', emoji: '🍽️', color: '#e07a3f', orden: 1 },
  { id: 'super', nombre: 'Supermercado', emoji: '🛒', color: '#3f9b6b', orden: 2 },
  { id: 'transporte', nombre: 'Transporte', emoji: '🚌', color: '#3f7fd0', orden: 3 },
  { id: 'casa', nombre: 'Casa', emoji: '🏠', color: '#8a63c9', orden: 4 },
  { id: 'servicios', nombre: 'Servicios', emoji: '💡', color: '#c9a227', orden: 5 },
  { id: 'salud', nombre: 'Salud', emoji: '💊', color: '#d0527a', orden: 6 },
  { id: 'ocio', nombre: 'Ocio', emoji: '🎬', color: '#2f9aa8', orden: 7 },
  { id: 'otros', nombre: 'Otros', emoji: '📦', color: '#7c8791', orden: 8 },
];

/** Para registrar en una tarjeta los cargos que no son compras. */
export const CATEGORIA_INTERESES: Categoria = {
  id: 'intereses',
  nombre: 'Intereses y comisiones',
  emoji: '🏦',
  color: '#a8563b',
  orden: 9,
};

export class BaseDeDatos extends Dexie {
  movimientos!: EntityTable<Movimiento, 'id'>;
  categorias!: EntityTable<Categoria, 'id'>;
  tarjetas!: EntityTable<Tarjeta, 'id'>;
  prestamos!: EntityTable<Prestamo, 'id'>;
  ajustes!: EntityTable<Ajuste, 'id'>;
  historial!: EntityTable<Foto, 'mes'>;
  recurrentes!: EntityTable<Recurrente, 'id'>;
  copias!: EntityTable<Copia, 'id'>;

  constructor(nombre = 'mis-finanzas') {
    super(nombre);
    this.version(1).stores({
      movimientos: 'id, fecha, tipo',
      categorias: 'id, orden',
    });
    // Versión 2: tarjetas de crédito y préstamos.
    this.version(2)
      .stores({
        movimientos: 'id, fecha, tipo, tarjetaId, prestamoId',
        categorias: 'id, orden',
        tarjetas: 'id',
        prestamos: 'id',
      })
      .upgrade(async (tx) => {
        const categorias = tx.table<Categoria, string>('categorias');
        if (!(await categorias.get(CATEGORIA_INTERESES.id))) {
          await categorias.add(CATEGORIA_INTERESES);
        }
      });
    // Versión 3: los saldos de una tarjeta ya incluyen el día `fechaSaldo`. Antes
    // era el día en que se registró y contaba lo de ese día, así que se mueve
    // un día atrás para que todo siga sumando igual.
    this.version(3).upgrade(async (tx) => {
      await tx
        .table<Tarjeta, string>('tarjetas')
        .toCollection()
        .modify((t) => {
          t.fechaSaldo = sumarDias(t.fechaSaldo, -1);
        });
    });
    // Versión 4: ajustes, historial de saldos, movimientos recurrentes y copias.
    this.version(4).stores({
      ajustes: 'id',
      historial: 'mes',
      recurrentes: 'id, proxima',
      copias: 'id, creadaEn',
    });
    // Solo corre la primera vez que se crea la base en el dispositivo.
    this.on('populate', (tx) => {
      tx.table('categorias').bulkAdd([...CATEGORIAS_INICIALES, CATEGORIA_INTERESES]);
    });
  }
}

export const db = new BaseDeDatos();

export function nuevoId(): string {
  return crypto.randomUUID();
}
