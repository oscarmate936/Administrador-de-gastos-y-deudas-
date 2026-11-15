import type { Categoria, Foto, Movimiento } from '../db';
import { mesDe, moverMes } from './fechas';
import { gastosPorCategoria, totalesDelMes } from './resumen';

// Resumen del mes que terminó: se muestra en Inicio los primeros días del mes y
// lo anuncia una notificación el día 1.

/** Días del mes en que Inicio muestra el resumen del mes anterior. */
export const DIAS_RESUMEN = 7;

export interface CierreMes {
  /** "AAAA-MM" del mes que terminó. */
  mes: string;
  entroCentavos: number;
  gastadoCentavos: number;
  aDeudasCentavos: number;
  /** Lo que entró menos lo que salió (efectivo, débito y pagos). Negativo si salió más. */
  sobroCentavos: number;
  /** Cuánto bajó la deuda total en el mes (negativo si subió); null sin datos de ambos meses. */
  bajoDeudaCentavos: number | null;
  /** Categoría con más gasto. */
  mayor: { nombre: string; totalCentavos: number; porcentaje: number } | null;
  /** Gasto del mes menos el del mes anterior; null si el anterior no tiene gastos. */
  contraAnteriorCentavos: number | null;
}

const sumarGastos = (movs: Movimiento[]) => movs.filter((m) => m.tipo === 'gasto').reduce((t, m) => t + m.montoCentavos, 0);

export function cierreDelMes(
  datos: { movimientos: Movimiento[]; categorias: Categoria[]; historial: Foto[] },
  mes: string,
): CierreMes | null {
  const t = totalesDelMes(datos.movimientos, mes);
  if (t.movimientos.length === 0) return null;
  const gastado = sumarGastos(t.movimientos);
  const aDeudas = t.movimientos.filter((m) => m.tipo === 'pago').reduce((s, m) => s + m.montoCentavos, 0);

  // La deuda al cerrar el mes anterior contra la de este mes (fotos mensuales).
  const fotoDe = (m: string) => datos.historial.find((f) => f.mes === m);
  const actual = fotoDe(mes);
  const anterior = fotoDe(moverMes(mes, -1));
  const bajo = actual && anterior ? anterior.deudaTotalCentavos - actual.deudaTotalCentavos : null;

  const existentes = new Set(datos.categorias.map((c) => c.id));
  const [primera] = gastosPorCategoria(t.movimientos, existentes);
  const mayor =
    primera && gastado > 0
      ? {
          nombre: datos.categorias.find((c) => c.id === primera.categoriaId)?.nombre ?? 'Sin categoría',
          totalCentavos: primera.totalCentavos,
          porcentaje: Math.round((primera.totalCentavos / gastado) * 100),
        }
      : null;

  const gastoAnterior = sumarGastos(datos.movimientos.filter((m) => mesDe(m.fecha) === moverMes(mes, -1)));
  return {
    mes,
    entroCentavos: t.ingresosCentavos,
    gastadoCentavos: gastado,
    aDeudasCentavos: aDeudas,
    sobroCentavos: t.ingresosCentavos - t.salidasCentavos,
    bajoDeudaCentavos: bajo,
    mayor,
    contraAnteriorCentavos: gastoAnterior > 0 ? gastado - gastoAnterior : null,
  };
}

/** El mes cuyo resumen toca mostrar hoy (los primeros días del mes), o null. */
export function mesParaResumen(hoy: string, visto?: string): string | null {
  if (Number(hoy.slice(8, 10)) > DIAS_RESUMEN) return null;
  const mes = moverMes(mesDe(hoy), -1);
  return visto === mes ? null : mes;
}
