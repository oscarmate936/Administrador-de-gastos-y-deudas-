import { describe, expect, it } from 'vitest';
import { sugerirCategoria } from './categorias';
import { ejemploBancoAgricola, ejemploDavivienda } from './ejemplos';
import { buscarValor, leerFecha, leerMonto, leerTasa, normalizar } from './lectura';
import { ErrorEstado, leerEstadoTarjeta } from './leer';
import type { Pagina } from './tipos';

describe('lectura de valores', () => {
  it('montos', () => {
    expect(leerMonto('2,468.10')).toBe(246810);
    expect(leerMonto('$ 215.50')).toBe(21550);
    expect(leerMonto('0.00')).toBe(0);
    expect(leerMonto('-10.00')).toBe(-1000);
    expect(leerMonto('12,345')).toBeNull();
    expect(leerMonto('47')).toBeNull();
    expect(leerMonto('1,2345.00')).toBeNull();
  });

  it('fechas en los dos formatos', () => {
    expect(leerFecha('08/11/2026')).toBe('2026-11-08');
    expect(leerFecha('03 DIC 2026')).toBe('2026-12-03');
    expect(leerFecha('3 ene 2027')).toBe('2027-01-03');
    expect(leerFecha('31/02/2026')).toBeNull();
    expect(leerFecha('03 XYZ 2026')).toBeNull();
  });

  it('tasas', () => {
    expect(leerTasa('39.90% ANUAL')).toBe(39.9);
    expect(leerTasa('47.00')).toBe(47);
    expect(leerTasa('ANUAL')).toBeNull();
  });

  it('normaliza etiquetas', () => {
    expect(normalizar('  Límite   de crédito ')).toBe('LIMITE DE CREDITO');
  });

  it('busca el valor desfasado dentro de la columna de su etiqueta', () => {
    const items = ejemploDavivienda()[0].items;
    expect(buscarValor(items, /^CREDITO DISPONIBLE/, leerMonto)).toBe(44000);
    expect(buscarValor(items, /^\(=\) SALDO TOTAL/, leerMonto)).toBe(56000);
    expect(buscarValor(items, /^NO EXISTE/, leerMonto)).toBeNull();
  });
});

describe('Davivienda', () => {
  const e = leerEstadoTarjeta(ejemploDavivienda());

  it('lee el resumen', () => {
    expect(e).toMatchObject({
      banco: 'Davivienda',
      producto: 'Mastercard Clasica',
      ultimos4: '1234',
      fechaCorte: '2026-11-08',
      fechaLimite: '2026-12-03',
      limiteCentavos: 100000,
      disponibleCentavos: 44000,
      saldoCentavos: 56000,
      pagoContadoCentavos: 56000,
      pagoMinimoCentavos: 2500,
      tasaAnual: 47,
      totalesCuadran: true,
    });
  });

  it('lee los movimientos con su columna y deja fuera las otras tablas', () => {
    expect(e.movimientos).toEqual([
      { fecha: '2026-10-10', concepto: 'SUPER SELECTOS SAN SALVADOR', montoCentavos: 4000, tipo: 'cargo' },
      { fecha: '2026-10-15', concepto: 'PIZZA HUT SAN SALVADOR', montoCentavos: 3000, tipo: 'cargo' },
      { fecha: '2026-10-20', concepto: 'GRACIAS POR SU PAGO INTERNET SAN SALVADOR', montoCentavos: 5000, tipo: 'abono' },
      { fecha: '2026-10-25', concepto: 'NETFLIX.COM SAN SALVADOR', montoCentavos: 2000, tipo: 'cargo' },
      { fecha: '2026-11-08', concepto: 'INTERES SOBRE SALDO', montoCentavos: 2000, tipo: 'cargo' },
    ]);
  });

  it('lee las compras a plazos y el extrafinanciamiento sin guardar el nombre del cliente', () => {
    expect(e.planes).toEqual([
      { descripcion: 'TIENDA DE PRUEBA', tasaMensual: 0, cuotaActual: 2, cuotasTotales: 12, cuotaCentavos: 1000, saldoCentavos: 10000 },
      { descripcion: 'Extrafinanciamiento', tasaMensual: 1.5, cuotaActual: 5, cuotasTotales: 48, cuotaCentavos: 2550, saldoCentavos: 78700 },
    ]);
    expect(JSON.stringify(e.planes)).not.toContain('CLIENTE');
    expect(leerEstadoTarjeta(ejemploBancoAgricola()).planes).toEqual([]);
  });

  it('avisa si los movimientos no cuadran con los totales', () => {
    const paginas = ejemploDavivienda();
    paginas[0].items = paginas[0].items.filter((i) => i.texto !== 'PIZZA HUT');
    // Sin concepto la fila se sigue leyendo; quitarle el monto sí hace que falte.
    paginas[0].items = paginas[0].items.filter((i) => !(i.y === 441.9 && i.texto === '30.00'));
    expect(leerEstadoTarjeta(paginas).totalesCuadran).toBe(false);
  });
});

describe('Banco Agrícola', () => {
  const e = leerEstadoTarjeta(ejemploBancoAgricola());

  it('lee el resumen y calcula el saldo con el límite y el disponible', () => {
    expect(e).toMatchObject({
      banco: 'Banco Agrícola',
      producto: 'Visa Clasica',
      ultimos4: '5678',
      fechaCorte: '2026-11-06',
      fechaLimite: '2026-12-01',
      limiteCentavos: 50000,
      disponibleCentavos: 28450,
      saldoCentavos: 21550,
      pagoContadoCentavos: 21550,
      pagoMinimoCentavos: 980,
      tasaAnual: 39.9,
      totalesCuadran: true,
    });
  });

  it('ignora la columna lateral que comparte renglón con los movimientos', () => {
    expect(e.movimientos.map((m) => [m.fecha, m.concepto, m.montoCentavos, m.tipo])).toEqual([
      ['2026-11-04', 'COMPRA SUPER SELECTOS', 6000, 'cargo'],
      ['2026-11-04', 'IVA COMISION', 50, 'cargo'],
      ['2026-10-29', 'FARMACIA SAN NICOLAS', 2500, 'cargo'],
      ['2026-10-20', 'Pago a TDC propia', 4000, 'abono'],
      ['2026-10-27', 'UBER TRIP', 12000, 'cargo'],
    ]);
  });
});

describe('errores', () => {
  it('PDF sin texto', () => {
    expect(() => leerEstadoTarjeta([{ items: [] }])).toThrow(/imagen escaneada/);
  });

  it('banco desconocido', () => {
    const otro: Pagina[] = [{ items: [{ texto: 'BANCO DESCONOCIDO ESTADO DE CUENTA', x: 0, y: 0, ancho: 10 }] }];
    expect(() => leerEstadoTarjeta(otro)).toThrow(ErrorEstado);
  });

  it('falta la fecha de corte', () => {
    const paginas = ejemploBancoAgricola();
    paginas[0].items = paginas[0].items.filter((i) => i.texto !== '06/11/2026');
    expect(() => leerEstadoTarjeta(paginas)).toThrow('No pude leer la fecha de corte de este estado de cuenta.');
  });
});

describe('categorías sugeridas', () => {
  it.each([
    ['SUPER SELECTOS SAN SALVADOR', 'super'],
    ['INTERES SOBRE SALDO', 'intereses'],
    ['CARGO POR ADELANTO DE EFECTIVO', 'intereses'],
    ['IVA COMISION', 'intereses'],
    ['AVANCE DE EFECTIVO POR TRANSF.', 'otros'],
    ['UBER TRIP', 'transporte'],
    ['FARMACIA SAN NICOLAS', 'salud'],
    ['Recarga de celular BM', 'servicios'],
    ['NETFLIX.COM', 'ocio'],
    ['PIZZA HUT', 'comida'],
    ['TIENDA XYZ', undefined],
  ])('%s -> %s', (concepto, categoria) => {
    expect(sugerirCategoria(concepto)).toBe(categoria);
  });
});
