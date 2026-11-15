import { describe, expect, it } from 'vitest';
import { ordenInicio } from './ajustes';

describe('ordenInicio', () => {
  it('quita secciones desconocidas o repetidas y agrega las que falten al final', () => {
    expect(
      ordenInicio({ orden: ['mes', 'x' as never, 'mes', 'asistente'], ocultas: [], primerosPasosOculto: false }),
    ).toEqual(['mes', 'asistente', 'atencion', 'semana', 'fondo', 'ultimos']);
  });
});
