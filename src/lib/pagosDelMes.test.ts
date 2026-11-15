import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { pagosDelMes } from './pagosDelMes';

const visa: Tarjeta = {
  id: 'v', nombre: 'Visa', banco: '', limiteCentavos: 200000, diaCorte: 22, diaPago: 17, saldoInicialCentavos: 70000,
  pendienteInicialCentavos: 64152, fechaSaldo: '2026-10-22', color: '#000', creadoEn: 0, tasaAnual: 40,
  ultimoEstado: { fechaCorte: '2026-10-22', fechaLimite: '2026-11-17', pagoContadoCentavos: 64152, pagoMinimoCentavos: 7420, saldoCentavos: 70000 },
};
const prestamo: Prestamo = {
  id: 'p', nombre: 'Préstamo', acreedor: '', saldoInicialCentavos: 300000, tasaAnual: 12, cuotaCentavos: 6600, primeraCuota: '2026-11-28', creadoEn: 0,
};
const mov = (x: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento => ({ id: Math.random().toString(), nota: '', creadoEn: 0, ...x });

describe('próximos pagos del mes', () => {
  it('el mínimo de cada tarjeta y la cuota de cada préstamo de este mes, por fecha', () => {
    const lista = pagosDelMes({ tarjetas: [visa], prestamos: [prestamo], movimientos: [] }, '2026-11-14');
    expect(lista.map((p) => [p.nombre, p.clase, p.montoCentavos, p.fecha, p.estimado])).toEqual([
      ['Visa', 'minimo', 7420, '2026-11-17', false],
      ['Préstamo', 'cuota', 6600, '2026-11-28', false],
    ]);
  });

  it('lo ya pagado se descuenta y lo cubierto desaparece', () => {
    const abono = mov({ tipo: 'pago', montoCentavos: 5000, fecha: '2026-11-10', tarjetaId: 'v' });
    expect(pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [abono] }, '2026-11-14')[0].montoCentavos).toBe(2420);
    const minimo = mov({ tipo: 'pago', montoCentavos: 7420, fecha: '2026-11-10', tarjetaId: 'v' });
    expect(pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [minimo] }, '2026-11-14')).toEqual([]);
    const cuota = mov({ tipo: 'pago', montoCentavos: 6600, fecha: '2026-11-28', prestamoId: 'p', capitalCentavos: 3600 });
    expect(pagosDelMes({ tarjetas: [], prestamos: [prestamo], movimientos: [cuota] }, '2026-11-29')).toEqual([]);
  });

  it('lo que vence el mes siguiente no aparece; lo vencido de antes, sí', () => {
    const diciembre = { ...prestamo, primeraCuota: '2026-12-03' };
    expect(pagosDelMes({ tarjetas: [], prestamos: [diciembre], movimientos: [] }, '2026-11-14')).toEqual([]);
    const vencida = { ...prestamo, primeraCuota: '2026-10-28' };
    expect(pagosDelMes({ tarjetas: [], prestamos: [vencida], movimientos: [] }, '2026-11-14')[0]).toMatchObject({ vencido: true, fecha: '2026-10-28' });
  });

  it('sin estado de cuenta importado, el mínimo es un cálculo', () => {
    const manual: Tarjeta = { ...visa, ultimoEstado: undefined };
    const [p] = pagosDelMes({ tarjetas: [manual], prestamos: [], movimientos: [] }, '2026-11-14');
    expect(p.estimado).toBe(true);
    expect(p.montoCentavos).toBeGreaterThan(0);
    expect(p.montoCentavos).toBeLessThanOrEqual(64152);
  });
});
