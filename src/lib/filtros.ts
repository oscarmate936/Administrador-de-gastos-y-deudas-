import type { Categoria, Movimiento, Prestamo, Tarjeta } from '../db';
import { normalizar } from './estados/lectura';

export type Filtro = 'todos' | 'gastos' | 'ingresos' | 'pagos' | 'tarjeta';

export const FILTROS: Array<{ id: Filtro; nombre: string }> = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'gastos', nombre: 'Gastos' },
  { id: 'ingresos', nombre: 'Ingresos' },
  { id: 'pagos', nombre: 'Pagos de deudas' },
  { id: 'tarjeta', nombre: 'Con tarjeta' },
];

export function pasaFiltro(m: Movimiento, filtro: Filtro): boolean {
  switch (filtro) {
    case 'todos':
      return true;
    case 'gastos':
      return m.tipo === 'gasto';
    case 'ingresos':
      return m.tipo === 'ingreso';
    case 'pagos':
      return m.tipo === 'pago';
    case 'tarjeta':
      return m.tipo === 'gasto' && m.tarjetaId !== undefined;
  }
}

/**
 * Busca sin importar mayúsculas ni tildes en la nota, la categoría, la tarjeta o
 * el préstamo, y en el monto ("25" encuentra $25.00 y $125.50).
 */
export function coincide(
  m: Movimiento,
  texto: string,
  datos: { mapaCategorias: Map<string, Categoria>; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  const partes = [
    m.nota,
    m.categoriaId ? datos.mapaCategorias.get(m.categoriaId)?.nombre : '',
    m.tarjetaId ? datos.tarjetas.find((t) => t.id === m.tarjetaId)?.nombre : '',
    m.prestamoId ? datos.prestamos.find((p) => p.id === m.prestamoId)?.nombre : '',
    m.tipo === 'ingreso' ? (m.esPago ? 'mi sueldo mi pago' : 'otro ingreso') : '',
    (m.montoCentavos / 100).toFixed(2),
  ];
  return normalizar(partes.filter(Boolean).join(' · ')).includes(q);
}
