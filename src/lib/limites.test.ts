import { describe, expect, it } from 'vitest';
import type { Categoria, Movimiento } from '../db';
import { avisoLimite, estadoLimites, gastadoEnMes } from './limites';

const comida: Categoria = { id: 'comida', nombre: 'Comida', emoji: '', color: '', orden: 1, limiteCentavos: 10000 };
const ocio: Categoria = { id: 'ocio', nombre: 'Ocio', emoji: '', color: '', orden: 2, limiteCentavos: 5000 };
const sin: Categoria = { id: 'casa', nombre: 'Casa', emoji: '', color: '', orden: 3 };
const g = (id: string, cat: string, monto: number, fecha = '2026-11-10', tarjetaId?: string): Movimiento => ({
  id, tipo: 'gasto', categoriaId: cat, montoCentavos: monto, fecha, tarjetaId, nota: '', creadoEn: 0,
});
const movs = [g('a', 'comida', 3000), g('b', 'comida', 4000, '2026-11-12', 't1'), g('c', 'comida', 9000, '2026-10-30'), g('d', 'ocio', 6000)];

describe('límites por categoría', () => {
  it('suma el mes con y sin tarjeta', () => {
    expect(gastadoEnMes(movs, 'comida', '2026-11')).toBe(7000);
    expect(gastadoEnMes(movs, 'comida', '2026-11', 'a')).toBe(4000);
  });

  it('lista solo las categorías con límite, de mayor a menor uso', () => {
    expect(estadoLimites(movs, [comida, ocio, sin], '2026-11').map((l) => [l.categoria.id, l.porcentaje])).toEqual([
      ['ocio', 120],
      ['comida', 70],
    ]);
  });

  it('avisa al cruzar el 80% y el 100%, solo una vez', () => {
    expect(avisoLimite(comida, 7000, 8000)).toBe('Llevas el 80% del límite de Comida: te quedan $20.00 este mes.');
    expect(avisoLimite(comida, 8000, 9000)).toBeNull();
    expect(avisoLimite(comida, 9000, 10000)).toBe('Llegaste al límite de Comida de este mes ($100.00).');
    expect(avisoLimite(comida, 9000, 12500)).toBe('Te pasaste del límite de Comida por $25.00 este mes.');
    expect(avisoLimite(comida, 11000, 12000)).toBeNull();
    expect(avisoLimite(sin, 0, 100000)).toBeNull();
  });
});
