import type { Categoria, Movimiento, Prestamo, Recurrente, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta, primerDiaDesde, proximosPagos, sumarMeses } from './deudas';
import { aDate } from './fechas';
import { siguienteFecha } from './recurrentes';

// Lo que pasa en un rango de fechas: pagos de tarjetas, cuotas de préstamos,
// cortes y movimientos que se repiten cada mes. Lo usa el calendario de Deudas.

export type TipoEvento = 'pago' | 'cuota' | 'corte' | 'repite';

export interface Evento {
  /** Única dentro de la lista (para React). */
  clave: string;
  fecha: string;
  tipo: TipoEvento;
  titulo: string;
  /** Sin monto en pagos de meses futuros cuyo estado de cuenta aún no existe. */
  montoCentavos?: number;
  /** true si el monto puede cambiar. */
  estimado?: boolean;
  /** Ingreso que se repite (suma en vez de restar). */
  entra?: boolean;
  color: string;
  destino?: { tipo: 'tarjeta' | 'prestamo'; id: string };
}

export interface FuenteAgenda {
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  movimientos: Movimiento[];
  recurrentes: Recurrente[];
  mapaCategorias: Map<string, Categoria>;
}

const ORDEN: Record<TipoEvento, number> = { pago: 0, cuota: 1, corte: 2, repite: 3 };

/** Fechas con ese día del mes entre `desde` y `hasta`, ambas incluidas. */
function fechasMensuales(dia: number, desde: string, hasta: string): string[] {
  const lista: string[] = [];
  let f = primerDiaDesde(dia, desde);
  for (let i = 0; f <= hasta && i < 36; i++) {
    lista.push(f);
    f = sumarMeses(f, 1, dia);
  }
  return lista;
}

export function agenda(datos: FuenteAgenda, desde: string, hasta: string, hoy: string): Evento[] {
  const eventos: Evento[] = [];
  const enRango = (f: string) => f >= desde && f <= hasta;
  const pagos = proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy);

  for (const t of datos.tarjetas) {
    const destino = { tipo: 'tarjeta' as const, id: t.id };
    const conMonto = pagos.find((p) => p.tipo === 'tarjeta' && p.id === t.id);
    if (conMonto && enRango(conMonto.fecha)) {
      eventos.push({
        clave: `pago-${t.id}-${conMonto.fecha}`,
        fecha: conMonto.fecha,
        tipo: 'pago',
        titulo: `Pagar ${t.nombre}`,
        montoCentavos: conMonto.montoCentavos,
        estimado: conMonto.estimado,
        color: t.color,
        destino,
      });
    }
    for (const f of fechasMensuales(t.diaPago, desde, hasta)) {
      if (f === conMonto?.fecha) continue;
      // Un último día de pago ya cubierto (pagado) no aparece; los de meses siguientes, sin monto.
      if (f <= hoy) continue;
      const e = estadoTarjeta(t, datos.movimientos, hoy);
      if (f <= e.fechaLimite) continue;
      eventos.push({ clave: `pago-${t.id}-${f}`, fecha: f, tipo: 'pago', titulo: `Último día de pago ${t.nombre}`, color: t.color, destino });
    }
    for (const f of fechasMensuales(t.diaCorte, desde, hasta)) {
      eventos.push({ clave: `corte-${t.id}-${f}`, fecha: f, tipo: 'corte', titulo: `Corte ${t.nombre}`, color: t.color, destino });
    }
  }

  for (const p of datos.prestamos) {
    const e = estadoPrestamo(p, datos.movimientos, hoy);
    if (!e.proximaFecha) continue;
    const ancla = aDate(p.primeraCuota).getDate();
    for (let i = 0; i < 36; i++) {
      const f = sumarMeses(e.proximaFecha, i, ancla);
      if (f > hasta || (e.fechaFin && f > e.fechaFin)) break;
      if (!enRango(f)) continue;
      eventos.push({
        clave: `cuota-${p.id}-${f}`,
        fecha: f,
        tipo: 'cuota',
        titulo: `Cuota ${p.nombre}`,
        montoCentavos: i === 0 ? e.proximaCuotaCentavos : p.cuotaCentavos,
        color: 'var(--primario)',
        destino: { tipo: 'prestamo', id: p.id },
      });
    }
  }

  for (const r of datos.recurrentes) {
    if (!r.activo || r.tipo === 'pago') continue;
    const c = r.categoriaId ? datos.mapaCategorias.get(r.categoriaId) : undefined;
    const titulo = r.nota || (r.tipo === 'ingreso' ? (r.esPago ? 'Mi sueldo' : 'Ingreso') : (c?.nombre ?? 'Gasto'));
    let f = r.proxima;
    for (let i = 0; f <= hasta && i < 36; i++) {
      if (f >= desde) {
        eventos.push({
          clave: `repite-${r.id}-${f}`,
          fecha: f,
          tipo: 'repite',
          titulo,
          montoCentavos: r.montoCentavos,
          entra: r.tipo === 'ingreso',
          color: r.tipo === 'ingreso' ? 'var(--positivo)' : (c?.color ?? 'var(--tenue)'),
        });
      }
      f = siguienteFecha({ proxima: f, dia: r.dia });
    }
  }

  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN[a.tipo] - ORDEN[b.tipo]);
}

