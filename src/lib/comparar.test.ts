import { describe, expect, it } from 'vitest';
import type { Movimiento, Recurrente } from '../db';
import { cambiosContraMesAnterior, fijosYVariables } from './comparar';

let n = 0;
const mov = (tipo: Movimiento['tipo'], fecha: string, montoCentavos: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`,
  tipo,
  fecha,
  montoCentavos,
  nota: '',
  creadoEn: n,
  ...extra,
});
const gasto = (fecha: string, monto: number, categoriaId?: string, extra: Partial<Movimiento> = {}) =>
  mov('gasto', fecha, monto, { categoriaId, ...extra });

describe('cambiosContraMesAnterior', () => {
  const movs = [
    gasto('2026-10-05', 10000, 'comida'),
    gasto('2026-10-06', 4000, 'transporte'),
    gasto('2026-10-07', 1000, 'ocio'),
    gasto('2026-11-05', 14000, 'comida'),
    gasto('2026-11-06', 3400, 'transporte', { tarjetaId: 'visa' }),
    gasto('2026-11-07', 1200, 'ocio'),
    gasto('2026-11-08', 2000, 'salud'),
  ];
  it('ordena por el cambio más grande e ignora cambios menores de $5', () => {
    const c = cambiosContraMesAnterior(movs, '2026-11');
    expect(c.map((x) => [x.categoriaId, x.diferenciaCentavos, x.porcentaje])).toEqual([
      ['comida', 4000, 40],
      ['salud', 2000, null],
      ['transporte', -600, -15],
    ]);
  });
  it('sin datos del mes anterior no compara', () => {
    expect(cambiosContraMesAnterior(movs, '2026-10')).toEqual([]);
  });
});

describe('fijosYVariables', () => {
  const netflix: Recurrente = { id: 'r', tipo: 'gasto', montoCentavos: 1500, nota: 'Netflix', dia: 14, proxima: '2026-12-14', activo: true, creadoEn: 1 };
  const internet: Recurrente = { ...netflix, id: 'r2', nota: '', categoriaId: 'servicios', montoCentavos: 2500 };
  it('separa lo que se repite y las cuotas de préstamos del resto', () => {
    const movs = [
      gasto('2026-11-14', 1500, 'ocio', { nota: 'netflix' }),
      gasto('2026-11-05', 2500, 'servicios'),
      gasto('2026-11-06', 4000, 'servicios'),
      gasto('2026-11-07', 3000, 'comida', { tarjetaId: 'visa' }),
      mov('pago', '2026-11-10', 12500, { prestamoId: 'p1' }),
      mov('pago', '2026-11-11', 5000, { prestamoId: 'p1', esExtra: true }),
      mov('pago', '2026-11-12', 9000, { tarjetaId: 'visa' }),
      gasto('2026-10-07', 9999, 'comida'),
    ];
    const r = fijosYVariables(movs, [netflix, internet], () => 'Personal', (id) => (id === 'servicios' ? 'Servicios' : 'Otro'), '2026-11');
    expect(r.fijosCentavos).toBe(16500);
    expect(r.variablesCentavos).toBe(7000);
    expect(r.fijos).toEqual([
      { nombre: 'Cuota Personal', montoCentavos: 12500 },
      { nombre: 'Servicios', montoCentavos: 2500 },
      { nombre: 'Netflix', montoCentavos: 1500 },
    ]);
  });
});
