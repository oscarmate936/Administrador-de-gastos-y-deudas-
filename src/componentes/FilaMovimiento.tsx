import type { Categoria, Movimiento } from '../db';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';

interface Props {
  movimiento: Movimiento;
  categorias: Map<string, Categoria>;
  mostrarFecha?: boolean;
  alTocar: (m: Movimiento) => void;
}

export function tituloMovimiento(m: Movimiento, categoria: Categoria | undefined): string {
  if (m.tipo === 'ingreso') return m.esPago ? 'Mi pago' : 'Otro ingreso';
  return categoria?.nombre ?? 'Sin categoría';
}

export function FilaMovimiento({ movimiento: m, categorias, mostrarFecha, alTocar }: Props) {
  const categoria = m.categoriaId ? categorias.get(m.categoriaId) : undefined;
  const esIngreso = m.tipo === 'ingreso';
  const emoji = esIngreso ? '💵' : (categoria?.emoji ?? '📦');
  const color = esIngreso ? 'var(--positivo)' : (categoria?.color ?? 'var(--tenue)');
  const detalle = [mostrarFecha ? fechaCorta(m.fecha) : '', m.nota].filter(Boolean).join(' · ');

  return (
    <li>
      <button type="button" className="fila" onClick={() => alTocar(m)}>
        <span className="fila-emoji" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          {emoji}
        </span>
        <span className="fila-texto">
          <span className="fila-titulo">{tituloMovimiento(m, categoria)}</span>
          {detalle && <span className="fila-detalle">{detalle}</span>}
        </span>
        <span className={esIngreso ? 'fila-monto positivo' : 'fila-monto'}>
          {esIngreso ? '+' : '−'}
          {formatearDinero(m.montoCentavos)}
        </span>
      </button>
    </li>
  );
}
