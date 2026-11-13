import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import {
  ahorroPorAbono,
  capitalSugerido,
  cortesFacturados,
  estadoPrestamo,
  estadoTarjeta,
  montoFacturado,
  primerDiaDesde,
  primerDiaDespues,
  proximosPagos,
  proyectar,
  sumarMeses,
  textoDuracion,
  totalPorPagar,
  ultimoDiaHasta,
} from './deudas';

let n = 0;
function mov(parcial: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento {
  n += 1;
  return { id: `m${n}`, nota: '', creadoEn: n, ...parcial };
}

describe('fechas mensuales', () => {
  it('encuentra el día anterior y el siguiente', () => {
    expect(ultimoDiaHasta(20, '2026-11-13')).toBe('2026-10-20');
    expect(ultimoDiaHasta(20, '2026-11-20')).toBe('2026-11-20');
    expect(primerDiaDespues(20, '2026-11-20')).toBe('2026-12-20');
    expect(primerDiaDesde(20, '2026-11-20')).toBe('2026-11-20');
    expect(primerDiaDespues(5, '2026-12-20')).toBe('2027-01-05');
    expect(ultimoDiaHasta(20, '2027-01-05')).toBe('2026-12-20');
  });

  it('en meses cortos usa el último día', () => {
    expect(ultimoDiaHasta(31, '2027-02-15')).toBe('2027-01-31');
    expect(primerDiaDespues(31, '2027-02-15')).toBe('2027-02-28');
    expect(ultimoDiaHasta(31, '2027-02-28')).toBe('2027-02-28');
    expect(primerDiaDespues(31, '2027-02-28')).toBe('2027-03-31');
    expect(primerDiaDespues(30, '2028-02-01')).toBe('2028-02-29');
  });

  it('suma meses sin perder el día original', () => {
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(sumarMeses('2027-02-28', 1, 30)).toBe('2027-03-30');
    expect(sumarMeses('2026-11-15', 14)).toBe('2028-01-15');
  });
});

describe('cuotas de compras', () => {
  it('cuenta los cortes desde la compra, incluido el día de corte', () => {
    expect(cortesFacturados(20, '2026-11-20', '2026-11-20')).toBe(1);
    expect(cortesFacturados(20, '2026-11-21', '2026-11-20')).toBe(0);
    expect(cortesFacturados(20, '2026-11-21', '2027-02-20')).toBe(3);
    expect(cortesFacturados(31, '2027-01-31', '2027-02-28')).toBe(2);
  });

  it('reparte el monto y deja el sobrante en la última cuota', () => {
    expect(montoFacturado(10000, 3, 0)).toBe(0);
    expect(montoFacturado(10000, 3, 1)).toBe(3333);
    expect(montoFacturado(10000, 3, 2)).toBe(6666);
    expect(montoFacturado(10000, 3, 3)).toBe(10000);
    expect(montoFacturado(10000, 3, 7)).toBe(10000);
    expect(montoFacturado(10000, 1, 1)).toBe(10000);
  });
});

describe('estadoTarjeta', () => {
  const tarjeta: Tarjeta = {
    id: 't1',
    nombre: 'Visa',
    banco: 'Banco Agrícola',
    limiteCentavos: 100000,
    diaCorte: 20,
    diaPago: 15,
    saldoInicialCentavos: 30000,
    pendienteInicialCentavos: 10000,
    fechaSaldo: '2026-11-13',
    color: '#000',
    creadoEn: 0,
  };
  const pago = mov({ tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-14', tarjetaId: 't1' });
  const compra = mov({ tipo: 'gasto', montoCentavos: 6000, fecha: '2026-11-18', tarjetaId: 't1' });
  const enCuotas = mov({ tipo: 'gasto', montoCentavos: 12000, fecha: '2026-11-21', tarjetaId: 't1', cuotas: 3 });
  const deOtraTarjeta = mov({ tipo: 'gasto', montoCentavos: 99999, fecha: '2026-11-18', tarjetaId: 't2' });

  it('recién registrada usa el pendiente que dijo la persona', () => {
    const e = estadoTarjeta(tarjeta, [deOtraTarjeta], '2026-11-13');
    expect(e.saldoCentavos).toBe(30000);
    expect(e.creditoDisponibleCentavos).toBe(70000);
    expect(e.corteAnterior).toBe('2026-10-20');
    expect(e.proximoCorte).toBe('2026-11-20');
    expect(e.fechaLimite).toBe('2026-11-15');
    expect(e.pendienteCentavos).toBe(10000);
    expect(e.diasParaLimite).toBe(2);
    expect(e.vencido).toBe(false);
    expect(e.proximoEstadoCentavos).toBe(30000);
    expect(e.proximaFechaLimite).toBe('2026-12-15');
  });

  it('pasada la fecha límite sin pagar queda vencido', () => {
    const e = estadoTarjeta(tarjeta, [], '2026-11-16');
    expect(e.vencido).toBe(true);
    expect(e.diasParaLimite).toBe(-1);
  });

  it('al pagar el pendiente ya no debe nada de ese estado de cuenta', () => {
    const e = estadoTarjeta(tarjeta, [pago], '2026-11-16');
    expect(e.pendienteCentavos).toBe(0);
    expect(e.vencido).toBe(false);
    expect(e.saldoCentavos).toBe(20000);
    expect(e.proximoEstadoCentavos).toBe(20000);
  });

  it('después del corte factura el saldo, las compras del periodo y solo la primera cuota', () => {
    const e = estadoTarjeta(tarjeta, [pago, compra, enCuotas], '2026-11-25');
    expect(e.corteAnterior).toBe('2026-11-20');
    expect(e.fechaLimite).toBe('2026-12-15');
    expect(e.saldoCentavos).toBe(30000 + 6000 + 12000 - 10000);
    // La compra en cuotas fue después del corte: todavía no se factura nada de ella.
    expect(e.pendienteCentavos).toBe(30000 + 6000 - 10000);
    expect(e.proximoEstadoCentavos).toBe(30000 + 6000 + 4000 - 10000);
  });

  it('las cuotas se van facturando un corte a la vez', () => {
    const movs = [pago, compra, enCuotas];
    expect(estadoTarjeta(tarjeta, movs, '2026-12-25').pendienteCentavos).toBe(26000 + 4000);
    expect(estadoTarjeta(tarjeta, movs, '2027-01-25').pendienteCentavos).toBe(26000 + 8000);
    expect(estadoTarjeta(tarjeta, movs, '2027-02-25').pendienteCentavos).toBe(26000 + 12000);
  });

  it('un pago después del corte baja lo pendiente y nunca queda negativo', () => {
    const abono = mov({ tipo: 'pago', montoCentavos: 20000, fecha: '2026-11-28', tarjetaId: 't1' });
    expect(estadoTarjeta(tarjeta, [pago, compra, abono], '2026-11-29').pendienteCentavos).toBe(6000);
    const total = mov({ tipo: 'pago', montoCentavos: 50000, fecha: '2026-11-28', tarjetaId: 't1' });
    const e = estadoTarjeta(tarjeta, [pago, compra, total], '2026-11-29');
    expect(e.pendienteCentavos).toBe(0);
    expect(e.saldoCentavos).toBe(-24000);
  });
});

describe('préstamos', () => {
  it('proyecta mes a mes con interés sobre saldo', () => {
    expect(proyectar(100000, 12, 10000)).toEqual({ meses: 11, interesesCentavos: 5898 });
    expect(proyectar(100000, 0, 25000)).toEqual({ meses: 4, interesesCentavos: 0 });
    expect(proyectar(100000, 0, 30000)).toEqual({ meses: 4, interesesCentavos: 0 });
    expect(proyectar(0, 12, 10000)).toEqual({ meses: 0, interesesCentavos: 0 });
  });

  it('avisa cuando la cuota no cubre ni los intereses', () => {
    expect(proyectar(100000, 12, 1000)).toBeNull();
  });

  it('separa capital e intereses de un pago', () => {
    expect(capitalSugerido(100000, 12, 10000, false)).toBe(9000);
    expect(capitalSugerido(100000, 12, 10000, true)).toBe(10000);
    expect(capitalSugerido(100000, 12, 500, false)).toBe(0);
    expect(capitalSugerido(5000, 12, 10000, true)).toBe(5000);
  });

  it('calcula lo que se gana con un abono extra', () => {
    expect(ahorroPorAbono(100000, 12, 10000, 20000)).toEqual({ mesesMenos: 2, interesesAhorradosCentavos: 2089 });
    expect(ahorroPorAbono(100000, 12, 1000, 20000)).toBeNull();
  });

  const prestamo: Prestamo = {
    id: 'p1',
    nombre: 'Personal',
    acreedor: 'Davivienda',
    montoOriginalCentavos: 200000,
    saldoInicialCentavos: 100000,
    tasaAnual: 12,
    cuotaCentavos: 10000,
    primeraCuota: '2026-11-30',
    creadoEn: 0,
  };
  const cuota = (fecha: string, capital: number) =>
    mov({ tipo: 'pago', montoCentavos: 10000, fecha, prestamoId: 'p1', capitalCentavos: capital });

  it('sin pagos: próxima cuota, tiempo restante y fecha de término', () => {
    const e = estadoPrestamo(prestamo, [], '2026-11-13');
    expect(e.saldoCentavos).toBe(100000);
    expect(e.proximaFecha).toBe('2026-11-30');
    expect(e.diasParaPago).toBe(17);
    expect(e.proximaCuotaCentavos).toBe(10000);
    expect(e.proyeccion?.meses).toBe(11);
    expect(e.fechaFin).toBe('2027-09-30');
    expect(e.avance).toBeCloseTo(0.5);
    expect(e.vencido).toBe(false);
  });

  it('cada cuota avanza un mes y conserva el día aunque febrero sea corto', () => {
    const pagos = [cuota('2026-11-30', 9000), cuota('2026-12-30', 9090), cuota('2027-01-30', 9181)];
    expect(estadoPrestamo(prestamo, pagos.slice(0, 1), '2026-12-01').proximaFecha).toBe('2026-12-30');
    expect(estadoPrestamo(prestamo, pagos, '2027-02-01').proximaFecha).toBe('2027-02-28');
    const cuatro = [...pagos, cuota('2027-02-28', 9273)];
    const e = estadoPrestamo(prestamo, cuatro, '2027-03-01');
    expect(e.proximaFecha).toBe('2027-03-30');
    expect(e.saldoCentavos).toBe(63456);
    expect(e.cuotasPagadas).toBe(4);
  });

  it('un abono extra baja el saldo sin contar como cuota', () => {
    const extra = mov({ tipo: 'pago', montoCentavos: 20000, fecha: '2026-11-14', prestamoId: 'p1', capitalCentavos: 20000, esExtra: true });
    const e = estadoPrestamo(prestamo, [extra], '2026-11-15');
    expect(e.saldoCentavos).toBe(80000);
    expect(e.proximaFecha).toBe('2026-11-30');
    expect(e.proyeccion?.meses).toBe(9);
    expect(e.fechaFin).toBe('2027-07-30');
  });

  it('marca la cuota vencida y, saldado, ya no pide pagos', () => {
    expect(estadoPrestamo(prestamo, [], '2026-12-01').vencido).toBe(true);
    const todo = mov({ tipo: 'pago', montoCentavos: 100000, fecha: '2026-11-14', prestamoId: 'p1', capitalCentavos: 100000, esExtra: true });
    const e = estadoPrestamo(prestamo, [todo], '2026-12-01');
    expect(e.saldoCentavos).toBe(0);
    expect(e.proximaFecha).toBeNull();
    expect(e.vencido).toBe(false);
    expect(e.avance).toBe(1);
  });

  it('la última cuota es solo lo que falta', () => {
    const casi = mov({ tipo: 'pago', montoCentavos: 95000, fecha: '2026-11-14', prestamoId: 'p1', capitalCentavos: 95000, esExtra: true });
    expect(estadoPrestamo(prestamo, [casi], '2026-11-15').proximaCuotaCentavos).toBe(5050);
  });

  it('describe duraciones', () => {
    expect(textoDuracion(1)).toBe('1 mes');
    expect(textoDuracion(8)).toBe('8 meses');
    expect(textoDuracion(12)).toBe('1 año');
    expect(textoDuracion(27)).toBe('2 años y 3 meses');
    expect(textoDuracion(0)).toBe('0 meses');
  });

  it('junta los próximos pagos por fecha y suma los que vencen pronto', () => {
    const tarjeta: Tarjeta = {
      id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
      saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-13', color: '#000', creadoEn: 0,
    };
    const sinPendiente: Tarjeta = { ...tarjeta, id: 't2', nombre: 'Master', pendienteInicialCentavos: 0, saldoInicialCentavos: 5000 };
    const sinDeuda: Tarjeta = { ...tarjeta, id: 't3', nombre: 'Vacía', pendienteInicialCentavos: 0, saldoInicialCentavos: 0 };
    const lista = proximosPagos([tarjeta, sinPendiente, sinDeuda], [prestamo], [], '2026-11-13');
    expect(lista.map((p) => [p.nombre, p.fecha, p.montoCentavos, p.estimado])).toEqual([
      ['Visa', '2026-11-15', 10000, false],
      ['Personal', '2026-11-30', 10000, false],
      ['Master', '2026-12-15', 5000, true],
    ]);
    expect(totalPorPagar(lista, 30)).toBe(20000);
    expect(totalPorPagar(lista, 45)).toBe(25000);
  });
});
