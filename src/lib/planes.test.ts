import { describe, expect, it } from 'vitest';
import type { Movimiento, Tarjeta } from '../db';
import { cortesEntre, estadoTarjeta, proyectarPlan } from './deudas';
import { fotoDeHoy } from './historial';
import { deudasParaPlan } from './plan';
import type { PlanCuotas } from './estados/tipos';

// Cifras inventadas con la forma de un estado de cuenta de Davivienda (corte 22 oct).
const compra: PlanCuotas = { descripcion: 'TIENDA A', tasaMensual: 0, cuotaActual: 15, cuotasTotales: 18, cuotaCentavos: 3100, saldoCentavos: 9310 };
const extra: PlanCuotas = { descripcion: 'Extrafinanciamiento', tasaMensual: 1.67, cuotaActual: 3, cuotasTotales: 72, cuotaCentavos: 3150, saldoCentavos: 125600 };

const tarjeta: Tarjeta = {
  id: 'v', nombre: 'Visa', banco: 'Davivienda', limiteCentavos: 145000, diaCorte: 22, diaPago: 17,
  saldoInicialCentavos: 70310, pendienteInicialCentavos: 70310, fechaSaldo: '2026-10-22', color: '', creadoEn: 0, tasaAnual: 47,
  ultimoEstado: {
    fechaCorte: '2026-10-22', fechaLimite: '2026-11-17', pagoContadoCentavos: 70310, pagoMinimoCentavos: 7420,
    saldoCentavos: 70310, planes: [compra, extra],
  },
};

describe('compras a plazos y extrafinanciamiento', () => {
  it('cuenta cortes por meses', () => {
    expect(cortesEntre('2026-10-22', '2026-10-22')).toBe(0);
    expect(cortesEntre('2026-10-22', '2026-11-22')).toBe(1);
    expect(cortesEntre('2026-10-22', '2027-01-22')).toBe(3);
  });

  it('una compra sin intereses baja una cuota por corte y la última cobra lo que falta', () => {
    expect(proyectarPlan(compra, 1)).toMatchObject({ cobradoCentavos: 3100, plan: { saldoCentavos: 6210, restantes: 2, cuotaActual: 16 } });
    expect(proyectarPlan(compra, 3)).toMatchObject({ cobradoCentavos: 9310, plan: { saldoCentavos: 0, restantes: 0 } });
    expect(proyectarPlan(compra, 10).cobradoCentavos).toBe(9310);
  });

  it('el crédito disponible no baja por las cuotas que pasan al saldo, solo por sus intereses', () => {
    const conDisponible: Tarjeta = { ...tarjeta, ultimoEstado: { ...tarjeta.ultimoEstado!, disponibleCentavos: 30000 } };
    expect(estadoTarjeta(conDisponible, [], '2026-11-10').creditoDisponibleCentavos).toBe(30000);
    // Tras el corte del 22 nov: la compra sin intereses no cambia nada; el extrafinanciamiento suma sus intereses (20.98).
    expect(estadoTarjeta(conDisponible, [], '2026-11-25').creditoDisponibleCentavos).toBe(30000 - 2098);
    // Una compra y un pago posteriores sí lo mueven.
    const compraNueva: Movimiento = { id: 'n', tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-01', tarjetaId: 'v', nota: '', creadoEn: 1 };
    const pagoNuevo: Movimiento = { id: 'q', tipo: 'pago', montoCentavos: 2000, fecha: '2026-11-02', tarjetaId: 'v', nota: '', creadoEn: 1 };
    expect(estadoTarjeta(conDisponible, [compraNueva, pagoNuevo], '2026-11-10').creditoDisponibleCentavos).toBe(30000 - 5000 + 2000);
  });

  it('el extrafinanciamiento cobra intereses sobre lo que falta', () => {
    const r = proyectarPlan(extra, 1);
    // 1.67% de 1,256.00 = 20.98 de interés; baja 31.50 - 20.98 = 10.52 de capital.
    expect(r.cobradoCentavos).toBe(3150);
    expect(r.plan.saldoCentavos).toBe(125600 + 2098 - 3150);
  });

  it('la tarjeta recién importada: saldo del banco y planes aparte', () => {
    const e = estadoTarjeta(tarjeta, [], '2026-11-14');
    expect(e.saldoCentavos).toBe(70310);
    expect(e.planesCentavos).toBe(9310 + 125600);
    expect(e.deudaTotalCentavos).toBe(70310 + 9310 + 125600);
    expect(e.pendienteCentavos).toBe(70310);
    // El próximo estado de cuenta suma las cuotas de los planes.
    expect(e.proximoEstadoCentavos).toBe(70310 + 3100 + 3150);
  });

  it('después del siguiente corte las cuotas pasan a la tarjeta y la deuda total no se duplica', () => {
    const e = estadoTarjeta(tarjeta, [], '2026-11-25');
    expect(e.corteAnterior).toBe('2026-11-22');
    expect(e.saldoCentavos).toBe(70310 + 3100 + 3150);
    expect(e.planes.map((p) => [p.descripcion, p.cuotaActual, p.saldoCentavos])).toEqual([
      ['TIENDA A', 16, 6210],
      ['Extrafinanciamiento', 4, 125600 + 2098 - 3150],
    ]);
    // Solo crece por los intereses del extrafinanciamiento.
    expect(e.deudaTotalCentavos).toBe(70310 + 9310 + 125600 + 2098);
    expect(e.pendienteCentavos).toBe(70310 + 3100 + 3150);
  });

  it('los pagos bajan la tarjeta pero no los planes', () => {
    const pago: Movimiento = { id: 'p', tipo: 'pago', montoCentavos: 70310, fecha: '2026-11-10', tarjetaId: 'v', nota: '', creadoEn: 1 };
    const e = estadoTarjeta(tarjeta, [pago], '2026-11-14');
    expect(e.saldoCentavos).toBe(0);
    expect(e.pendienteCentavos).toBe(0);
    expect(e.deudaTotalCentavos).toBe(9310 + 125600);
  });

  it('el historial y el plan de pagos incluyen los planes', () => {
    expect(fotoDeHoy({ movimientos: [], tarjetas: [tarjeta], prestamos: [] }, '2026-11-14').deudaTotalCentavos).toBe(70310 + 9310 + 125600);
    const deudas = deudasParaPlan({ tarjetas: [tarjeta], prestamos: [], movimientos: [] }, '2026-11-14');
    expect(deudas.map((d) => [d.nombre, d.saldoCentavos, d.minimoCentavos, d.tasaAnual])).toEqual([
      ['Visa · TIENDA A', 9310, 3100, 0],
      ['Visa · Extrafinanciamiento', 125600, 3150, 20.04],
      // Mínimo del banco (74.20) menos la cuota del extrafinanciamiento (31.50).
      ['Visa', 70310, 4270, 47],
    ]);
    expect(deudas.every((d) => d.abrir.id === 'v')).toBe(true);
  });
});
