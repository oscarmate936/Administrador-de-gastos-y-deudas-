import { describe, expect, it } from 'vitest';
import type { Movimiento } from '../db';
import { normalizar, notasRecientes, ordenarPorUso, recordarComercio } from './frecuentes';

let n = 0;
const gasto = (fecha: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`,
  tipo: 'gasto',
  montoCentavos: 500,
  fecha,
  nota: '',
  creadoEn: n,
  ...extra,
});

const HOY = '2026-11-14';
const cats = [{ id: 'comida' }, { id: 'super' }, { id: 'transporte' }, { id: 'casa' }];

describe('ordenarPorUso', () => {
  it('pone primero las categorías más usadas en los últimos 90 días', () => {
    const movs = [
      gasto('2026-11-10', { categoriaId: 'transporte' }),
      gasto('2026-11-11', { categoriaId: 'transporte' }),
      gasto('2026-11-12', { categoriaId: 'super' }),
      // Muy viejo: no cuenta.
      gasto('2026-01-01', { categoriaId: 'casa' }),
      gasto('2026-01-02', { categoriaId: 'casa' }),
      gasto('2026-01-03', { categoriaId: 'casa' }),
    ];
    expect(ordenarPorUso(cats, movs, HOY, 'categoriaId').map((c) => c.id)).toEqual(['transporte', 'super', 'comida', 'casa']);
  });
  it('sin uso conserva el orden original', () => {
    expect(ordenarPorUso(cats, [], HOY, 'categoriaId').map((c) => c.id)).toEqual(['comida', 'super', 'transporte', 'casa']);
  });
  it('ordena tarjetas igual y no cuenta ingresos ni pagos', () => {
    const tarjetas = [{ id: 'visa' }, { id: 'master' }];
    const movs = [
      gasto('2026-11-10', { tarjetaId: 'master' }),
      { ...gasto('2026-11-10'), tipo: 'pago' as const, tarjetaId: 'visa' },
      { ...gasto('2026-11-10'), tipo: 'pago' as const, tarjetaId: 'visa' },
    ];
    expect(ordenarPorUso(tarjetas, movs, HOY, 'tarjetaId').map((t) => t.id)).toEqual(['master', 'visa']);
  });
});

describe('recordarComercio', () => {
  it('devuelve la categoría y tarjeta de la última vez, sin importar tildes ni mayúsculas', () => {
    const movs = [
      gasto('2026-10-01', { nota: 'Súper Selectos', categoriaId: 'comida' }),
      gasto('2026-11-01', { nota: 'super selectos ', categoriaId: 'super', tarjetaId: 'visa' }),
    ];
    expect(recordarComercio(movs, 'SUPER SELECTOS')).toEqual({ categoriaId: 'super', tarjetaId: 'visa' });
  });
  it('recuerda efectivo como tarjeta vacía', () => {
    const movs = [gasto('2026-11-01', { nota: 'Gasolina', categoriaId: 'transporte' })];
    expect(recordarComercio(movs, 'gasolina')).toEqual({ categoriaId: 'transporte', tarjetaId: undefined });
  });
  it('no recuerda notas cortas, ni el mismo movimiento que se edita', () => {
    const m = gasto('2026-11-01', { nota: 'Pan', categoriaId: 'comida' });
    expect(recordarComercio([m], 'pa')).toBeNull();
    expect(recordarComercio([m], 'pan', m.id)).toBeNull();
    expect(recordarComercio([m], 'cine')).toBeNull();
  });
});

describe('notasRecientes', () => {
  it('lista notas distintas, la más reciente primero', () => {
    const movs = [
      gasto('2026-11-01', { nota: 'Almuerzo' }),
      gasto('2026-11-03', { nota: 'gasolina' }),
      gasto('2026-11-05', { nota: 'almuerzo' }),
      gasto('2026-11-06', { nota: '  ' }),
    ];
    expect(notasRecientes(movs)).toEqual(['almuerzo', 'gasolina']);
  });
  it('normaliza el texto', () => {
    expect(normalizar('  Súper   SELECTOS ')).toBe('super selectos');
  });
});
