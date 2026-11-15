import { describe, expect, it } from 'vitest';
import type { Movimiento } from '../db';
import { calcularRitmo, intervaloDePago } from './ritmo';

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
const pago = (fecha: string, monto = 90000) => mov('ingreso', fecha, monto, { esPago: true });

describe('intervaloDePago', () => {
  it('supone una quincena con menos de dos pagos', () => {
    expect(intervaloDePago([pago('2026-11-01')], '2026-11-14')).toEqual({ dias: 15, supuesto: true });
  });
  it('usa la mediana de los intervalos entre pagos', () => {
    const movs = [pago('2026-09-01'), pago('2026-09-15'), pago('2026-10-01'), pago('2026-10-20'), pago('2026-11-01')];
    // Intervalos: 14, 16, 19, 12 → mediana 15
    expect(intervaloDePago(movs, '2026-11-14')).toEqual({ dias: 15, supuesto: false });
  });
  it('ignora otros ingresos y limita entre 7 y 45 días', () => {
    const movs = [pago('2026-01-01'), pago('2026-06-01'), mov('ingreso', '2026-03-01', 100)];
    expect(intervaloDePago(movs, '2026-11-14').dias).toBe(45);
    expect(intervaloDePago([pago('2026-11-01'), pago('2026-11-03')], '2026-11-14').dias).toBe(7);
  });
});

describe('calcularRitmo', () => {
  it('reparte lo libre en los días que faltan y calcula hasta cuándo alcanza', () => {
    const movs = [
      pago('2026-11-01'),
      mov('gasto', '2026-11-01', 1000),
      mov('gasto', '2026-11-05', 2000),
      // Con tarjeta y pagos de deudas no cuentan en el ritmo.
      mov('gasto', '2026-11-05', 9999, { tarjetaId: 't' }),
      mov('pago', '2026-11-06', 5000, { tarjetaId: 't' }),
    ];
    const r = calcularRitmo(movs, '2026-11-10', 30000)!;
    expect(r.proximoPago).toBe('2026-11-16');
    expect(r.diasRestantes).toBe(6);
    expect(r.porDiaCentavos).toBe(5000);
    // 3000 en 10 días = 300 por día; 30000 / 300 = 100 días
    expect(r.gastoDiarioCentavos).toBe(300);
    expect(r.alcanzaHasta).toBe('2027-02-18');
    expect(r.acumulado).toHaveLength(10);
    expect(r.acumulado[0]).toBe(1000);
    expect(r.acumulado[9]).toBe(3000);
    expect(r.diasPeriodo).toBe(15);
    expect(r.totalPeriodoCentavos).toBe(33000);
    expect(r.idealHoyCentavos).toBe(22000);
  });
  it('sin nada libre no hay monto por día ni fecha', () => {
    const r = calcularRitmo([pago('2026-11-01'), mov('gasto', '2026-11-02', 500)], '2026-11-10', -200)!;
    expect(r.porDiaCentavos).toBeNull();
    expect(r.alcanzaHasta).toBeNull();
  });
  it('si el pago ya debía haber llegado, supone que llega mañana', () => {
    const r = calcularRitmo([pago('2026-10-20')], '2026-11-10', 10000)!;
    expect(r.pagoAtrasado).toBe(true);
    expect(r.proximoPago).toBe('2026-11-11');
    expect(r.diasRestantes).toBe(1);
    // Lo libre no se da todo para hoy: se reparte en una semana.
    expect(r.porDiaCentavos).toBe(Math.floor(10000 / 7));
  });
  it('sin pago registrado no hay ritmo', () => {
    expect(calcularRitmo([mov('gasto', '2026-11-02', 500)], '2026-11-10', 1000)).toBeNull();
  });
});
