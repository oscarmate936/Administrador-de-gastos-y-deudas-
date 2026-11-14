import { describe, expect, it } from 'vitest';
import type { Prestamo, Recurrente, Tarjeta } from '../db';
import { agenda, quitarYaAvisados } from './agenda';

const tarjeta: Tarjeta = {
  id: 'visa',
  nombre: 'Visa',
  banco: 'Banco Agrícola',
  limiteCentavos: 150000,
  diaCorte: 20,
  diaPago: 15,
  saldoInicialCentavos: 62000,
  pendienteInicialCentavos: 24000,
  fechaSaldo: '2026-11-01',
  color: '#3f7fd0',
  creadoEn: 1,
};
const prestamo: Prestamo = {
  id: 'p1',
  nombre: 'Personal',
  acreedor: 'Davivienda',
  saldoInicialCentavos: 350000,
  tasaAnual: 16.5,
  cuotaCentavos: 12500,
  primeraCuota: '2026-11-28',
  creadoEn: 1,
};
const netflix: Recurrente = {
  id: 'r1',
  tipo: 'gasto',
  montoCentavos: 1500,
  nota: 'Netflix',
  dia: 18,
  proxima: '2026-11-18',
  activo: true,
  creadoEn: 1,
};
const base = { tarjetas: [tarjeta], prestamos: [prestamo], movimientos: [], recurrentes: [netflix], mapaCategorias: new Map() };

describe('agenda', () => {
  it('junta pagos, cortes, cuotas y lo que se repite de los próximos 7 días, en orden', () => {
    const lista = agenda(base, '2026-11-14', '2026-11-21', '2026-11-14');
    expect(lista.map((e) => `${e.fecha} ${e.tipo} ${e.titulo} ${e.montoCentavos ?? '-'}`)).toEqual([
      '2026-11-15 pago Pagar Visa 24000',
      '2026-11-18 repite Netflix 1500',
      '2026-11-20 corte Corte Visa -',
    ]);
  });
  it('en un mes muestra los pagos siguientes sin monto y todas las cuotas', () => {
    const lista = agenda(base, '2026-12-01', '2026-12-31', '2026-11-14');
    expect(lista.map((e) => `${e.fecha} ${e.tipo} ${e.montoCentavos ?? '-'}`)).toEqual([
      '2026-12-15 pago -',
      '2026-12-18 repite 1500',
      '2026-12-20 corte -',
      '2026-12-28 cuota 12500',
    ]);
  });
  it('un recurrente pausado no aparece', () => {
    const lista = agenda({ ...base, recurrentes: [{ ...netflix, activo: false }] }, '2026-11-14', '2026-11-21', '2026-11-14');
    expect(lista.some((e) => e.tipo === 'repite')).toBe(false);
  });
  it('no repite lo que ya está en «Requiere atención», pero deja los cortes', () => {
    const lista = agenda(base, '2026-11-18', '2026-11-28', '2026-11-18');
    const visibles = quitarYaAvisados(lista, [{ tipo: 'prestamo', id: 'p1' }], [{ id: 'r1', proxima: '2026-11-18' }]);
    expect(lista.map((e) => e.tipo)).toEqual(['repite', 'corte', 'cuota']);
    expect(visibles.map((e) => `${e.fecha} ${e.tipo}`)).toEqual(['2026-11-20 corte']);
  });
  it('un recurrente por confirmar solo quita esa fecha, no las siguientes', () => {
    const lista = agenda(base, '2026-11-18', '2026-12-31', '2026-11-18');
    const visibles = quitarYaAvisados(lista, [], [{ id: 'r1', proxima: '2026-11-18' }]);
    expect(visibles.filter((e) => e.tipo === 'repite').map((e) => e.fecha)).toEqual(['2026-12-18']);
    expect(visibles.filter((e) => e.tipo === 'pago')).toHaveLength(lista.filter((e) => e.tipo === 'pago').length);
  });
});
