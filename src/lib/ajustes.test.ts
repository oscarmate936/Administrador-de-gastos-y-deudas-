import { describe, expect, it } from 'vitest';
import { ordenInicio } from './ajustes';

describe('ordenInicio', () => {
  it('quita secciones desconocidas o repetidas y agrega las que falten al final', () => {
    expect(
      ordenInicio({ orden: ['mes', 'x' as never, 'mes', 'asistente'], ocultas: [], primerosPasosOculto: false }),
    ).toEqual(['mes', 'asistente', 'atencion', 'semana', 'fondo', 'ultimos']);
  });
});

describe('ajustes dañados', () => {
  it('descarta valores de tipo equivocado y deja el valor normal', async () => {
    const { limpiarGrupo, AJUSTES_INICIALES } = await import('./ajustes');
    expect(limpiarGrupo(AJUSTES_INICIALES.fondo, { apartadoCentavos: 'mucho', metaCentavos: 30000 })).toEqual({ metaCentavos: 30000 });
    expect(limpiarGrupo(AJUSTES_INICIALES.recordatorios, { activo: 'si', diasTarjeta: 5, hora: '07:30' })).toEqual({ hora: '07:30' });
    expect(limpiarGrupo(AJUSTES_INICIALES.fondo, { apartadoCentavos: Number.NaN, extra: { a: 1 } })).toEqual({});
    expect(limpiarGrupo(AJUSTES_INICIALES.fondo, 'texto')).toEqual({});
  });
});
