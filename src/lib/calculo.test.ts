import { describe, expect, it } from 'vitest';
import { agregarTecla, evaluarMonto, mostrarExpresion, tieneOperacion, type Tecla } from './calculo';

const teclear = (teclas: Tecla[], inicio = '') => teclas.reduce(agregarTecla, inicio);

describe('agregarTecla', () => {
  it('escribe montos con hasta dos decimales', () => {
    expect(teclear(['1', '2', '.', '5', '0', '9'])).toBe('12.50');
    expect(teclear(['.', '5'])).toBe('0.5');
    expect(teclear(['1', '.', '.', '2'])).toBe('1.2');
  });
  it('no deja ceros a la izquierda', () => {
    expect(teclear(['0', '0', '7'])).toBe('7');
    expect(teclear(['5', '+', '0', '3'])).toBe('5+3');
  });
  it('no empieza con una operación y reemplaza operaciones seguidas', () => {
    expect(teclear(['+', '-'])).toBe('');
    expect(teclear(['5', '+', '-', '2'])).toBe('5-2');
    expect(teclear(['5', '.', '+'])).toBe('5+');
  });
  it('limita los enteros a 7 cifras', () => {
    expect(teclear(['9', '9', '9', '9', '9', '9', '9', '9'])).toBe('9999999');
  });
  it('borra y limpia', () => {
    expect(agregarTecla('12.5', 'borrar')).toBe('12.');
    expect(agregarTecla('12.5', 'limpiar')).toBe('');
    expect(agregarTecla('', 'borrar')).toBe('');
  });
});

describe('evaluarMonto', () => {
  it('suma y resta en centavos', () => {
    expect(evaluarMonto('12.50')).toBe(1250);
    expect(evaluarMonto('5+3.50')).toBe(850);
    expect(evaluarMonto('20-2.25+0.10')).toBe(1785);
    expect(evaluarMonto('0.1+0.2')).toBe(30);
  });
  it('ignora una operación al final', () => {
    expect(evaluarMonto('5+')).toBe(500);
  });
  it('rechaza vacíos, ceros y resultados negativos', () => {
    expect(evaluarMonto('')).toBeNull();
    expect(evaluarMonto('0')).toBeNull();
    expect(evaluarMonto('5-8')).toBeNull();
    expect(evaluarMonto('-5')).toBeNull();
    expect(evaluarMonto('1.234')).toBeNull();
  });
  it('acepta montos prellenados con formato de la app', () => {
    expect(evaluarMonto('1,234.56')).toBe(123456);
  });
});

describe('formato', () => {
  it('muestra las operaciones con espacios y signo menos', () => {
    expect(mostrarExpresion('5+3.50-1')).toBe('5 + 3.50 − 1');
    expect(tieneOperacion('5+3')).toBe(true);
    expect(tieneOperacion('5+')).toBe(false);
    expect(tieneOperacion('12.50')).toBe(false);
  });
});
