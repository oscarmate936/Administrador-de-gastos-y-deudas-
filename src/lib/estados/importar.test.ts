import { describe, expect, it } from 'vitest';
import type { Movimiento, Tarjeta } from '../../db';
import { calcularDisponible } from '../resumen';
import { estadoTarjeta } from '../deudas';
import { ejemploDavivienda } from './ejemplos';
import { buscarTarjeta, esEstadoViejo, movimientosDesdeFilas, nombreSugerido, prepararFilas, tarjetaDesdeEstado } from './importar';
import { leerEstadoTarjeta } from './leer';

const estado = leerEstadoTarjeta(ejemploDavivienda());
const categorias = new Set(['super', 'comida', 'ocio', 'intereses']);

const existente: Tarjeta = {
  id: 't1', nombre: 'Mi Mastercard', banco: 'Davivienda', limiteCentavos: 90000, diaCorte: 8, diaPago: 3,
  saldoInicialCentavos: 40000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-10-01', color: '#123456',
  creadoEn: 5, ultimos4: '1234',
};

describe('importar estado de cuenta', () => {
  it('reconoce la tarjeta por sus últimos 4 dígitos', () => {
    expect(buscarTarjeta(estado, [existente])?.id).toBe('t1');
    expect(buscarTarjeta(estado, [{ ...existente, ultimos4: '9999' }])).toBeUndefined();
    expect(nombreSugerido(estado)).toBe('Mastercard Clasica ···1234');
  });

  it('propone los cargos con categoría y deja los abonos sin marcar', () => {
    const filas = prepararFilas(estado, [], undefined, categorias);
    expect(filas.map((f) => [f.mov.concepto.split(' ')[0], f.incluir, f.categoriaId])).toEqual([
      ['SUPER', true, 'super'],
      ['PIZZA', true, 'comida'],
      ['GRACIAS', false, undefined],
      ['NETFLIX.COM', true, 'ocio'],
      ['INTERES', true, 'intereses'],
    ]);
  });

  it('marca como duplicado lo que ya está registrado en esa tarjeta, contando repeticiones', () => {
    const ya: Movimiento[] = [
      { id: 'a', tipo: 'gasto', montoCentavos: 4000, fecha: '2026-10-10', tarjetaId: 't1', nota: '', creadoEn: 1 },
      { id: 'b', tipo: 'gasto', montoCentavos: 3000, fecha: '2026-10-15', tarjetaId: 'otra', nota: '', creadoEn: 2 },
      { id: 'c', tipo: 'pago', montoCentavos: 5000, fecha: '2026-10-20', tarjetaId: 't1', nota: '', creadoEn: 3 },
    ];
    const filas = prepararFilas(estado, ya, 't1', categorias);
    expect(filas.map((f) => f.duplicado)).toEqual([true, false, true, false, false]);
    expect(filas[0].incluir).toBe(false);

    const doble = { ...estado, movimientos: [estado.movimientos[0], estado.movimientos[0]] };
    expect(prepararFilas(doble, ya, 't1', categorias).map((f) => f.duplicado)).toEqual([true, false]);
  });

  it('reconoce una compra registrada a mano unos días antes de que el banco la publique', () => {
    const [primero] = estado.movimientos;
    const tresDiasAntes = new Date(primero.fecha);
    tresDiasAntes.setUTCDate(tresDiasAntes.getUTCDate() - 3);
    const fecha = tresDiasAntes.toISOString().slice(0, 10);
    const ya: Movimiento[] = [{ id: 'a', tipo: 'gasto', montoCentavos: primero.montoCentavos, fecha, tarjetaId: 't1', nota: '', creadoEn: 1 }];
    const [fila] = prepararFilas(estado, ya, 't1', categorias);
    expect(fila).toMatchObject({ duplicado: true, incluir: false, registradoEl: fecha });
    // Más de 3 días de diferencia ya no cuenta como el mismo.
    const lejos = new Date(primero.fecha);
    lejos.setUTCDate(lejos.getUTCDate() - 4);
    const otro = [{ ...ya[0], fecha: lejos.toISOString().slice(0, 10) }];
    expect(prepararFilas(estado, otro, 't1', categorias)[0].duplicado).toBe(false);
    // Un registro solo empareja una fila: el exacto de otra fila no se lo lleva el cercano.
    const dos = { ...estado, movimientos: [{ ...primero, fecha: lejos.toISOString().slice(0, 10) }, primero] };
    const exacto: Movimiento[] = [{ ...ya[0], fecha: primero.fecha }];
    expect(prepararFilas(dos, exacto, 't1', categorias).map((f) => f.duplicado)).toEqual([false, true]);
  });

  it('propone la categoría que la persona ya usó para ese comercio', () => {
    const ya: Movimiento[] = [
      { id: 'v', tipo: 'gasto', montoCentavos: 100, fecha: '2026-09-01', categoriaId: 'ocio', nota: 'pizza hut san salvador', creadoEn: 1 },
      { id: 'w', tipo: 'gasto', montoCentavos: 100, fecha: '2026-09-02', categoriaId: 'super', nota: 'PIZZA HUT SAN SALVADOR', creadoEn: 2 },
      { id: 'x', tipo: 'gasto', montoCentavos: 100, fecha: '2026-09-03', categoriaId: 'borrada', nota: 'NETFLIX.COM SAN SALVADOR', creadoEn: 3 },
    ];
    const filas = prepararFilas(estado, ya, undefined, categorias);
    expect(filas[1].categoriaId).toBe('super');
    expect(filas[3].categoriaId).toBe('ocio');
  });

  it('distingue las devoluciones de los pagos y no las cuenta como dinero que salió', () => {
    const conDevolucion = {
      ...estado,
      movimientos: [
        { fecha: '2026-10-25', concepto: 'DEVOLUCION TIENDA X', montoCentavos: 1500, tipo: 'abono' as const },
        { fecha: '2026-10-26', concepto: 'SU PAGO GRACIAS', montoCentavos: 5000, tipo: 'abono' as const },
        { fecha: '2026-10-27', concepto: 'REVERSO COMPRA', montoCentavos: 700, tipo: 'abono' as const },
      ],
    };
    const filas = prepararFilas(conDevolucion, [], 't1', categorias);
    expect(filas.map((f) => f.devolucion)).toEqual([true, false, true]);
    const movs = movimientosDesdeFilas(filas.map((f) => ({ ...f, incluir: true })), 't1');
    expect(movs.map((m) => m.esDevolucion)).toEqual([true, undefined, true]);
    // Solo el pago resta del dinero disponible.
    expect(calcularDisponible(movs)).toBe(-5000);
  });

  it('crea la tarjeta con las cifras del corte', () => {
    const t = tarjetaDesdeEstado(estado, undefined, { nombre: '', color: '#abcdef' });
    expect(t).toMatchObject({
      nombre: 'Mastercard Clasica ···1234',
      banco: 'Davivienda',
      limiteCentavos: 100000,
      diaCorte: 8,
      diaPago: 3,
      saldoInicialCentavos: 56000,
      pendienteInicialCentavos: 56000,
      fechaSaldo: '2026-11-08',
      color: '#abcdef',
      ultimos4: '1234',
      tasaAnual: 47,
      ultimoEstado: {
        fechaCorte: '2026-11-08', fechaLimite: '2026-12-03', pagoContadoCentavos: 56000, pagoMinimoCentavos: 2500,
        saldoCentavos: 56000, disponibleCentavos: 44000,
      },
    });
  });

  it('actualiza una tarjeta existente conservando nombre, color e id', () => {
    const t = tarjetaDesdeEstado(estado, existente, { nombre: 'ignorado', color: '#000' });
    expect(t.id).toBe('t1');
    expect(t.nombre).toBe('Mi Mastercard');
    expect(t.color).toBe('#123456');
    expect(t.saldoInicialCentavos).toBe(56000);
    expect(t.fechaSaldo).toBe('2026-11-08');
  });

  it('un estado de cuenta más viejo no cambia los saldos', () => {
    const nueva = { ...existente, fechaSaldo: '2026-12-08' };
    expect(esEstadoViejo(estado, nueva)).toBe(true);
    expect(tarjetaDesdeEstado(estado, nueva, { nombre: '', color: '' })).toEqual(nueva);
  });

  it('lo importado queda como historial: no cambia la deuda ni el disponible', () => {
    const t = tarjetaDesdeEstado(estado, undefined, { nombre: '', color: '#000' });
    const filas = prepararFilas(estado, [], t.id, categorias).map((f) => ({ ...f, incluir: true }));
    const movs = movimientosDesdeFilas(filas, t.id, 100);
    expect(movs).toHaveLength(5);
    expect(movs[0]).toMatchObject({ tipo: 'gasto', montoCentavos: 4000, fecha: '2026-10-10', categoriaId: 'super', tarjetaId: t.id, nota: 'SUPER SELECTOS SAN SALVADOR' });
    expect(movs[2]).toMatchObject({ tipo: 'pago', montoCentavos: 5000, categoriaId: undefined });

    const e = estadoTarjeta(t, movs, '2026-11-13');
    expect(e.saldoCentavos).toBe(56000);
    expect(e.pendienteCentavos).toBe(56000);
    expect(e.pagoMinimoCentavos).toBe(2500);
    expect(e.fechaLimite).toBe('2026-12-03');
    expect(e.creditoDisponibleCentavos).toBe(44000);
    // Una compra posterior al corte baja el disponible que dio el banco.
    const compra: Movimiento = { id: 'n', tipo: 'gasto', montoCentavos: 1000, fecha: '2026-11-10', tarjetaId: t.id, nota: '', creadoEn: 1 };
    expect(estadoTarjeta(t, [...movs, compra], '2026-11-13').creditoDisponibleCentavos).toBe(43000);
    // Solo el abono marcado resta del disponible.
    expect(calcularDisponible(movs)).toBe(-5000);
  });
});
