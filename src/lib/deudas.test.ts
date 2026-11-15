import { describe, expect, it } from 'vitest';
import { calcularDisponible } from './resumen';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import {
  diasDePlazo,
  ahorroDelAbono,
  ahorroPorAbono,
  ajustarPrestamo,
  capitalDelPago,
  capitalSugerido,
  contarCuotas,
  desglosePago,
  inicioSegunDesglose,
  interesPorDias,
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
    fechaSaldo: '2026-11-12',
    color: '#000',
    creadoEn: 0,
  };
  const pago = mov({ tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-14', tarjetaId: 't1' });
  const compra = mov({ tipo: 'gasto', montoCentavos: 6000, fecha: '2026-11-18', tarjetaId: 't1' });
  const enCuotas = mov({ tipo: 'gasto', montoCentavos: 12000, fecha: '2026-11-21', tarjetaId: 't1', cuotas: 3 });
  const deOtraTarjeta = mov({ tipo: 'gasto', montoCentavos: 99999, fecha: '2026-11-18', tarjetaId: 't2' });

  it('pagar el mínimo a tiempo no deja la tarjeta vencida; solo genera intereses', () => {
    const conEstado: Tarjeta = {
      ...tarjeta, saldoInicialCentavos: 70000, pendienteInicialCentavos: 64152, fechaSaldo: '2026-10-20', diaPago: 17, tasaAnual: 40,
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-17', pagoContadoCentavos: 64152, pagoMinimoCentavos: 7420, saldoCentavos: 70000 },
    };
    const minimo = mov({ tipo: 'pago', montoCentavos: 7420, fecha: '2026-11-15', tarjetaId: 't1' });
    // Sin pagar nada: vencida.
    expect(estadoTarjeta(conEstado, [], '2026-11-19')).toMatchObject({ vencido: true, minimoPendienteCentavos: 7420, minimoEsEstimado: false });
    // Con el mínimo pagado: no hay mora, pero lo que quedó genera intereses.
    const e = estadoTarjeta(conEstado, [minimo], '2026-11-19');
    expect(e).toMatchObject({ vencido: false, minimoPendienteCentavos: 0, pendienteCentavos: 56732, interesEstimadoCentavos: 1891 });
    expect(e.deudaTotalCentavos).toBe(62580 + 1891);
    // Tras el corte del 20 nov los intereses no desaparecen: pasan al nuevo estado de cuenta.
    const tras = estadoTarjeta(conEstado, [minimo], '2026-11-23');
    expect(tras.interesEstimadoCentavos).toBe(1891);
    expect(tras.deudaTotalCentavos).toBe(62580 + 1891);
    expect(tras.pendienteCentavos).toBe(62580 + 1891);
    expect(tras.vencido).toBe(false);
    // Si tampoco se paga ese estado de cuenta, se suma otro mes de intereses.
    const dosMeses = estadoTarjeta(conEstado, [minimo], '2026-12-19');
    expect(dosMeses.interesEstimadoCentavos).toBe(1891 + Math.round(((62580 + 1891) * 40) / 1200));
  });

  it('con intereses estimados, el saldo, lo que debes y el pago de contado cuadran', () => {
    const conEstado: Tarjeta = {
      ...tarjeta, saldoInicialCentavos: 70000, pendienteInicialCentavos: 64152, fechaSaldo: '2026-10-20', diaPago: 17, tasaAnual: 40,
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-17', pagoContadoCentavos: 64152, pagoMinimoCentavos: 7420, saldoCentavos: 70000, disponibleCentavos: 30000 },
    };
    const minimo = mov({ tipo: 'pago', montoCentavos: 7420, fecha: '2026-11-15', tarjetaId: 't1' });
    const e = estadoTarjeta(conEstado, [minimo], '2026-11-23');
    // Los $18.91 de intereses van dentro del saldo.
    expect(e.saldoCentavos).toBe(62580 + 1891);
    expect(e.deudaTotalCentavos).toBe(e.saldoCentavos);
    expect(e.pendienteCentavos).toBeLessThanOrEqual(e.saldoCentavos);
    expect(e.creditoDisponibleCentavos).toBe(30000 + 7420 - 1891);
    // Al pagar todo el pago de contado, queda en cero: ni saldo negativo ni deuda de más.
    const todo = mov({ tipo: 'pago', montoCentavos: e.pendienteCentavos, fecha: '2026-11-24', tarjetaId: 't1' });
    const tras = estadoTarjeta(conEstado, [minimo, todo], '2026-11-25');
    expect([tras.saldoCentavos, tras.deudaTotalCentavos, tras.pendienteCentavos]).toEqual([0, 0, 0]);
  });

  it('cuenta los días entre el corte y el último día de pago', () => {
    expect(diasDePlazo(20, 15)).toBe(25);
    expect(diasDePlazo(6, 1)).toBe(25);
    expect(diasDePlazo(5, 25)).toBe(20);
    // Un plazo de un día casi seguro es un día mal escrito.
    expect(diasDePlazo(30, 31)).toBe(1);
    expect(diasDePlazo(28, 2)).toBe(4);
    expect(diasDePlazo(10, 10)).toBe(30);
  });

  it('pagar casi todo el estado de cuenta no genera intereses estimados', () => {
    const conTasa = { ...tarjeta, tasaAnual: 36 };
    // Debía $100.00 y pagó $97.50: la diferencia es chica (una compra sin anotar, un redondeo).
    const casi = mov({ tipo: 'pago', montoCentavos: 9750, fecha: '2026-11-14', tarjetaId: 't1' });
    expect(estadoTarjeta(conTasa, [casi], '2026-11-16').interesEstimadoCentavos).toBe(0);
    // Si quedan $20 sin pagar, sí.
    const menos = mov({ tipo: 'pago', montoCentavos: 8000, fecha: '2026-11-14', tarjetaId: 't1' });
    expect(estadoTarjeta(conTasa, [menos], '2026-11-16').interesEstimadoCentavos).toBe(60);
  });

  it('una devolución no cuenta como pago del mínimo', () => {
    const conEstado: Tarjeta = {
      ...tarjeta, saldoInicialCentavos: 70000, pendienteInicialCentavos: 64152, fechaSaldo: '2026-10-20', diaPago: 17,
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-17', pagoContadoCentavos: 64152, pagoMinimoCentavos: 7420, saldoCentavos: 70000 },
    };
    const devolucion = mov({ tipo: 'pago', montoCentavos: 8000, fecha: '2026-11-05', tarjetaId: 't1', esDevolucion: true });
    const e = estadoTarjeta(conEstado, [devolucion], '2026-11-10');
    expect(e.pagoMinimoCentavos).toBe(7420);
    // Pero sí baja lo pendiente del estado de cuenta.
    expect(e.pendienteCentavos).toBe(64152 - 8000);
  });

  it('sin estado de cuenta, el mínimo aproximado se calcula una vez y baja al pagarlo', () => {
    const manual: Tarjeta = { ...tarjeta, saldoInicialCentavos: 87822, pendienteInicialCentavos: 82912, fechaSaldo: '2026-11-01', tasaAnual: 39.9 };
    const antes = estadoTarjeta(manual, [], '2026-11-10');
    expect(antes).toMatchObject({ pagoMinimoCentavos: null, minimoEsEstimado: true });
    const minimo = antes.minimoPendienteCentavos;
    expect(minimo).toBe(Math.round((82912 * 39.9) / 1200) + Math.round(82912 * 0.025));
    // Pagado completo, ya no pide más.
    const pagado = mov({ tipo: 'pago', montoCentavos: minimo, fecha: '2026-11-09', tarjetaId: 't1' });
    expect(estadoTarjeta(manual, [pagado], '2026-11-10').minimoPendienteCentavos).toBe(0);
    // Con la mitad pagada, pide la otra mitad (no un mínimo nuevo sobre el saldo).
    const mitad = mov({ tipo: 'pago', montoCentavos: 2000, fecha: '2026-11-09', tarjetaId: 't1' });
    expect(estadoTarjeta(manual, [mitad], '2026-11-10').minimoPendienteCentavos).toBe(minimo - 2000);
    // Como es aproximado, pagar casi todo (80 %) lo da por cubierto y no marca vencido.
    const casi = mov({ tipo: 'pago', montoCentavos: Math.ceil(minimo * 0.8), fecha: '2026-11-09', tarjetaId: 't1' });
    expect(estadoTarjeta(manual, [casi], '2026-11-16')).toMatchObject({ minimoPendienteCentavos: 0, vencido: false });
  });

  it('si pasa el último día de pago sin pagar el total, suma los intereses estimados', () => {
    const conTasa = { ...tarjeta, tasaAnual: 36 };
    // Antes del 15 nov no hay intereses; después, 3% de lo pendiente ($100).
    expect(estadoTarjeta(conTasa, [], '2026-11-14').interesEstimadoCentavos).toBe(0);
    const e = estadoTarjeta(conTasa, [], '2026-11-16');
    expect(e.interesEstimadoCentavos).toBe(300);
    expect(e.deudaTotalCentavos).toBe(30000 + 300);
    // Sin tasa no se puede estimar; pagado el total, no hay intereses.
    expect(estadoTarjeta(tarjeta, [], '2026-11-16').interesEstimadoCentavos).toBe(0);
    expect(estadoTarjeta(conTasa, [pago], '2026-11-16').interesEstimadoCentavos).toBe(0);
  });

  it('una devolución baja la deuda de la tarjeta pero no el dinero disponible', () => {
    const devolucion = mov({ tipo: 'pago', montoCentavos: 2000, fecha: '2026-11-14', tarjetaId: 't1', esDevolucion: true });
    expect(estadoTarjeta(tarjeta, [devolucion], '2026-11-15').saldoCentavos).toBe(28000);
    expect(calcularDisponible([devolucion])).toBe(0);
    expect(calcularDisponible([pago])).toBe(-10000);
  });

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

  it('lo anterior a fechaSaldo ya está en el saldo y no cuenta otra vez', () => {
    const viejo = mov({ tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-12', tarjetaId: 't1' });
    const pagoViejo = mov({ tipo: 'pago', montoCentavos: 5000, fecha: '2026-11-01', tarjetaId: 't1' });
    const hoyMismo = mov({ tipo: 'gasto', montoCentavos: 700, fecha: '2026-11-13', tarjetaId: 't1' });
    const e = estadoTarjeta(tarjeta, [viejo, pagoViejo, hoyMismo], '2026-11-13');
    expect(e.saldoCentavos).toBe(30700);
    expect(e.pendienteCentavos).toBe(10000);
    expect(e.pagoMinimoCentavos).toBeNull();
    expect(e.segunEstado).toBe(false);
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

describe('tarjeta con estado de cuenta importado', () => {
  const tarjeta: Tarjeta = {
    id: 't1', nombre: 'Visa', banco: 'Banco Agrícola', limiteCentavos: 60000, diaCorte: 6, diaPago: 1,
    saldoInicialCentavos: 41250, pendienteInicialCentavos: 41250, fechaSaldo: '2026-11-06', color: '#000', creadoEn: 0,
    ultimoEstado: { fechaCorte: '2026-11-06', fechaLimite: '2026-12-01', pagoContadoCentavos: 41250, pagoMinimoCentavos: 820, saldoCentavos: 41250 },
  };

  it('usa las cifras del estado de cuenta y descuenta los pagos posteriores', () => {
    const e = estadoTarjeta(tarjeta, [], '2026-11-13');
    expect(e.segunEstado).toBe(true);
    expect(e.corteAnterior).toBe('2026-11-06');
    expect(e.fechaLimite).toBe('2026-12-01');
    expect(e.pendienteCentavos).toBe(41250);
    expect(e.pagoMinimoCentavos).toBe(820);
    const abono = mov({ tipo: 'pago', montoCentavos: 500, fecha: '2026-11-10', tarjetaId: 't1' });
    const e2 = estadoTarjeta(tarjeta, [abono], '2026-11-13');
    expect(e2.pagoMinimoCentavos).toBe(320);
    expect(e2.pendienteCentavos).toBe(40750);
  });

  it('si el banco corrió el corte unos días, manda la fecha del estado de cuenta', () => {
    const corrido: Tarjeta = { ...tarjeta, diaCorte: 8, fechaSaldo: '2026-11-07', ultimoEstado: { ...tarjeta.ultimoEstado!, fechaCorte: '2026-11-07' } };
    const e = estadoTarjeta(corrido, [], '2026-11-13');
    expect(e.corteAnterior).toBe('2026-11-07');
    expect(e.proximoCorte).toBe('2026-12-08');
    expect(e.pendienteCentavos).toBe(41250);
  });

  it('pasado el siguiente corte vuelve a calcular y ya no hay pago mínimo conocido', () => {
    const e = estadoTarjeta(tarjeta, [], '2026-12-07');
    expect(e.segunEstado).toBe(false);
    expect(e.corteAnterior).toBe('2026-12-06');
    expect(e.pagoMinimoCentavos).toBeNull();
    expect(e.fechaLimite).toBe('2027-01-01');
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

  it('los seguros y otros cargos de la cuota no bajan el saldo y bajan con él', () => {
    // Cuota de $100 con seguro del 1% del saldo: el primer mes $10 no van a capital ni intereses.
    expect(capitalSugerido(100000, 12, 10000, false, 0.01)).toBe(8000);
    // Un abono extra va todo a capital aunque la cuota tenga cargos.
    expect(capitalSugerido(100000, 12, 10000, true, 0.01)).toBe(10000);
    const conSeguro = proyectar(100000, 12, 10000, 0.01)!.meses;
    // Tarda más que sin seguro, pero menos que con $10 fijos, porque el seguro baja con el saldo.
    expect(conSeguro).toBeGreaterThan(proyectar(100000, 12, 10000)!.meses);
    expect(conSeguro).toBeLessThanOrEqual(proyectar(100000, 12, 9000)!.meses);
    const conCargos: Prestamo = { ...prestamo, cargosCentavos: 1000 };
    expect(estadoPrestamo(conCargos, [], '2026-11-13').cargosCuotaCentavos).toBe(1000);
    // Tras abonar la mitad, el seguro también es la mitad.
    const extra = mov({ tipo: 'pago', montoCentavos: 50000, fecha: '2026-11-14', prestamoId: 'p1', capitalCentavos: 50000, esExtra: true });
    expect(estadoPrestamo(conCargos, [extra], '2026-11-15').cargosCuotaCentavos).toBe(500);
    // La última cuota cubre saldo, intereses de los días y cargos.
    const casi = estadoPrestamo({ ...conCargos, saldoInicialCentavos: 2000, cargosBaseCentavos: 100000 }, [], '2026-11-13');
    expect(casi.proximaCuotaCentavos).toBe(2000 + interesPorDias(2000, 12, 31) + 20);
    const ajustado = ajustarPrestamo(prestamo, [], '2026-11-13', { saldoCentavos: 90000, cargosCentavos: 640 });
    expect([ajustado.cargosCentavos, ajustado.cargosBaseCentavos]).toEqual([640, 90000]);
  });

  it('cobra el interés por los días desde el último pago de cuota', () => {
    expect(interesPorDias(100000, 12, 30)).toBe(986);
    expect(interesPorDias(100000, 12, 31)).toBe(1019);
    // Sin pagos, el período empieza un mes antes de la primera cuota (31 días de oct-nov).
    const e = estadoPrestamo(prestamo, [], '2026-11-13');
    expect(e.inicioPeriodo).toBe('2026-10-30');
    expect(capitalDelPago(prestamo, e, 10000, false, '2026-11-30')).toBe(10000 - 1019);
    // Pagar antes de la fecha cobra menos días; los días que faltan pasan a la cuota siguiente.
    expect(capitalDelPago(prestamo, e, 10000, false, '2026-11-20')).toBe(10000 - interesPorDias(100000, 12, 21));
    const temprano = mov({ tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-20', prestamoId: 'p1', capitalCentavos: 9310 });
    const despues = estadoPrestamo(prestamo, [temprano], '2026-11-21');
    expect(despues.inicioPeriodo).toBe('2026-11-20');
    expect(despues.proximaFecha).toBe('2026-12-30');
    // Un abono extra no reinicia el período.
    const extra = mov({ tipo: 'pago', montoCentavos: 5000, fecha: '2026-12-05', prestamoId: 'p1', capitalCentavos: 5000, esExtra: true });
    expect(estadoPrestamo(prestamo, [temprano, extra], '2026-12-06').inicioPeriodo).toBe('2026-11-20');
    // El último pago al banco, si se conoce, manda sobre el mes anterior.
    expect(estadoPrestamo({ ...prestamo, inicioPeriodo: '2026-10-19' }, [], '2026-11-13').inicioPeriodo).toBe('2026-10-19');
  });

  it('al actualizar sin desglose ni pagos anotados, no cobra meses de interés de golpe', () => {
    const p: Prestamo = { ...prestamo, saldoInicialCentavos: 431520, tasaAnual: 8.25, cuotaCentavos: 6600, cargosCentavos: 640, cargosBaseCentavos: 431520, primeraCuota: '2026-12-03', inicioPeriodo: '2026-10-22' };
    const act = ajustarPrestamo(p, [], '2027-01-10', { saldoCentavos: 429000, cuotaCentavos: 6600, tasaAnual: 8.25, proximaFecha: '2027-02-03', cargosCentavos: 640 });
    expect(act.inicioPeriodo).toBe('2027-01-03');
    const e = estadoPrestamo(act, [], '2027-01-10');
    expect(e.inicioPeriodo).toBe('2027-01-03');
    expect(e.proyeccion).not.toBeNull();
    // Un pago al banco que no se anotó: manda la fecha del banco, no el último pago anotado.
    const viejo = mov({ tipo: 'pago', montoCentavos: 6600, fecha: '2026-12-03', prestamoId: 'p1', capitalCentavos: 1840 });
    const conPago = ajustarPrestamo(p, [viejo], '2027-02-10', { saldoCentavos: 425000, proximaFecha: '2027-03-03' });
    expect(estadoPrestamo(conPago, [viejo], '2027-02-10').inicioPeriodo).toBe('2027-02-03');
    // Aunque quede un dato viejo guardado, un período nunca pasa de dos meses.
    expect(estadoPrestamo({ ...p, inicioPeriodo: '2026-01-01' }, [], '2026-11-20').inicioPeriodo).toBe('2026-11-03');
  });

  it('los pagos parciales se suman hasta completar la cuota', () => {
    const pago = (id: string, fecha: string, monto: number, capital: number) =>
      mov({ id, tipo: 'pago', montoCentavos: monto, fecha, prestamoId: 'p1', capitalCentavos: capital });
    // Dos mitades cuentan como una cuota.
    const mitades = [pago('a', '2026-11-25', 5000, 4000), pago('b', '2026-11-30', 5000, 5000)];
    expect(contarCuotas(mitades, 10000)).toMatchObject({ cuotas: 1, ultimaCompleta: '2026-11-30', parcialCentavos: 0 });
    expect(estadoPrestamo(prestamo, mitades, '2026-12-01').proximaFecha).toBe('2026-12-30');
    // Con una sola mitad, la cuota sigue pendiente y falta la otra mitad.
    const una = estadoPrestamo(prestamo, mitades.slice(0, 1), '2026-11-26');
    expect(una.proximaFecha).toBe('2026-11-30');
    expect(una.parcialCentavos).toBe(5000);
    expect(una.proximaCuotaCentavos).toBe(5000);
    // El segundo pago no vuelve a cobrar los intereses que ya cubrió el primero.
    const d = desglosePago(prestamo, una, 5000, false, '2026-11-30');
    expect(d.interesCentavos).toBe(Math.max(0, interesPorDias(96000, 12, 31) - 1000));
    // Un pago de casi toda la cuota (90 % o más) la completa solo; uno doble cuenta como una.
    expect(contarCuotas([pago('c', '2026-11-30', 9500, 8500)], 10000).cuotas).toBe(1);
    expect(contarCuotas([pago('d', '2026-11-30', 20000, 19000)], 10000).cuotas).toBe(1);
    // Los abonos extra no cuentan como cuota.
    expect(contarCuotas([mov({ tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-30', prestamoId: 'p1', esExtra: true })], 10000).cuotas).toBe(0);
  });

  it('si la cuota sube, los pagos anteriores siguen contando como cuotas completas', () => {
    const p: Prestamo = { ...prestamo, saldoInicialCentavos: 300000, cuotaCentavos: 6600, primeraCuota: '2026-08-03' };
    const pagos = ['2026-08-03', '2026-09-03', '2026-10-03'].map((f) =>
      mov({ tipo: 'pago', montoCentavos: 6600, fecha: f, prestamoId: 'p1', capitalCentavos: 3600, cuotaCentavos: 6600 }),
    );
    expect(estadoPrestamo(p, pagos, '2026-10-20').proximaFecha).toBe('2026-11-03');
    // El banco sube la cuota a $81: la próxima sigue siendo la de noviembre y no está vencida.
    const act = ajustarPrestamo(p, pagos, '2026-10-20', { saldoCentavos: 289000, cuotaCentavos: 8100, proximaFecha: '2026-11-03' });
    expect(estadoPrestamo(act, pagos, '2026-10-20')).toMatchObject({ proximaFecha: '2026-11-03', cuotasPagadas: 3, parcialCentavos: 0, vencido: false, proximaCuotaCentavos: 8100 });
    // Lo mismo al editar la cuota en el formulario.
    expect(estadoPrestamo({ ...p, cuotaCentavos: 8100 }, pagos, '2026-10-20')).toMatchObject({ proximaFecha: '2026-11-03', vencido: false });
    // Un pago nuevo de $66 con la cuota ya en $81 sí es parcial.
    const corto = mov({ tipo: 'pago', montoCentavos: 6600, fecha: '2026-11-03', prestamoId: 'p1', capitalCentavos: 3600, cuotaCentavos: 8100 });
    expect(estadoPrestamo(act, [...pagos, corto], '2026-11-04')).toMatchObject({ proximaFecha: '2026-11-03', parcialCentavos: 6600 });
  });

  it('deduce el último pago a partir del desglose del banco', () => {
    // Cuota de $66.00: $18.40 a capital y $6.40 de seguro, así que $41.20 son intereses de 42 días.
    const datos = { saldoCentavos: 431520, tasaAnual: 8.25, cuotaCentavos: 6600, cargosCentavos: 640, capitalCentavos: 1840, fecha: '2026-12-03' };
    expect(inicioSegunDesglose(datos)).toBe('2026-10-22');
    // Datos que no cuadran con un período razonable no se usan.
    expect(inicioSegunDesglose({ ...datos, capitalCentavos: 5900 })).toBeUndefined();
    expect(inicioSegunDesglose({ ...datos, capitalCentavos: 6000 })).toBeUndefined();
    // Con ese inicio, la cuota del banco y la de la app coinciden casi al centavo.
    const p: Prestamo = { ...prestamo, saldoInicialCentavos: 431520, tasaAnual: 8.25, cuotaCentavos: 6600, cargosCentavos: 640, primeraCuota: '2026-12-03', inicioPeriodo: '2026-10-22' };
    const e = estadoPrestamo(p, [], '2026-11-14');
    expect(Math.abs(capitalDelPago(p, e, 6600, false, '2026-12-03') - 1840)).toBeLessThanOrEqual(25);
    expect(ahorroDelAbono(p, e, 50000)!.mesesMenos).toBeGreaterThan(0);
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
    // $50 de saldo más los intereses de 31 días.
    expect(estadoPrestamo(prestamo, [casi], '2026-11-15').proximaCuotaCentavos).toBe(5000 + interesPorDias(5000, 12, 31));
  });

  it('describe duraciones', () => {
    expect(textoDuracion(1)).toBe('1 mes');
    expect(textoDuracion(8)).toBe('8 meses');
    expect(textoDuracion(12)).toBe('1 año');
    expect(textoDuracion(27)).toBe('2 años y 3 meses');
    expect(textoDuracion(0)).toBe('0 meses');
  });

  it('una tarjeta que se paga con el mínimo pide el mínimo, y cubierto ya no pide nada de ese estado', () => {
    const base: Tarjeta = {
      id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 200000, diaCorte: 20, diaPago: 17, saldoInicialCentavos: 70000,
      pendienteInicialCentavos: 64152, fechaSaldo: '2026-10-20', color: '#000', creadoEn: 0, tasaAnual: 40,
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-17', pagoContadoCentavos: 64152, pagoMinimoCentavos: 7420, saldoCentavos: 70000 },
    };
    const conMinimo: Tarjeta = { ...base, formaPago: 'minimo' };
    const ver = (t: Tarjeta, movs: Movimiento[], hoy: string) => proximosPagos([t], [], movs, hoy).map((p) => [p.fecha, p.montoCentavos, p.vencido, p.estimado]);
    expect(ver(base, [], '2026-11-10')).toEqual([['2026-11-17', 64152, false, false]]);
    expect(ver(conMinimo, [], '2026-11-10')).toEqual([['2026-11-17', 7420, false, false]]);
    // Con el mínimo pagado: la que paga el mínimo pasa al estado de cuenta siguiente (un mínimo aproximado).
    const minimo = mov({ tipo: 'pago', montoCentavos: 7420, fecha: '2026-11-12', tarjetaId: 't1' });
    const siguiente = ver(conMinimo, [minimo], '2026-11-14');
    expect(siguiente).toHaveLength(1);
    expect(siguiente[0][0]).toBe('2026-12-17');
    expect(siguiente[0][3]).toBe(true);
    expect(siguiente[0][1] as number).toBeLessThan(10000);
    // La que paga el total sigue pidiendo el resto hasta el último día de pago…
    expect(ver(base, [minimo], '2026-11-14')).toEqual([['2026-11-17', 56732, false, false]]);
    // …y después ya no aparece como vencida: lo que quedó pasa al siguiente estado de cuenta.
    expect(ver(base, [minimo], '2026-11-19')[0].slice(0, 3)).toEqual(['2026-12-17', 62580 + 1891, false]);
    // Sin cubrir el mínimo, las dos quedan vencidas.
    expect(ver(conMinimo, [], '2026-11-19')).toEqual([['2026-11-17', 7420, true, false]]);
    expect(ver(base, [], '2026-11-19')).toEqual([['2026-11-17', 64152, true, false]]);
  });

  it('junta los próximos pagos por fecha y suma los que vencen pronto', () => {
    const tarjeta: Tarjeta = {
      id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
      saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-12', color: '#000', creadoEn: 0,
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
