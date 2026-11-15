import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { AJUSTES_INICIALES } from './ajustes';
import { generarRecordatorios, idDe } from './recordatorios';

const tarjeta: Tarjeta = {
  id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
  saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-12', color: '#000', creadoEn: 0,
};
const prestamo: Prestamo = {
  id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000,
  primeraCuota: '2026-11-30', creadoEn: 0,
};
const ajustes = {
  recordatorios: { ...AJUSTES_INICIALES.recordatorios, activo: true },
  respaldo: { recordarCadaDias: 7, ultimoExterno: '2026-11-10T12:00:00' },
};
// 13 nov 2026, 7:00 a. m. hora local (antes de la hora de los avisos, 8:00)
const ahora = new Date(2026, 10, 13, 7, 0);
const fecha = (r: { fecha: Date }) =>
  `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}-${String(r.fecha.getDate()).padStart(2, '0')}`;

describe('recordatorios', () => {
  it('sin activar no programa nada', () => {
    expect(generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [], ajustes: { ...ajustes, recordatorios: AJUSTES_INICIALES.recordatorios } }, ahora)).toEqual([]);
  });

  it('avisa del pago de contado pendiente, del corte y del estado de cuenta', () => {
    const lista = generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [], ajustes: { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false } } }, ahora);
    const claves = lista.map((r) => `${fecha(r)} ${r.clave.split(':').slice(2).join(':')}`);
    // El de 5 días antes (10 nov) ya pasó; quedan 2 días antes y el mismo día.
    expect(claves).toContain('2026-11-13 pago:2026-11-15:2');
    expect(claves).toContain('2026-11-15 pago:2026-11-15:0');
    expect(claves).toContain('2026-11-16 vencido:2026-11-15:2026-11-16');
    expect(claves).toContain('2026-11-19 corte:2026-11-20');
    expect(claves).toContain('2026-11-22 estado:2026-11-20');
    expect(claves).toContain('2026-12-19 corte:2026-12-20');
    // Lo del próximo estado de cuenta (30,000 facturados al corte del 20 nov).
    expect(claves).toContain('2026-12-10 pago:2026-12-15:5');
    expect(claves.some((c) => c.startsWith('2026-11-10'))).toBe(false);
    const hoy = lista.find((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:0')!;
    expect(hoy.titulo).toBe('Hoy es el último día para pagar Visa');
    expect(hoy.cuerpo).toBe('Pago de contado: $100.00. Último día: 15 nov.');
    expect(hoy.pagar).toBe(true);
    expect(hoy.fecha.getHours()).toBe(8);
    expect(lista[0].fecha.getTime()).toBeLessThanOrEqual(lista[1].fecha.getTime());
  });

  it('a las 9 a. m. el aviso de las 8 del mismo día ya no se programa', () => {
    const t = { ...tarjeta, pendienteInicialCentavos: 10000 };
    const lista = generarRecordatorios({ tarjetas: [t], prestamos: [], movimientos: [], ajustes }, new Date(2026, 10, 15, 9, 0));
    expect(lista.some((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:0')).toBe(false);
  });

  it('al pagar el pendiente desaparecen sus avisos', () => {
    const pago: Movimiento = { id: 'x', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-13', tarjetaId: 't1', nota: '', creadoEn: 1 };
    const lista = generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [pago], ajustes }, ahora);
    expect(lista.some((r) => r.clave.includes('pago:2026-11-15'))).toBe(false);
    expect(lista.some((r) => r.clave.includes('vencido'))).toBe(false);
  });

  it('avisa las próximas cuotas del préstamo', () => {
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [prestamo], movimientos: [], ajustes: { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false } } }, ahora);
    expect(lista.filter((r) => r.clave.includes(':cuota:')).map((r) => fecha(r))).toEqual([
      '2026-11-27', '2026-11-30', '2026-12-27', '2026-12-30',
    ]);
    expect(lista[0].titulo).toBe('Cuota de Personal en 3 días');
    expect(lista[0].cuerpo).toBe('$100.00 el 30 nov.');
    // «Ya pagué» sabe qué cuota registrar.
    expect(lista[0].pagoDirecto).toEqual({ tipo: 'prestamo', id: 'p1', fecha: '2026-11-30' });
  });

  it('el pago de contado de la tarjeta ofrece «Ya pagué»; el estimado, no', () => {
    const lista = generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [], ajustes }, ahora);
    const contado = lista.find((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:2');
    expect(contado?.pagoDirecto).toEqual({ tipo: 'tarjeta', id: 't1', fecha: '2026-11-15' });
    // Pagado el estado de cuenta, el próximo pago (aún sin corte) es un estimado.
    const soloPendiente = { ...tarjeta, saldoInicialCentavos: 10000 };
    const compra: Movimiento = { id: 'c', tipo: 'gasto', montoCentavos: 5000, fecha: '2026-11-14', tarjetaId: 't1', nota: '', creadoEn: 1 };
    const pago: Movimiento = { id: 'x', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-13', tarjetaId: 't1', nota: '', creadoEn: 1 };
    const estimados = generarRecordatorios({ tarjetas: [soloPendiente], prestamos: [], movimientos: [compra, pago], ajustes }, new Date(2026, 10, 15, 7, 0));
    const proximo = estimados.filter((r) => r.clave.startsWith('tarjeta:t1:pago:'));
    expect(proximo.map(fecha)).toEqual(['2026-12-10', '2026-12-13', '2026-12-15']);
    expect(proximo.every((r) => r.pagar && !r.pagoDirecto)).toBe(true);
  });

  it('con el mínimo conocido, el aviso de la tarjeta ofrece «Pagué el mínimo»', () => {
    const conMinimo: Tarjeta = {
      ...tarjeta,
      fechaSaldo: '2026-10-20',
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-15', pagoContadoCentavos: 10000, pagoMinimoCentavos: 2500, saldoCentavos: 30000 },
    };
    const lista = generarRecordatorios({ tarjetas: [conMinimo], prestamos: [], movimientos: [], ajustes }, ahora);
    expect(lista.find((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:2')?.pagoDirecto).toEqual({ tipo: 'tarjeta', id: 't1', fecha: '2026-11-15', conMinimo: true });
  });

  it('con el mínimo pagado no avisa «venció»; la tarjeta que se paga con el mínimo deja de avisar', () => {
    const conMinimo: Tarjeta = {
      ...tarjeta,
      fechaSaldo: '2026-10-20',
      ultimoEstado: { fechaCorte: '2026-10-20', fechaLimite: '2026-11-15', pagoContadoCentavos: 10000, pagoMinimoCentavos: 2500, saldoCentavos: 30000 },
    };
    const minimo: Movimiento = { id: 'x', tipo: 'pago', montoCentavos: 2500, fecha: '2026-11-12', tarjetaId: 't1', nota: '', creadoEn: 1 };
    const claves = (t: Tarjeta, movs: Movimiento[]) =>
      generarRecordatorios({ tarjetas: [t], prestamos: [], movimientos: movs, ajustes }, ahora).map((r) => r.clave).filter((c) => c.includes(':pago:2026-11-15') || c.includes('vencido'));
    // Paga el total: sigue recordando el pago de contado hasta la fecha, pero ya no hay «venció».
    expect(claves(conMinimo, [minimo])).toEqual(['tarjeta:t1:pago:2026-11-15:2', 'tarjeta:t1:pago:2026-11-15:0']);
    // Paga el mínimo: cubierto, no queda ningún aviso de ese estado de cuenta.
    expect(claves({ ...conMinimo, formaPago: 'minimo' }, [minimo])).toEqual([]);
    // Sin pagar: pide el mínimo, lo ofrece primero y avisa si vence.
    const lista = generarRecordatorios({ tarjetas: [{ ...conMinimo, formaPago: 'minimo' }], prestamos: [], movimientos: [], ajustes }, ahora);
    const aviso = lista.find((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:2')!;
    expect(aviso.cuerpo).toBe('Pago mínimo: $25.00 · de contado $100.00. Último día: 15 nov.');
    expect(aviso.pagoDirecto).toMatchObject({ conMinimo: true, prefiereMinimo: true });
    expect(lista.find((r) => r.clave.includes('vencido'))?.cuerpo).toBe('No se cubrió el pago mínimo ($25.00). Paga cuanto antes para evitar más cargos por mora.');
  });

  it('cada mes pide actualizar el préstamo con el banco, salvo si se hizo hace poco', () => {
    const sin = { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false, pagos: false } };
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [prestamo], movimientos: [], ajustes: sin }, ahora);
    const actualizar = lista.filter((r) => r.clave.includes(':actualizar:'));
    expect(actualizar.map(fecha)).toEqual(['2026-12-03', '2027-01-02']);
    expect(actualizar[0].titulo).toBe('Actualiza Personal con el banco');
    const reciente = generarRecordatorios({ tarjetas: [], prestamos: [{ ...prestamo, actualizadoEn: '2026-11-20' }], movimientos: [], ajustes: sin }, ahora);
    expect(reciente.filter((r) => r.clave.includes(':actualizar:')).map(fecha)).toEqual(['2027-01-02']);
    const apagado = { ...sin, recordatorios: { ...sin.recordatorios, actualizar: false } };
    expect(generarRecordatorios({ tarjetas: [], prestamos: [prestamo], movimientos: [], ajustes: apagado }, ahora)).toEqual([]);
  });

  it('recuerda el respaldo cada semana y deja un aviso para abrir la app', () => {
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [], movimientos: [], ajustes }, ahora);
    const respaldos = lista.filter((r) => r.clave.startsWith('respaldo')).map(fecha);
    expect(respaldos.slice(0, 3)).toEqual(['2026-11-17', '2026-11-24', '2026-12-01']);
    const abrir = lista.find((r) => r.clave === 'abrir:2026-11-13');
    expect(abrir && fecha(abrir)).toBe('2027-01-09');
  });

  it('el día 1 avisa el resumen del mes que terminó', () => {
    const solo = { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false } };
    const gasto: Movimiento = { id: 'g', tipo: 'gasto', montoCentavos: 500, fecha: '2026-11-02', nota: '', creadoEn: 1 };
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [], movimientos: [gasto], ajustes: solo }, ahora);
    const resumen = lista.filter((r) => r.clave.startsWith('resumen:'));
    expect(resumen.map(fecha)).toEqual(['2026-12-01', '2027-01-01']);
    expect(resumen.map((r) => r.titulo)).toEqual(['Así te fue en noviembre', 'Así te fue en diciembre']);
    expect(resumen[0].destino).toEqual({ tipo: 'resumen' });
    // Sin movimientos no hay nada que resumir.
    expect(generarRecordatorios({ tarjetas: [], prestamos: [], movimientos: [], ajustes: solo }, ahora)).toEqual([]);
  });

  it('los identificadores son estables y positivos', () => {
    expect(idDe('a')).toBe(idDe('a'));
    expect(idDe('a')).not.toBe(idDe('b'));
    expect(idDe('tarjeta:t1:pago:2026-11-15:0')).toBeGreaterThan(0);
  });
});
