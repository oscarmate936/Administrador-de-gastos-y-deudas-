import { describe, expect, it } from 'vitest';
import type { Foto } from '../db';
import { hitosNuevos, progresoDeudas } from './progreso';

const foto = (mes: string, deuda: number): Foto => ({ mes, fecha: `${mes}-28`, disponibleCentavos: 0, deudaTotalCentavos: deuda, deudas: [] });

describe('progresoDeudas', () => {
  it('mide lo pagado contra lo más alto que has debido', () => {
    const p = progresoDeudas([foto('2026-08', 600000), foto('2026-09', 800000), foto('2026-10', 700000)], 600000)!;
    expect(p).toEqual({ maximoCentavos: 800000, actualCentavos: 600000, pagadoCentavos: 200000, porcentaje: 25 });
  });
  it('la deuda de hoy cuenta si es la más alta', () => {
    expect(progresoDeudas([foto('2026-10', 100000)], 300000)!.porcentaje).toBe(0);
  });
  it('solo llega a 100 % cuando ya no debes nada', () => {
    expect(progresoDeudas([foto('2026-10', 100000)], 1)!.porcentaje).toBe(99);
    expect(progresoDeudas([foto('2026-10', 100000)], 0)!.porcentaje).toBe(100);
  });
  it('sin deudas nunca no hay progreso', () => {
    expect(progresoDeudas([], 0)).toBeNull();
  });
});

describe('hitosNuevos', () => {
  it('devuelve las metas alcanzadas que faltan por celebrar', () => {
    expect(hitosNuevos(60, [])).toEqual([25, 50]);
    expect(hitosNuevos(60, [25])).toEqual([50]);
    expect(hitosNuevos(60, [25, 50])).toEqual([]);
    expect(hitosNuevos(100, [25, 50, 75])).toEqual([100]);
  });
});
