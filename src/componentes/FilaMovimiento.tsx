import type { Datos } from '../datos';
import type { Movimiento } from '../db';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';

interface Props {
  movimiento: Movimiento;
  datos: Datos;
  mostrarFecha?: boolean;
  alTocar: (m: Movimiento) => void;
}

interface Vista {
  emoji: string;
  color: string;
  titulo: string;
  /** Texto extra antes de la nota. */
  detalle?: string;
  monto: string;
  claseMonto: string;
}

function vistaDe(m: Movimiento, datos: Datos): Vista {
  const dinero = formatearDinero(m.montoCentavos);
  if (m.tipo === 'ingreso') {
    return {
      emoji: '💵',
      color: 'var(--positivo)',
      titulo: m.esPago ? 'Mi pago' : 'Otro ingreso',
      monto: `+${dinero}`,
      claseMonto: 'fila-monto positivo',
    };
  }
  if (m.tipo === 'pago') {
    if (m.prestamoId) {
      const prestamo = datos.prestamos.find((p) => p.id === m.prestamoId);
      const intereses = m.montoCentavos - (m.capitalCentavos ?? 0);
      return {
        emoji: '🏦',
        color: 'var(--primario)',
        titulo: `${m.esExtra ? 'Abono extra' : 'Cuota'} · ${prestamo?.nombre ?? 'Préstamo eliminado'}`,
        detalle: intereses > 0 ? `${formatearDinero(m.capitalCentavos ?? 0)} a capital` : undefined,
        monto: `−${dinero}`,
        claseMonto: 'fila-monto',
      };
    }
    const tarjeta = datos.tarjetas.find((t) => t.id === m.tarjetaId);
    return {
      emoji: '💳',
      color: tarjeta?.color ?? 'var(--tenue)',
      titulo: `Pago · ${tarjeta?.nombre ?? 'Tarjeta eliminada'}`,
      monto: `−${dinero}`,
      claseMonto: 'fila-monto',
    };
  }
  const categoria = m.categoriaId ? datos.mapaCategorias.get(m.categoriaId) : undefined;
  const base = {
    emoji: categoria?.emoji ?? '📦',
    color: categoria?.color ?? 'var(--tenue)',
    titulo: categoria?.nombre ?? 'Sin categoría',
  };
  if (m.tarjetaId) {
    const tarjeta = datos.tarjetas.find((t) => t.id === m.tarjetaId);
    const cuotas = m.cuotas && m.cuotas > 1 ? ` en ${m.cuotas} cuotas` : '';
    return {
      ...base,
      detalle: `Con ${tarjeta?.nombre ?? 'tarjeta eliminada'}${cuotas}`,
      monto: dinero,
      claseMonto: 'fila-monto credito',
    };
  }
  return { ...base, monto: `−${dinero}`, claseMonto: 'fila-monto' };
}

export function FilaMovimiento({ movimiento: m, datos, mostrarFecha, alTocar }: Props) {
  const v = vistaDe(m, datos);
  const detalle = [mostrarFecha ? fechaCorta(m.fecha) : '', v.detalle, m.nota].filter(Boolean).join(' · ');

  return (
    <li>
      <button type="button" className="fila" onClick={() => alTocar(m)}>
        <span className="fila-emoji" style={{ background: `color-mix(in srgb, ${v.color} 18%, transparent)` }}>
          {v.emoji}
        </span>
        <span className="fila-texto">
          <span className="fila-titulo">{v.titulo}</span>
          {detalle && <span className="fila-detalle">{detalle}</span>}
        </span>
        <span className={v.claseMonto}>{v.monto}</span>
      </button>
    </li>
  );
}
