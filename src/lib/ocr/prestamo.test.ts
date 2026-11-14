import { describe, expect, it } from 'vitest';
import { leerCapturaPrestamo } from './prestamo';

// Texto como el que sale del lector al leer la captura de un préstamo en la app
// del banco (cifras inventadas; mismos tropiezos del lector: basura y palabras pegadas).
const CAPTURA = `-
< >
Alias o referencia
9000000001 Préstamo de
Consumo
Tipo
Préstamo de Consumo
Número
9000000001
Monto original
$2,500.00
Deuda total
$2,431.18
Cuota
$76.40
uN Tasade interés
19.75%
Fecha de pago
05/12/2026
Valor pendiente de pago
$0.00
Cuotas en mora p
0
Días de mora
0`;

describe('captura de préstamo', () => {
  it('lee los datos y no confunde la cuota con las cuotas en mora', () => {
    expect(leerCapturaPrestamo(CAPTURA)).toEqual({
      nombre: 'Préstamo de Consumo',
      montoOriginalCentavos: 250000,
      saldoCentavos: 243118,
      cuotaCentavos: 7640,
      tasaAnual: 19.75,
      proximaFecha: '2026-12-05',
      pendienteCentavos: 0,
      cuotasEnMora: 0,
    });
  });

  it('acepta etiquetas y valores en el mismo renglón y otros nombres', () => {
    expect(
      leerCapturaPrestamo(`Préstamo personal
Producto: Préstamo Personal
Saldo de capital: $3,100.50
Valor de la cuota: $120.00
Tasa nominal anual 16.5 %
Próximo pago 28/11/2026`),
    ).toMatchObject({ nombre: 'Préstamo Personal', saldoCentavos: 310050, cuotaCentavos: 12000, tasaAnual: 16.5, proximaFecha: '2026-11-28' });
  });

  it('sin datos no inventa nada', () => {
    expect(leerCapturaPrestamo('Hola\nmundo')).toEqual({
      nombre: undefined, montoOriginalCentavos: undefined, saldoCentavos: undefined, cuotaCentavos: undefined,
      tasaAnual: undefined, proximaFecha: undefined, pendienteCentavos: undefined, cuotasEnMora: undefined,
    });
  });
});
