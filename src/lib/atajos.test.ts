import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
const { atajoDeUrl } = await import('./nativo');

describe('atajoDeUrl', () => {
  it('reconoce los atajos del ícono de Android', () => {
    expect(atajoDeUrl('misfinanzas://agregar/gasto')).toBe('gasto');
    expect(atajoDeUrl('misfinanzas://agregar/ticket/')).toBe('ticket');
    expect(atajoDeUrl('misfinanzas://agregar/pago')).toBe('pago');
  });
  it('reconoce el parámetro de la versión web', () => {
    expect(atajoDeUrl('?atajo=pago')).toBe('pago');
    expect(atajoDeUrl('?x=1&atajo=gasto')).toBe('gasto');
  });
  it('ignora cualquier otra dirección', () => {
    expect(atajoDeUrl('misfinanzas://agregar/borrar-todo')).toBeNull();
    expect(atajoDeUrl('https://ejemplo.com/?atajo=otra')).toBeNull();
    expect(atajoDeUrl('')).toBeNull();
  });
});
