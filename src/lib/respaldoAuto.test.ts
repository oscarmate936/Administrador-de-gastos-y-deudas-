import { describe, expect, it } from 'vitest';
import { nuevoNombreArchivo, tocaRespaldoAuto } from './respaldoAuto';

describe('respaldo automático', () => {
  const ahora = new Date('2026-11-15T12:00:00Z');
  const activo = { activo: true, archivo: 'mis-finanzas-respaldo-ab12.json' };

  it('toca una vez al día, solo si está activo y hay contraseña en este celular', () => {
    expect(tocaRespaldoAuto(activo, ahora, true)).toBe(true);
    expect(tocaRespaldoAuto({ ...activo, ultimo: '2026-11-15T08:00:00Z' }, ahora, true)).toBe(false);
    expect(tocaRespaldoAuto({ ...activo, ultimo: '2026-11-14T10:00:00Z' }, ahora, true)).toBe(true);
    expect(tocaRespaldoAuto({ ...activo, activo: false }, ahora, true)).toBe(false);
    // Restaurado en otro celular: la contraseña no viaja, así que no hay respaldo hasta escribirla.
    expect(tocaRespaldoAuto(activo, ahora, false)).toBe(false);
    expect(tocaRespaldoAuto({ ...activo, archivo: undefined }, ahora, true)).toBe(false);
  });

  it('cada activación usa un nombre de archivo distinto', () => {
    const a = nuevoNombreArchivo();
    expect(a).toMatch(/^mis-finanzas-respaldo-[a-z0-9]{1,4}\.json$/);
    const nombres = new Set(Array.from({ length: 20 }, nuevoNombreArchivo));
    expect(nombres.size).toBeGreaterThan(15);
  });
});
