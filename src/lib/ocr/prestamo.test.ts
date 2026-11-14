import { describe, expect, it } from 'vitest';
import { desgloseDe, leerCapturaConDosMotores, leerCapturaPrestamo, unirCapturas } from './prestamo';

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

// Capturas con el formato de la app de BAC (cifras inventadas).
const BAC_DESGLOSE = `SV - Préstamo
$ 4,315.20 8.25% ?
Saldo sin intereses y Tasa de interés actual
deducciones
Pago pendiente Información del préstamo
º $18.40
Intereses
º $41.20
Intereses moratorios
º $0.oo
Otras deducciones
º $6.40
Total de la cuota
$66.00`;

const BAC_FECHA = `SV - Préstamo
40000000O
Número de préstamo
$ 4,315.20 8.25% ?
Saldo sin intereses y Tasa de interés actual
deducciones
Su cuota de préstamo .
Pagar prestamo
se encuenta al cobro
Pago pendiente Información del préstamo
Desglose de pago pendiente
Esta cuota vence el 3/12/2026
Principal
º $18.40
Intereses
0 $41.20
Intereses moratorios`;

const BAC_INFO = `SV - Préstamo
$ 4,315.20 8.25% ?
Saldo sin intereses y Tasa de interés actual
deducciones
Pago pendiente Información del préstamo
Tasa actual º 8.25%
Fecha de apertura 30 abril 2026
Fecha vencimiento 03 junio 2035
Saldos
Saldo principal $4,315.20
Interés a hoy $21.10
Intereses moratorios $0.00
Otras deducciones $6.40
Saldo total $4,342.70`;

describe('capturas de BAC', () => {
  it('lee saldo y tasa que van arriba de su etiqueta, la cuota total y los cargos', () => {
    expect(leerCapturaPrestamo(BAC_DESGLOSE)).toMatchObject({
      nombre: 'SV - Préstamo',
      saldoCentavos: 431520,
      tasaAnual: 8.25,
      cuotaCentavos: 6600,
      cargosCentavos: 640,
      proximaFecha: undefined,
    });
  });
  it('lee la fecha de «Esta cuota vence el» y no confunde el principal con la cuota', () => {
    const d = leerCapturaPrestamo(BAC_FECHA);
    expect(d.proximaFecha).toBe('2026-12-03');
    expect(d.cuotaCentavos).toBeUndefined();
    expect(d.saldoCentavos).toBe(431520);
  });
  it('usa el saldo principal y no el saldo total, y no toma la fecha de vencimiento del préstamo', () => {
    expect(leerCapturaPrestamo(BAC_INFO)).toMatchObject({ saldoCentavos: 431520, tasaAnual: 8.25, cargosCentavos: 640, proximaFecha: undefined });
  });
  it('junta varias capturas: cada dato de la primera que lo tenga sin dudas', () => {
    const una = (t: string) => leerCapturaConDosMotores(t, t);
    const lstmMal = leerCapturaConDosMotores(BAC_DESGLOSE.replace('8.25%', '7.25%'), BAC_DESGLOSE);
    const unida = unirCapturas([lstmMal, una(BAC_FECHA), una(BAC_INFO)]);
    expect(unida.saldo.valor).toBe(431520);
    expect(unida.cuota.valor).toBe(6600);
    expect(unida.proximaFecha.valor).toBe('2026-12-03');
    expect(unida.cargos.valor).toBe(640);
    // La primera captura leyó la tasa con duda; la de información la tiene segura.
    expect(unida.tasaAnual).toEqual({ valor: 825 / 100, dudoso: false });
    expect(unida.nombre).toBe('SV - Préstamo');
  });
});

describe('desglose de la cuota de BAC', () => {
  it('guarda el capital de la cuota pendiente cuando la fecha y el capital se leyeron sin dudas', () => {
    const c = unirCapturas([leerCapturaConDosMotores(BAC_FECHA, BAC_FECHA)]);
    expect(c.capitalCuota.valor).toBe(1840);
    expect(desgloseDe(c)).toEqual({ fecha: '2026-12-03', capitalCentavos: 1840 });
    // Sin fecha no se sabe a qué cuota corresponde.
    expect(desgloseDe(leerCapturaConDosMotores(BAC_DESGLOSE, BAC_DESGLOSE))).toBeUndefined();
    // El «Saldo principal» no es el capital de la cuota.
    expect(leerCapturaPrestamo(BAC_INFO).capitalCuotaCentavos).toBeUndefined();
  });
});
