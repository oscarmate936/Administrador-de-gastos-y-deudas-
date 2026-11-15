import { useRef, useState, type ReactNode } from 'react';
import type { Datos } from '../datos';
import type { Movimiento } from '../db';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';
import { IconoBorrar } from './Iconos';
import { Insignia, InsigniaCategoria, Simbolo } from './Simbolo';

interface Props {
  movimiento: Movimiento;
  datos: Datos;
  mostrarFecha?: boolean;
  alTocar: (m: Movimiento) => void;
  /** Con esto la fila se puede deslizar para mostrar Editar y Borrar. */
  alBorrar?: (m: Movimiento) => void;
}

interface Vista {
  insignia: React.ReactNode;
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
      insignia: <Insignia color="var(--positivo)" simbolo="ingreso" />,
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
        insignia: <Insignia color="var(--primario)" simbolo="prestamo" />,
        titulo: `${m.esExtra ? 'Abono extra' : 'Cuota'} · ${prestamo?.nombre ?? 'Préstamo eliminado'}`,
        detalle: intereses > 0 ? `${formatearDinero(m.capitalCentavos ?? 0)} a capital` : undefined,
        monto: `−${dinero}`,
        claseMonto: 'fila-monto',
      };
    }
    const tarjeta = datos.tarjetas.find((t) => t.id === m.tarjetaId);
    if (m.esDevolucion) {
      return {
        insignia: <Insignia color={tarjeta?.color ?? 'var(--tenue)'} simbolo="pago" />,
        titulo: `Devolución · ${tarjeta?.nombre ?? 'Tarjeta eliminada'}`,
        detalle: 'Baja la deuda; no sale de tu dinero',
        monto: dinero,
        claseMonto: 'fila-monto',
      };
    }
    return {
      insignia: <Insignia color={tarjeta?.color ?? 'var(--tenue)'} simbolo="pago" />,
      titulo: `Pago · ${tarjeta?.nombre ?? 'Tarjeta eliminada'}`,
      monto: `−${dinero}`,
      claseMonto: 'fila-monto',
    };
  }
  const categoria = m.categoriaId ? datos.mapaCategorias.get(m.categoriaId) : undefined;
  const base = {
    insignia: <InsigniaCategoria categoria={categoria} />,
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

export function FilaMovimiento({ movimiento: m, datos, mostrarFecha, alTocar, alBorrar }: Props) {
  const v = vistaDe(m, datos);
  const detalle = [mostrarFecha ? fechaCorta(m.fecha) : '', v.detalle, m.nota].filter(Boolean).join(' · ');
  const contenido = (
    <>
      {v.insignia}
      <span className="fila-texto">
        <span className="fila-titulo">{v.titulo}</span>
        {detalle && <span className="fila-detalle">{detalle}</span>}
      </span>
      <span className={v.claseMonto}>{v.monto}</span>
    </>
  );

  if (alBorrar) {
    return (
      <FilaDeslizable alTocar={() => alTocar(m)} alBorrar={() => alBorrar(m)}>
        {contenido}
      </FilaDeslizable>
    );
  }
  return (
    <li>
      <button type="button" className="fila" onClick={() => alTocar(m)}>
        {contenido}
      </button>
    </li>
  );
}

/** Ancho de los botones que aparecen al deslizar. */
const ANCHO_ACCIONES = 152;
/** Solo una fila abierta a la vez: la que está abierta se cierra al abrir otra. */
let cerrarLaAbierta: (() => void) | null = null;

/**
 * Fila que se desliza a la izquierda para mostrar Editar y Borrar. Tocarla
 * sigue abriendo el movimiento, así que quien no desliza no pierde nada.
 */
function FilaDeslizable({ children, alTocar, alBorrar }: { children: ReactNode; alTocar: () => void; alBorrar: () => void }) {
  const [x, setX] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const posicion = useRef(0);
  const gesto = useRef<{ x: number; y: number; base: number; activo: boolean } | null>(null);
  const deslizo = useRef(false);

  const mover = (valor: number) => {
    posicion.current = valor;
    setX(valor);
  };
  const cerrar = () => mover(0);

  return (
    <li className={x !== 0 || arrastrando ? 'fila-deslizable mostrando' : 'fila-deslizable'}>
      <span className="acciones-fila" aria-hidden={x === 0}>
        <button type="button" className="accion-editar" tabIndex={x === 0 ? -1 : 0} onClick={() => { cerrar(); alTocar(); }}>
          <Simbolo nombre="lapiz" tamano={18} />
          Editar
        </button>
        <button type="button" className="accion-borrar" tabIndex={x === 0 ? -1 : 0} onClick={() => { cerrar(); alBorrar(); }}>
          <IconoBorrar />
          Borrar
        </button>
      </span>
      <button
        type="button"
        className="fila"
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: arrastrando ? 'none' : undefined }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          gesto.current = { x: e.clientX, y: e.clientY, base: posicion.current, activo: false };
          deslizo.current = false;
        }}
        onPointerMove={(e) => {
          const g = gesto.current;
          if (!g) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (!g.activo) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
              gesto.current = null;
              return;
            }
            if (Math.abs(dx) < 8) return;
            g.activo = true;
            deslizo.current = true;
            setArrastrando(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            if (cerrarLaAbierta && cerrarLaAbierta !== cerrar) cerrarLaAbierta();
          }
          mover(Math.min(0, Math.max(-ANCHO_ACCIONES - 24, g.base + dx)));
        }}
        onPointerUp={() => {
          const g = gesto.current;
          gesto.current = null;
          setArrastrando(false);
          if (!g?.activo) return;
          const abrir = posicion.current < -ANCHO_ACCIONES / 2;
          mover(abrir ? -ANCHO_ACCIONES : 0);
          cerrarLaAbierta = abrir ? cerrar : null;
        }}
        onPointerCancel={() => {
          gesto.current = null;
          setArrastrando(false);
          mover(0);
        }}
        onClick={() => {
          if (deslizo.current) {
            deslizo.current = false;
            return;
          }
          if (posicion.current !== 0) {
            cerrar();
            return;
          }
          alTocar();
        }}
      >
        {children}
      </button>
    </li>
  );
}
