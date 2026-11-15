import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { costosEntre } from './costos';
import { estadoPrestamo } from './deudas';
import { deudasParaPlan, minimoEstimado, simularPlan, sumaMinimos, type DeudaPlan } from './plan';

const deuda = (id: string, saldo: number, tasa: number, minimo: number): DeudaPlan => ({
  tipo: 'tarjeta', id, nombre: id, saldoCentavos: saldo, tasaAnual: tasa, tasaConocida: true, minimoCentavos: minimo, minimoEstimado: false,
  abrir: { tipo: 'tarjeta', id },
});

describe('plan para salir de deudas', () => {
  const a = deuda('cara', 120000, 47, 8000);
  const b = deuda('barata-chica', 40000, 20, 2000);

  it('avalancha ataca primero la tasa más alta y bola de nieve el saldo más pequeño', () => {
    const av = simularPlan([a, b], 30000, 'avalancha');
    const bo = simularPlan([a, b], 30000, 'bola');
    expect(av.primerMes).toEqual([{ id: 'cara', montoCentavos: 28000 }, { id: 'barata-chica', montoCentavos: 2000 }]);
    expect(bo.primerMes).toEqual([{ id: 'cara', montoCentavos: 8000 }, { id: 'barata-chica', montoCentavos: 22000 }]);
    expect(av.fines[0].id).toBe('cara');
    expect(bo.fines[0].id).toBe('barata-chica');
    // La avalancha nunca paga más intereses que la bola de nieve.
    expect(av.interesesCentavos).toBeLessThanOrEqual(bo.interesesCentavos);
    expect(av.meses).not.toBeNull();
  });

  it('pagar más que los mínimos termina antes y cuesta menos que solo los mínimos', () => {
    const minimos = simularPlan([a, b], sumaMinimos([a, b]), 'avalancha', { reinvertir: false });
    const plan = simularPlan([a, b], 30000, 'avalancha');
    expect(minimos.meses!).toBeGreaterThan(plan.meses!);
    expect(minimos.interesesCentavos).toBeGreaterThan(plan.interesesCentavos);
  });

  it('cada mes primero se abona y después se cobran intereses sobre lo que queda', () => {
    // 100.00 al 12% anual (1% al mes) pagando 50.00 fijos:
    // mes 1: 100 - 50 = 50, +0.50 de interés; mes 2: 50.50 - 50 = 0.50, +0.01; mes 3: paga 0.51.
    const r = simularPlan([deuda('d', 10000, 12, 5000)], 5000, 'avalancha', { reinvertir: false });
    expect(r.meses).toBe(3);
    expect(r.interesesCentavos).toBe(51);
  });

  it('avisa cuando el pago no alcanza para los mínimos', () => {
    expect(simularPlan([a, b], 9000, 'avalancha')).toMatchObject({ alcanza: false, meses: null });
  });

  it('no termina nunca si el mínimo no cubre los intereses', () => {
    expect(simularPlan([deuda('x', 100000, 60, 1000)], 1000, 'avalancha').meses).toBeNull();
  });

  it('estima el mínimo sin estado de cuenta', () => {
    expect(minimoEstimado(131040, 47)).toBe(5132 + 3276);
    expect(minimoEstimado(20000, 0)).toBe(1000);
    expect(minimoEstimado(500, 30)).toBe(500);
  });

  it('arma las deudas desde las tarjetas y préstamos registrados', () => {
    const t: Tarjeta = {
      id: 't', nombre: 'Visa', banco: '', limiteCentavos: 60000, diaCorte: 6, diaPago: 1, saldoInicialCentavos: 41250,
      pendienteInicialCentavos: 41250, fechaSaldo: '2026-11-06', color: '', creadoEn: 0, tasaAnual: 39.9,
      ultimoEstado: { fechaCorte: '2026-11-06', fechaLimite: '2026-12-01', pagoContadoCentavos: 41250, pagoMinimoCentavos: 820, saldoCentavos: 41250 },
    };
    const vacia: Tarjeta = { ...t, id: 'v', saldoInicialCentavos: 0, ultimoEstado: undefined, tasaAnual: undefined };
    const p: Prestamo = { id: 'p', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000, primeraCuota: '2026-11-30', creadoEn: 0 };
    expect(deudasParaPlan({ tarjetas: [t, vacia], prestamos: [p], movimientos: [] }, '2026-11-14')).toEqual([
      // El mínimo del estado (8.20) no cubre ni los intereses: se usa intereses + 1%.
      { tipo: 'tarjeta', id: 't', nombre: 'Visa', saldoCentavos: 41250, tasaAnual: 39.9, tasaConocida: true, minimoCentavos: 1372 + 413, minimoEstimado: false, abrir: { tipo: 'tarjeta', id: 't' } },
      {
        tipo: 'prestamo', id: 'p', nombre: 'Personal', saldoCentavos: 100000, tasaAnual: 12, tasaConocida: true, minimoCentavos: 10000, minimoEstimado: false,
        abrir: { tipo: 'prestamo', id: 'p' }, prestamo: { factorCargos: 0, periodos: { desde: '2026-10-30', primera: '2026-11-30', ancla: 30 } },
      },
    ]);
  });

  it('pagando solo la cuota, el plan termina el préstamo el mismo mes que su detalle', () => {
    const p: Prestamo = {
      id: 'p', nombre: 'BAC', acreedor: '', saldoInicialCentavos: 431520, tasaAnual: 8.25, cuotaCentavos: 6600, cargosCentavos: 640,
      cargosBaseCentavos: 431520, primeraCuota: '2026-12-03', inicioPeriodo: '2026-10-22', creadoEn: 0,
    };
    const datos = { tarjetas: [], prestamos: [p], movimientos: [] };
    const e = estadoPrestamo(p, [], '2026-11-14');
    const deudas = deudasParaPlan(datos, '2026-11-14');
    expect(simularPlan(deudas, 6600, 'avalancha').meses).toBe(e.proyeccion!.meses);
    expect(simularPlan(deudas, 6600, 'avalancha', { reinvertir: false }).meses).toBe(e.proyeccion!.meses);
    // Con $20 más al mes, termina antes.
    expect(simularPlan(deudas, 8600, 'avalancha').meses!).toBeLessThan(e.proyeccion!.meses);
  });
});

describe('costo de las deudas', () => {
  const t: Tarjeta = {
    id: 't', nombre: 'Visa', banco: '', limiteCentavos: 1, diaCorte: 1, diaPago: 1, saldoInicialCentavos: 0,
    pendienteInicialCentavos: 0, fechaSaldo: '2026-01-01', color: '', creadoEn: 0,
  };
  const p: Prestamo = { id: 'p', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 1, tasaAnual: 1, cuotaCentavos: 1, primeraCuota: '2026-01-01', creadoEn: 0 };
  const m = (x: Partial<Movimiento>): Movimiento => ({ id: Math.random().toString(), tipo: 'gasto', montoCentavos: 0, fecha: '2026-11-10', nota: '', creadoEn: 0, ...x });
  const movimientos = [
    m({ tarjetaId: 't', categoriaId: 'intereses', montoCentavos: 4187, nota: 'INTERES SOBRE SALDO' }),
    m({ tarjetaId: 't', categoriaId: 'intereses', montoCentavos: 400, nota: 'CARGO POR ADELANTO DE EFECTIVO' }),
    m({ tarjetaId: 't', categoriaId: 'intereses', montoCentavos: 52, nota: 'IVA COMISION' }),
    m({ tarjetaId: 't', categoriaId: 'otros', montoCentavos: 8000, nota: 'AVANCE DE EFECTIVO POR TRANSF.' }),
    m({ tarjetaId: 't', categoriaId: 'super', montoCentavos: 5000, nota: 'SUPER' }),
    m({ tipo: 'pago', prestamoId: 'p', montoCentavos: 12500, capitalCentavos: 7687 }),
    m({ tarjetaId: 't', categoriaId: 'intereses', montoCentavos: 999, fecha: '2026-10-31' }),
  ];

  it('separa intereses, comisiones y avances del periodo', () => {
    const c = costosEntre({ movimientos, tarjetas: [t], prestamos: [p] }, '2026-11-01', '2026-11-30');
    expect(c.interesesCentavos).toBe(4187 + 4813);
    expect(c.comisionesCentavos).toBe(452);
    expect(c.totalCentavos).toBe(4187 + 4813 + 452);
    expect(c.avances).toEqual({ cantidad: 1, montoCentavos: 8000 });
    expect(c.porDeuda.map((d) => [d.nombre, d.interesesCentavos, d.comisionesCentavos])).toEqual([
      ['Personal', 4813, 0],
      ['Visa', 4187, 452],
    ]);
  });

  it('los seguros de las cuotas no cuentan como intereses', () => {
    const conSeguro: Prestamo = { ...p, saldoInicialCentavos: 431520, cargosCentavos: 640, cargosBaseCentavos: 431520 };
    const nuevo = m({ tipo: 'pago', prestamoId: 'p', montoCentavos: 6600, capitalCentavos: 1840, cargosCentavos: 640 });
    // Un pago viejo sin seguros anotados: se estiman con el saldo de antes del pago.
    const viejo = m({ tipo: 'pago', prestamoId: 'p', montoCentavos: 6600, capitalCentavos: 1840, fecha: '2026-11-03' });
    const c = costosEntre({ movimientos: [viejo, nuevo], tarjetas: [], prestamos: [conSeguro] }, '2026-11-01', '2026-11-30');
    expect(c.segurosCentavos).toBe(640 + 640);
    expect(c.interesesCentavos).toBe(2 * (6600 - 1840 - 640));
    expect(c.totalCentavos).toBe(c.interesesCentavos);
  });
});
