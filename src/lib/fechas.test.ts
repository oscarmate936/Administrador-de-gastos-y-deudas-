import { describe, expect, it } from 'vitest';
import { aFechaTexto, diasEntre, esFechaValida, fechaRelativa, haceCuanto, mesDe, moverMes } from './fechas';

describe('fechas', () => {
  it('usa la fecha local y no UTC', () => {
    // 11:30 pm en hora local sigue siendo el mismo día.
    expect(aFechaTexto(new Date(2026, 10, 13, 23, 30))).toBe('2026-11-13');
  });

  it('cuenta días entre fechas, incluso cruzando meses y años', () => {
    expect(diasEntre('2026-11-05', '2026-11-13')).toBe(8);
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(diasEntre('2026-11-13', '2026-11-13')).toBe(0);
  });

  it('valida fechas', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('13/11/2026')).toBe(false);
    expect(esFechaValida(20261113)).toBe(false);
  });

  it('mueve meses cruzando el año', () => {
    expect(mesDe('2026-11-13')).toBe('2026-11');
    expect(moverMes('2026-12', 1)).toBe('2027-01');
    expect(moverMes('2026-01', -1)).toBe('2025-12');
  });

  it('describe fechas cercanas', () => {
    expect(fechaRelativa('2026-11-13', '2026-11-13')).toBe('Hoy');
    expect(fechaRelativa('2026-11-12', '2026-11-13')).toBe('Ayer');
    expect(haceCuanto('2026-11-05', '2026-11-13')).toBe('hace 8 días');
    expect(haceCuanto('2026-11-13', '2026-11-13')).toBe('hoy');
  });
});
