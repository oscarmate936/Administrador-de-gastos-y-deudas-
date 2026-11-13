import Dexie, { type EntityTable } from 'dexie';

export type TipoMovimiento = 'ingreso' | 'gasto';

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
  nota: string;
  creadoEn: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  emoji: string;
  color: string;
  orden: number;
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

export class BaseDeDatos extends Dexie {
  movimientos!: EntityTable<Movimiento, 'id'>;
  categorias!: EntityTable<Categoria, 'id'>;

  constructor(nombre = 'mis-finanzas') {
    super(nombre);
    this.version(1).stores({
      movimientos: 'id, fecha, tipo',
      categorias: 'id, orden',
    });
    // Solo corre la primera vez que se crea la base en el dispositivo.
    this.on('populate', (tx) => {
      tx.table('categorias').bulkAdd(CATEGORIAS_INICIALES);
    });
  }
}

export const db = new BaseDeDatos();

export function nuevoId(): string {
  return crypto.randomUUID();
}
