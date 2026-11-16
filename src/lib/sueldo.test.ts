import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { AJUSTES_INICIALES, type AjustesSueldo } from './ajustes';
import { diasDePago, periodoDelSueldo, planDelSueldo, textoProximoSueldo } from './sueldo';

let n = 0;
const mov = (m: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento => ({ id: `m${n++}`, nota: '', creadoEn: n, ...m });
const mensual: AjustesSueldo = { ...AJUSTES_INICIALES.sueldo, dia: 30 };
const conBono: AjustesSueldo = { ...mensual, comidaCentavos: 20000 };

describe('periodo del sueldo', () => {
  it('días de pago: mensual o quincenal', () => {
    expect(diasDePago({ frecuencia: 'mensual', dia: 30 })).toEqual([30]);
    expect(diasDePago({ frecuencia: 'quincenal', dia: 15 })).toEqual([15, 30]);
    expect(diasDePago({ frecuencia: 'quincenal', dia: 20 })).toEqual([5, 20]);
    // Sin día elegido, el del último sueldo.
    expect(diasDePago({ frecuencia: 'mensual' }, 28)).toEqual([28]);
  });

  it('mensual: del sueldo al mismo día del mes siguiente', () => {
    const sueldo = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 100000, fecha: '2026-10-30' });
    expect(periodoDelSueldo([sueldo], '2026-11-15', mensual)).toEqual({ desde: '2026-10-30', hasta: '2026-11-30', sueldo });
    // Un sueldo que llega unos días antes cuenta para el periodo siguiente.
    const adelantado = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 100000, fecha: '2026-11-27' });
    expect(periodoDelSueldo([sueldo, adelantado], '2026-11-28', mensual)).toEqual({ desde: '2026-11-27', hasta: '2026-12-30', sueldo: adelantado });
  });

  it('si el sueldo de este mes no se ha registrado, el periodo empieza el día que tocaba', () => {
    const viejo = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 100000, fecha: '2026-09-30' });
    expect(periodoDelSueldo([viejo], '2026-11-15', mensual)).toEqual({ desde: '2026-10-30', hasta: '2026-11-30', sueldo: undefined });
    // Febrero no tiene 30: se usa su último día.
    expect(periodoDelSueldo([], '2027-02-10', mensual)).toMatchObject({ desde: '2027-01-30', hasta: '2027-02-28' });
  });

  it('quincenal: del 15 al 30 y del 30 al 15', () => {
    const q: AjustesSueldo = { ...AJUSTES_INICIALES.sueldo, frecuencia: 'quincenal', dia: 15 };
    expect(periodoDelSueldo([], '2026-11-20', q)).toMatchObject({ desde: '2026-11-15', hasta: '2026-11-30' });
    expect(periodoDelSueldo([], '2026-12-03', q)).toMatchObject({ desde: '2026-11-30', hasta: '2026-12-15' });
  });
});

describe('sueldo sin día fijo (del 18 al 22)', () => {
  const rango: AjustesSueldo = { ...AJUSTES_INICIALES.sueldo, dia: 18, diaHasta: 22 };
  const octubre = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 76500, fecha: '2026-10-20' });

  it('aparta pensando en el primer día posible y lo dice como una ventana', () => {
    const p = periodoDelSueldo([octubre], '2026-11-05', rango);
    expect(p).toMatchObject({ desde: '2026-10-20', hasta: '2026-11-18', hastaMax: '2026-11-22', sueldo: octubre });
    expect(p.esperando).toBeUndefined();
    expect(textoProximoSueldo(p)).toBe('tu sueldo (llega del 18 al 22 nov)');
  });

  it('del 18 al 22, mientras no llega, sigue con el sueldo anterior y lo espera', () => {
    const p = periodoDelSueldo([octubre], '2026-11-20', rango);
    expect(p).toMatchObject({ desde: '2026-10-20', hasta: '2026-11-18', hastaMax: '2026-11-22', esperando: true });
    // Lo que queda se reparte hasta el 22, no en un solo día.
    expect(planDelSueldo({ movimientos: [octubre], tarjetas: [], prestamos: [] }, '2026-11-20', { sueldo: rango }).diasRestantes).toBe(2);
  });

  it('al registrar el sueldo del 21, el siguiente es del 18 al 22 de diciembre', () => {
    const noviembre = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 76500, fecha: '2026-11-21' });
    expect(periodoDelSueldo([octubre, noviembre], '2026-11-21', rango)).toMatchObject({
      desde: '2026-11-21', hasta: '2026-12-18', hastaMax: '2026-12-22', sueldo: noviembre,
    });
  });

  it('si pasa el 22 sin registrarlo, el periodo empieza el 18 sin sueldo', () => {
    expect(periodoDelSueldo([octubre], '2026-11-23', rango)).toMatchObject({ desde: '2026-11-18', hasta: '2026-12-18', sueldo: undefined });
  });
});

describe('plan del sueldo', () => {
  // Sueldo de $1,000 el 30 de octubre; hoy es 15 de noviembre.
  const sueldo = mov({ tipo: 'ingreso', esPago: true, montoCentavos: 100000, fecha: '2026-10-30' });
  const prestamo: Prestamo = {
    id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 300000, tasaAnual: 0, cuotaCentavos: 15000,
    primeraCuota: '2026-11-20', creadoEn: 0,
  };
  // La tarjeta pide $500 de contado o $40 de mínimo, el 25.
  const tarjeta: Tarjeta = {
    id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 200000, diaCorte: 1, diaPago: 25, saldoInicialCentavos: 80000,
    pendienteInicialCentavos: 50000, fechaSaldo: '2026-11-01', color: '', creadoEn: 0,
    ultimoEstado: { fechaCorte: '2026-11-01', fechaLimite: '2026-11-25', pagoContadoCentavos: 50000, pagoMinimoCentavos: 4000, saldoCentavos: 80000 },
  };
  const almuerzo = mov({ tipo: 'gasto', montoCentavos: 3500, fecha: '2026-11-03', categoriaId: 'comida' });
  const super_ = mov({ tipo: 'gasto', montoCentavos: 4500, fecha: '2026-11-08', categoriaId: 'super', tarjetaId: 't1' });
  const bus = mov({ tipo: 'gasto', montoCentavos: 1000, fecha: '2026-11-10', categoriaId: 'transporte' });
  const movimientos = [sueldo, almuerzo, super_, bus];

  it('aparta las deudas del mes y el bono de comida; lo demás es lo que queda', () => {
    const p = planDelSueldo({ movimientos, tarjetas: [{ ...tarjeta, formaPago: 'minimo' }], prestamos: [prestamo] }, '2026-11-15', { sueldo: conBono });
    expect(p.ingresosCentavos).toBe(100000);
    // Cuota de $150 y mínimo de $40.
    expect(p.deudas).toMatchObject({ pagadoCentavos: 0, faltaCentavos: 19000 });
    // Comida: $35 en efectivo y $45 con tarjeta salen del bono de $200.
    // Lo que queda del bono ($120) más lo del súper con tarjeta ($45), que se usará para pagar la tarjeta.
    expect(p.comida).toEqual({ presupuestoCentavos: 20000, gastadoCentavos: 8000, conTarjetaCentavos: 4500, quedaCentavos: 12000, apartadoCentavos: 16500 });
    expect(p.teniasCentavos).toBe(0);
    expect(p.otrosCentavos).toBe(1000);
    // Tienes $1,000 − $35 − $10 = $955; menos $190 de deudas y $165 de comida.
    expect(p.disponibleCentavos).toBe(95500);
    expect(p.libreCentavos).toBe(95500 - 19000 - 16500);
    // Las cuentas del sueldo cuadran: $1,000 − deudas $190 − comida $200 − otros $10.
    expect(p.teniasCentavos + p.ingresosCentavos - (p.deudas.pagadoCentavos + p.deudas.faltaCentavos) - 20000 - p.otrosCentavos).toBe(p.libreCentavos);
    expect(p.diasRestantes).toBe(15);
    expect(p.porDiaCentavos).toBe(Math.floor(60000 / 15));
  });

  it('pagar el total de la tarjeta aparta más que el mínimo', () => {
    const p = planDelSueldo({ movimientos, tarjetas: [tarjeta], prestamos: [prestamo] }, '2026-11-15', { sueldo: conBono });
    expect(p.deudas.faltaCentavos).toBe(15000 + 50000);
  });

  it('lo ya pagado sale de lo que falta', () => {
    const cuota = mov({ tipo: 'pago', montoCentavos: 15000, fecha: '2026-11-12', prestamoId: 'p1', capitalCentavos: 15000, cuotaCentavos: 15000 });
    const p = planDelSueldo({ movimientos: [...movimientos, cuota], tarjetas: [], prestamos: [prestamo] }, '2026-11-15', { sueldo: mensual });
    expect(p.deudas).toMatchObject({ pagadoCentavos: 15000, faltaCentavos: 0 });
  });

  it('si la comida se pasa del bono, no aparta nada más y lo muestra', () => {
    const cena = mov({ tipo: 'gasto', montoCentavos: 18000, fecha: '2026-11-14', categoriaId: 'comida' });
    const p = planDelSueldo({ movimientos: [...movimientos, cena], tarjetas: [], prestamos: [] }, '2026-11-15', { sueldo: conBono });
    expect(p.comida).toMatchObject({ presupuestoCentavos: 20000, gastadoCentavos: 26000, quedaCentavos: 0 });
  });

  it('el fondo y lo que dijiste tener cuentan', () => {
    const p = planDelSueldo({ movimientos, tarjetas: [], prestamos: [] }, '2026-11-15', { sueldo: mensual, fondoCentavos: 5000, ajusteSaldoCentavos: 10000 });
    expect(p.disponibleCentavos).toBe(105500);
    // Los $100 que dijiste tener de más cuentan como lo que traías de antes.
    expect(p.teniasCentavos).toBe(10000);
    expect(p.libreCentavos).toBe(100500);
    // Sin bono, la comida en efectivo cuenta como «otros».
    expect(p.comida).toBeNull();
    expect(p.otrosCentavos).toBe(4500);
  });
});
