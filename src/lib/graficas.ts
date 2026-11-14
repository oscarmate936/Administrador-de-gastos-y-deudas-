import type { Foto, Movimiento } from '../db';
import { mesDe, moverMes } from './fechas';
import { esSalida } from './resumen';

export interface MesFlujo {
  mes: string;
  ingresosCentavos: number;
  salidasCentavos: number;
}

/** Ingresos y salidas de los últimos `n` meses, terminando en `ultimoMes`. */
export function flujoPorMes(movimientos: Movimiento[], ultimoMes: string, n = 6): MesFlujo[] {
  const meses = Array.from({ length: n }, (_, i) => moverMes(ultimoMes, i - n + 1));
  const porMes = new Map(meses.map((m) => [m, { mes: m, ingresosCentavos: 0, salidasCentavos: 0 }]));
  for (const m of movimientos) {
    const fila = porMes.get(mesDe(m.fecha));
    if (!fila) continue;
    if (m.tipo === 'ingreso') fila.ingresosCentavos += m.montoCentavos;
    else if (esSalida(m)) fila.salidasCentavos += m.montoCentavos;
  }
  return meses.map((m) => porMes.get(m)!);
}

/** Deuda total de cada mes con foto guardada, en orden. */
export function deudaPorMes(historial: Foto[]): Array<{ mes: string; deudaCentavos: number }> {
  return [...historial].sort((a, b) => a.mes.localeCompare(b.mes)).map((f) => ({ mes: f.mes, deudaCentavos: f.deudaTotalCentavos }));
}

/** Tope "redondo" del eje (1, 1.5, 2, 2.5, 3, 4, 5, 6 u 8 por potencia de 10), justo por encima del máximo. */
export function topeEje(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * potencia >= maximo) return f * potencia;
  return 10 * potencia;
}
