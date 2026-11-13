import { describe, expect, it } from 'vitest';
import { centavosATexto, formatearDinero, textoACentavos } from './dinero';

describe('textoACentavos', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['0.07', 7],
    ['.5', 50],
    ['5.', 500],
    ['$1,234.56', 123456],
    ['1,234', 123400],
    [' 20 ', 2000],
    ['19.99', 1999],
    ['1234567.89', 123456789],
  ])('%s -> %i', (texto, centavos) => {
    expect(textoACentavos(texto)).toBe(centavos);
  });

  it.each(['', ' ', 'abc', '1.234', '1.2.3', '-5', '.', '12a'])('rechaza "%s"', (texto) => {
    expect(textoACentavos(texto)).toBeNull();
  });
});

describe('formato', () => {
  it('formatea en dólares', () => {
    expect(formatearDinero(123456)).toBe('$1,234.56');
    expect(formatearDinero(-550)).toBe('-$5.50');
    expect(formatearDinero(0)).toBe('$0.00');
  });

  it('ida y vuelta con el campo de texto', () => {
    expect(textoACentavos(centavosATexto(1999))).toBe(1999);
  });
});
