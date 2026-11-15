import { describe, expect, it } from 'vitest';
import type { Categoria, Foto, Movimiento } from '../db';
import { cierreDelMes, mesParaResumen } from './cierreMes';

let n = 0;
const mov = (m: Partial<Movimiento> & Pick<Movimiento, 'tipo' | 'montoCentavos' | 'fecha'>): Movimiento => ({ id: `m${n++}`, nota: '', creadoEn: 0, ...m });
const categorias: Categoria[] = [
  { id: 'comida', nombre: 'Comida', emoji: '', color: '#000', orden: 1 },
  { id: 'super', nombre: 'Supermercado', emoji: '', color: '#000', orden: 2 },
] as Categoria[];
const foto = (mes: string, deuda: number): Foto => ({ mes, fecha: `${mes}-28`, disponibleCentavos: 0, deudaTotalCentavos: deuda, deudas: [] });

describe('resumen del mes que terminó', () => {
  const movimientos = [
    mov({ tipo: 'gasto', montoCentavos: 30000, fecha: '2026-09-10', categoriaId: 'comida' }),
    mov({ tipo: 'ingreso', montoCentavos: 90000, fecha: '2026-10-01', esPago: true }),
    mov({ tipo: 'gasto', montoCentavos: 12000, fecha: '2026-10-03', categoriaId: 'comida' }),
    mov({ tipo: 'gasto', montoCentavos: 8000, fecha: '2026-10-05', categoriaId: 'super', tarjetaId: 't1' }),
    mov({ tipo: 'pago', montoCentavos: 25000, fecha: '2026-10-15', tarjetaId: 't1' }),
    mov({ tipo: 'gasto', montoCentavos: 999, fecha: '2026-11-01', categoriaId: 'comida' }),
  ];

  it('junta lo que entró, gastaste, pagaste, lo que sobró y cuánto bajó la deuda', () => {
    const c = cierreDelMes({ movimientos, categorias, historial: [foto('2026-09', 300000), foto('2026-10', 280000)] }, '2026-10');
    expect(c).toEqual({
      mes: '2026-10',
      entroCentavos: 90000,
      gastadoCentavos: 20000,
      aDeudasCentavos: 25000,
      // La compra con tarjeta no sale del disponible: 900 − 120 − 250.
      sobroCentavos: 53000,
      bajoDeudaCentavos: 20000,
      mayor: { nombre: 'Comida', totalCentavos: 12000, porcentaje: 60 },
      contraAnteriorCentavos: -10000,
    });
  });

  it('sin fotos de los dos meses no inventa cuánto bajó la deuda; sin movimientos no hay resumen', () => {
    expect(cierreDelMes({ movimientos, categorias, historial: [foto('2026-10', 1)] }, '2026-10')?.bajoDeudaCentavos).toBeNull();
    expect(cierreDelMes({ movimientos, categorias, historial: [] }, '2026-08')).toBeNull();
    expect(cierreDelMes({ movimientos, categorias, historial: [] }, '2026-09')?.contraAnteriorCentavos).toBeNull();
  });

  it('se muestra la primera semana del mes, hasta que se cierra', () => {
    expect(mesParaResumen('2026-11-01')).toBe('2026-10');
    expect(mesParaResumen('2026-11-07')).toBe('2026-10');
    expect(mesParaResumen('2026-11-08')).toBeNull();
    expect(mesParaResumen('2026-11-03', '2026-10')).toBeNull();
    expect(mesParaResumen('2027-01-02', '2026-11')).toBe('2026-12');
  });
});
