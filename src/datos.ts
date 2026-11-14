import type { Categoria, Foto, Movimiento, Prestamo, Recurrente, Tarjeta } from './db';
import type { EstadoCuentaTarjeta } from './lib/estados/tipos';

/** Todo lo que las pantallas leen de la base de datos. */
export interface Datos {
  movimientos: Movimiento[];
  categorias: Categoria[];
  mapaCategorias: Map<string, Categoria>;
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  recurrentes: Recurrente[];
  historial: Foto[];
}

/** Valores para empezar un movimiento nuevo (por ejemplo, desde el asistente). */
export interface Borrador {
  montoCentavos?: number;
  categoriaId?: string;
  tarjetaId?: string;
  fecha?: string;
  nota?: string;
  esPago?: boolean;
}

/** Formulario abierto en una hoja inferior. */
export type Formulario =
  | { clase: 'movimiento'; tipo: 'ingreso' | 'gasto'; movimiento?: Movimiento; tarjetaId?: string; borrador?: Borrador }
  | { clase: 'pago'; tarjetaId?: string; prestamoId?: string; movimiento?: Movimiento; extra?: boolean; monto?: number; fecha?: string }
  | { clase: 'tarjeta'; tarjeta?: Tarjeta }
  | { clase: 'prestamo'; prestamo?: Prestamo }
  | { clase: 'estado'; estado: EstadoCuentaTarjeta; tarjetaId?: string };

/** Pantalla abierta dentro de la pestaña Deudas. */
export type Detalle = { tipo: 'tarjeta' | 'prestamo'; id: string } | { tipo: 'plan' };

/** Abre el formulario que corresponde para editar un movimiento ya guardado. */
export function formularioParaEditar(m: Movimiento): Formulario {
  if (m.tipo === 'pago') {
    return { clase: 'pago', movimiento: m, tarjetaId: m.tarjetaId, prestamoId: m.prestamoId };
  }
  return { clase: 'movimiento', movimiento: m, tipo: m.tipo };
}

export const BANCOS = ['Banco Agrícola', 'Davivienda'];
export const COLORES = ['#e07a3f', '#3f9b6b', '#3f7fd0', '#8a63c9', '#c9a227', '#d0527a', '#2f9aa8', '#7c8791'];
