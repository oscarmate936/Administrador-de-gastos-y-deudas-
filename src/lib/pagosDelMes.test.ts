import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { pagosDelMes } from './pagosDelMes';

const visa: Tarjeta = {
  id: 'v', nombre: 'Visa', banco: '', limiteCentavos: 200000, diaCorte: 22, diaPago: 17, saldoInicialCentavos: 70000,
  pendienteInicialCentavos: 63480, fechaSaldo: '2026-10-22', color: '#000', creadoEn: 0, tasaAnual: 40,
  ultimoEstado: { fechaCorte: '2026-10-22', fechaLimite: '2026-11-17', pagoContadoCentavos: 63480, pagoMinimoCentavos: 7420, saldoCentavos: 70000 },
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
    const cuota = mov({ tipo: 'pago', montoCentavos: 6600, fecha: '2026-11-28', prestamoId: 'p', capitalCentavos: 3600 });
    expect(pagosDelMes({ tarjetas: [], prestamos: [prestamo], movimientos: [cuota] }, '2026-11-29')).toEqual([]);
  });

  it('lo del mes siguiente aparece solo si faltan 7 días o menos; lo vencido, siempre', () => {
    const diciembre = { ...prestamo, primeraCuota: '2026-12-03' };
    expect(pagosDelMes({ tarjetas: [], prestamos: [diciembre], movimientos: [] }, '2026-11-14')).toEqual([]);
    expect(pagosDelMes({ tarjetas: [], prestamos: [diciembre], movimientos: [] }, '2026-11-27')).toHaveLength(1);
    const vencida = { ...prestamo, primeraCuota: '2026-10-28' };
    expect(pagosDelMes({ tarjetas: [], prestamos: [vencida], movimientos: [] }, '2026-11-14')[0]).toMatchObject({ vencido: true, fecha: '2026-10-28' });
  });

  it('la tarjeta muestra el mínimo y, como dato, el pago de contado', () => {
    const [p] = pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [] }, '2026-11-14');
    expect(p).toMatchObject({ clase: 'minimo', montoCentavos: 7420, totalCentavos: 63480, vencido: false });
  });

  it('con el mínimo cubierto: quien paga el total ve lo que falta; quien paga el mínimo, nada', () => {
    const minimo = mov({ tipo: 'pago', montoCentavos: 7420, fecha: '2026-11-10', tarjetaId: 'v' });
    expect(pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [minimo] }, '2026-11-14')).toMatchObject([{ clase: 'total', montoCentavos: 56060 }]);
    expect(pagosDelMes({ tarjetas: [{ ...visa, formaPago: 'minimo' }], prestamos: [], movimientos: [minimo] }, '2026-11-14')).toEqual([]);
    // Pasado el último día de pago ya no se pide: lo que quedó pasa al siguiente estado de cuenta.
    expect(pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [minimo] }, '2026-11-19')).toEqual([]);
    // Sin cubrir el mínimo, queda vencida.
    expect(pagosDelMes({ tarjetas: [visa], prestamos: [], movimientos: [] }, '2026-11-19')).toMatchObject([{ clase: 'minimo', vencido: true, montoCentavos: 7420 }]);
  });

  it('con el sueldo configurado, entra todo lo que vence antes del próximo sueldo, también el siguiente estado de cuenta', () => {
    const recomendado: Tarjeta = { ...visa, formaPago: 'recomendado' };
    const pagado = mov({ tipo: 'pago', montoCentavos: 20000, fecha: '2026-11-15', tarjetaId: 'v' });
    // Sueldo el 20 de noviembre; el próximo, el 18 de diciembre.
    const lista = pagosDelMes({ tarjetas: [recomendado], prestamos: [prestamo], movimientos: [pagado] }, '2026-11-20', '2026-12-18');
    expect(lista.map((p) => [p.nombre, p.fecha, p.clase, p.estimado])).toEqual([
      ['Préstamo', '2026-11-28', 'cuota', false],
      ['Visa', '2026-12-17', 'recomendado', true],
    ]);
    // Sin sueldo configurado, lo de diciembre no aparece todavía.
    expect(pagosDelMes({ tarjetas: [recomendado], prestamos: [], movimientos: [pagado] }, '2026-11-20')).toEqual([]);
  });

  it('sin estado de cuenta importado, el mínimo es un cálculo que desaparece al pagarlo', () => {
    const manual: Tarjeta = { ...visa, ultimoEstado: undefined };
    const [p] = pagosDelMes({ tarjetas: [manual], prestamos: [], movimientos: [] }, '2026-11-14');
    expect(p.estimado).toBe(true);
    expect(p.montoCentavos).toBeGreaterThan(0);
    expect(p.montoCentavos).toBeLessThanOrEqual(63480);
    const pagado = mov({ tipo: 'pago', montoCentavos: p.montoCentavos, fecha: '2026-11-13', tarjetaId: 'v' });
    expect(pagosDelMes({ tarjetas: [{ ...manual, formaPago: 'minimo' }], prestamos: [], movimientos: [pagado] }, '2026-11-14')).toEqual([]);
  });
});
