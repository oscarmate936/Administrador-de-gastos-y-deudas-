import { describe, expect, it } from 'vitest';
import { buscarFecha, leerImporte, leerTicket } from './ticket';

const HOY = '2026-11-14';

describe('importes', () => {
  it.each([
    ['25.50', 2550],
    ['$ 1,234.56', 123456],
    ['1.234,56', 123456],
    ['25,50', 2550],
    ['2O.00', 2000],
  ])('%s', (t, c) => expect(leerImporte(t)).toBe(c));
  it('rechaza lo que no es un importe', () => {
    expect(leerImporte('25')).toBeNull();
    expect(leerImporte('12,345')).toBeNull();
  });
});

describe('fechas', () => {
  it('lee varios formatos y descarta futuras o muy viejas', () => {
    expect(buscarFecha('Fecha: 13/11/2026 10:22', HOY)).toBe('2026-11-13');
    expect(buscarFecha('13-11-26', HOY)).toBe('2026-11-13');
    expect(buscarFecha('13 de noviembre de 2026', HOY)).toBe('2026-11-13');
    expect(buscarFecha('vence 20/12/2026', HOY)).toBeNull();
    expect(buscarFecha('01/01/2020', HOY)).toBeNull();
    expect(buscarFecha('31/02/2026', HOY)).toBeNull();
  });
});

describe('tickets', () => {
  it('toma el total y no el subtotal ni el IVA', () => {
    const texto = `SUPER SELECTOS
Sucursal Escalón
NIT 0614-123456-101-1
Fecha 12/11/2026 18:40
LECHE ENTERA 1L      1.35
PAN DULCE            2.10
SUBTOTAL            21.00
IVA 13%              2.73
TOTAL               $23.73
EFECTIVO            25.00
CAMBIO               1.27
GRACIAS POR SU COMPRA`;
    expect(leerTicket(texto, HOY)).toEqual({ montoCentavos: 2373, fecha: '2026-11-12', comercio: 'SUPER SELECTOS' });
  });

  it('sin línea de total usa el importe mayor', () => {
    expect(leerTicket('Farmacia San Nicolás\nAcetaminofén 3.50\nVitaminas 12.00', HOY)).toEqual({
      montoCentavos: 1200,
      fecha: null,
      comercio: 'Farmacia San Nicolás',
    });
  });

  it('lee capturas de notificaciones del banco', () => {
    expect(leerTicket('Compra aprobada por $45.90 en PIZZA HUT ESCALON el 13/11/2026', HOY)).toEqual({
      montoCentavos: 4590,
      fecha: '2026-11-13',
      comercio: 'PIZZA HUT ESCALON',
    });
  });

  it('texto vacío no inventa nada', () => {
    expect(leerTicket('', HOY)).toEqual({ montoCentavos: null, fecha: null, comercio: null });
  });
});
