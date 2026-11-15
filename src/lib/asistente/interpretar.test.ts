import { describe, expect, it } from 'vitest';
import type { Datos } from '../../datos';
import { CATEGORIAS_INICIALES, CATEGORIA_INTERESES, type Movimiento, type Prestamo, type Tarjeta } from '../../db';
import { interpretar } from './interpretar';
import { extraerFecha, extraerMonto, extraerPeriodo } from './textos';

// Viernes 13 de noviembre de 2026
const HOY = '2026-11-13';

const visa: Tarjeta = {
  id: 'visa', nombre: 'Visa Clásica', banco: 'Banco Agrícola', limiteCentavos: 60000, diaCorte: 6, diaPago: 1,
  saldoInicialCentavos: 41250, pendienteInicialCentavos: 41250, fechaSaldo: '2026-11-06', color: '', creadoEn: 1, ultimos4: '5678',
  ultimoEstado: { fechaCorte: '2026-11-06', fechaLimite: '2026-12-01', pagoContadoCentavos: 41250, pagoMinimoCentavos: 820, saldoCentavos: 41250 },
};
const master: Tarjeta = {
  id: 'master', nombre: 'Mastercard Clasica', banco: 'Davivienda', limiteCentavos: 120000, diaCorte: 8, diaPago: 3,
  saldoInicialCentavos: 131040, pendienteInicialCentavos: 131040, fechaSaldo: '2026-11-08', color: '', creadoEn: 2,
};
const prestamo: Prestamo = {
  id: 'p1', nombre: 'Préstamo personal', acreedor: 'Davivienda', saldoInicialCentavos: 350000, tasaAnual: 16.5,
  cuotaCentavos: 12500, primeraCuota: '2026-11-28', creadoEn: 3,
};
const categorias = [...CATEGORIAS_INICIALES, CATEGORIA_INTERESES];
const mov = (x: Partial<Movimiento>): Movimiento => ({ id: Math.random().toString(), tipo: 'gasto', montoCentavos: 0, fecha: HOY, nota: '', creadoEn: 0, ...x });
const movimientos: Movimiento[] = [
  mov({ tipo: 'ingreso', esPago: true, montoCentavos: 90000, fecha: '2026-11-01' }),
  mov({ montoCentavos: 1250, categoriaId: 'comida', fecha: '2026-11-10' }),
  mov({ montoCentavos: 3000, categoriaId: 'comida', fecha: '2026-11-12', tarjetaId: 'visa' }),
  mov({ montoCentavos: 4500, categoriaId: 'super', fecha: '2026-11-11' }),
  mov({ montoCentavos: 900, categoriaId: 'comida', fecha: '2026-10-20' }),
  mov({ montoCentavos: 4187, categoriaId: 'intereses', tarjetaId: 'master', fecha: '2026-11-08', nota: 'INTERES SOBRE SALDO' }),
];
const datos: Datos = {
  movimientos,
  categorias,
  mapaCategorias: new Map(categorias.map((c) => [c.id, c])),
  tarjetas: [visa, master],
  prestamos: [prestamo],
  recurrentes: [],
  historial: [],
};
const leer = (frase: string) => interpretar(frase, datos, HOY);

describe('piezas', () => {
  it('montos', () => {
    expect(extraerMonto('GASTE 12.50 EN ALMUERZO')?.valor).toBe(1250);
    expect(extraerMonto('GASTE 12,50')?.valor).toBe(1250);
    expect(extraerMonto('$1,250.75 DE ALQUILER')?.valor).toBe(125075);
    expect(extraerMonto('GASTE VEINTE DOLARES')?.valor).toBe(2000);
    expect(extraerMonto('CON LA TARJETA TERMINADA EN 5678 GASTE 8')?.valor).toBe(800);
    expect(extraerMonto('GASTE EN ALMUERZO')).toBeNull();
  });

  it('fechas', () => {
    expect(extraerFecha('GASTE 5 AYER', HOY)?.valor).toBe('2026-11-12');
    expect(extraerFecha('ANTIER', HOY)?.valor).toBe('2026-11-11');
    expect(extraerFecha('EL LUNES', HOY)?.valor).toBe('2026-11-09');
    expect(extraerFecha('EL VIERNES', HOY)?.valor).toBe('2026-11-13');
    expect(extraerFecha('EL 5 DE NOVIEMBRE', HOY)?.valor).toBe('2026-11-05');
    expect(extraerFecha('EL 20 DE DICIEMBRE', HOY)?.valor).toBe('2025-12-20');
    expect(extraerFecha('EL 20', HOY)?.valor).toBe('2026-10-20');
    expect(extraerFecha('05/11', HOY)?.valor).toBe('2026-11-05');
    expect(extraerFecha('GASTE 5', HOY)).toBeNull();
    // "el 5" seguido de un monto no es una fecha
    expect(extraerFecha('PAGUE EL 5.50', HOY)).toBeNull();
  });

  it('periodos', () => {
    expect(extraerPeriodo('CUANTO GASTE', HOY)).toEqual({ desde: '2026-11-01', hasta: HOY, nombre: 'este mes' });
    expect(extraerPeriodo('ESTA SEMANA', HOY)).toEqual({ desde: '2026-11-09', hasta: HOY, nombre: 'esta semana' });
    expect(extraerPeriodo('EL MES PASADO', HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', nombre: 'el mes pasado' });
    expect(extraerPeriodo('EN OCTUBRE', HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', nombre: 'en octubre' });
    expect(extraerPeriodo('EN DICIEMBRE', HOY).desde).toBe('2025-12-01');
  });
});

describe('frases que antes se leían mal', () => {
  it('«1.500» son mil quinientos, no un dólar', () => {
    expect(extraerMonto('GASTE 1.500 EN LA RENTA')?.valor).toBe(150000);
    expect(extraerMonto('GASTE 12.500,50')?.valor).toBe(1250050);
    expect(extraerMonto('GASTE 1.50')?.valor).toBe(150);
    expect(extraerMonto('GASTE 1,500')?.valor).toBe(150000);
  });
  it('«hace 2 días» y «hace una semana» ponen la fecha y no ensucian la nota', () => {
    expect(extraerFecha('GASTE 20 HACE 2 DIAS', HOY)?.valor).toBe('2026-11-11');
    expect(extraerFecha('GASTE 20 HACE UNA SEMANA', HOY)?.valor).toBe('2026-11-06');
    expect(extraerFecha('GASTE 20 HACE TRES DIAS', HOY)?.valor).toBe('2026-11-10');
    const r = interpretar('gaste 20 en gasolina hace 2 dias', datos, HOY);
    expect(r).toMatchObject({ tipo: 'gasto', montoCentavos: 2000, fecha: '2026-11-11', categoriaId: 'transporte', nota: 'gasolina' });
  });
  it('conserva la nota aunque el monto vaya después', () => {
    expect(interpretar('compré pupusas por 4.50 ayer', datos, HOY)).toMatchObject({
      tipo: 'gasto', montoCentavos: 450, fecha: '2026-11-12', categoriaId: 'comida', nota: 'pupusas',
    });
    expect(interpretar('compré unos tamales por 3', datos, HOY)).toMatchObject({ categoriaId: 'comida', nota: 'tamales' });
  });
});

describe('registrar', () => {
  it('gasto con categoría, tarjeta y fecha', () => {
    expect(leer('Gasté 12.50 en almuerzo con la Visa ayer')).toEqual({
      tipo: 'gasto', montoCentavos: 1250, categoriaId: 'comida', tarjetaId: 'visa', fecha: '2026-11-12', nota: 'almuerzo',
    });
  });

  it('gasto en efectivo sin verbo', () => {
    expect(leer('5 dólares de bus')).toEqual({ tipo: 'gasto', montoCentavos: 500, categoriaId: 'transporte', tarjetaId: undefined, fecha: HOY, nota: 'bus' });
  });

  it('compra con la mastercard por banco', () => {
    expect(leer('compré 45 en el súper con la de Davivienda')).toMatchObject({ tipo: 'gasto', montoCentavos: 4500, categoriaId: 'super', tarjetaId: 'master' });
  });

  it('pagué con la tarjeta es un gasto, no un pago a la tarjeta', () => {
    expect(leer('pagué 30 de luz con la visa')).toMatchObject({ tipo: 'gasto', montoCentavos: 3000, categoriaId: 'servicios', tarjetaId: 'visa' });
  });

  it('pago a una tarjeta', () => {
    expect(leer('pagué 100 a la Mastercard')).toEqual({ tipo: 'pagoTarjeta', tarjetaId: 'master', montoCentavos: 10000, fecha: HOY });
    expect(leer('abono de 50 a la tarjeta de Banco Agrícola el lunes')).toEqual({ tipo: 'pagoTarjeta', tarjetaId: 'visa', montoCentavos: 5000, fecha: '2026-11-09' });
  });

  it('cuota y abono extra del préstamo', () => {
    expect(leer('pagué la cuota del préstamo')).toEqual({ tipo: 'pagoPrestamo', prestamoId: 'p1', montoCentavos: undefined, extra: false, fecha: HOY });
    expect(leer('abono extra de 200 al préstamo')).toMatchObject({ tipo: 'pagoPrestamo', prestamoId: 'p1', montoCentavos: 20000, extra: true });
  });

  it('ingresos', () => {
    expect(leer('me pagaron 450')).toEqual({ tipo: 'ingreso', montoCentavos: 45000, esPago: true, fecha: HOY, nota: '' });
    expect(leer('recibí 20 de mi tía')).toMatchObject({ tipo: 'ingreso', montoCentavos: 2000, esPago: false });
  });

  it('frases sin sentido', () => {
    expect(leer('hola')).toEqual({ tipo: 'noEntendi' });
    expect(leer('   ')).toEqual({ tipo: 'noEntendi' });
  });
});

describe('preguntas', () => {
  const titulo = (frase: string) => {
    const r = leer(frase);
    return r.tipo === 'respuesta' ? r.titulo : r.tipo;
  };
  const lineas = (frase: string) => {
    const r = leer(frase);
    return r.tipo === 'respuesta' ? r.lineas : [];
  };

  it('cuánto gasté', () => {
    expect(titulo('¿Cuánto gasté este mes?')).toBe('Gastaste $129.37 este mes');
    expect(titulo('cuanto gaste en comida')).toBe('Gastaste $42.50 en comida este mes');
    expect(titulo('¿cuánto gasté en comida el mes pasado?')).toBe('Gastaste $9.00 en comida el mes pasado');
    expect(lineas('cuanto gaste en comida')).toEqual(['De eso, $30.00 con tarjeta.']);
  });

  it('cuánto debo', () => {
    expect(titulo('¿cuánto debo?')).toBe('Debes $5,252.90 en total');
    expect(titulo('cuanto debo en la visa')).toBe('Debes $442.50 en Visa Clásica');
  });

  it('cuándo pago', () => {
    expect(titulo('¿cuándo pago la Mastercard?')).toBe('Mastercard Clasica');
    expect(lineas('¿cuándo pago la visa?')[0]).toBe('Pago de contado: $412.50 antes del 1 dic (faltan 18 días).');
    expect(lineas('¿cuándo pago la visa?')[1]).toBe('Pago mínimo: $8.20.');
    expect(titulo('¿qué tengo que pagar?')).toBe('Tus próximos pagos');
  });

  it('disponible, préstamo, intereses y mínimo', () => {
    expect(titulo('¿cuánto tengo disponible?')).toBe('Tienes $833.50 disponibles');
    expect(lineas('¿cuánto me falta del préstamo?')).toEqual(['Préstamo personal: debes $3,500.00; te faltan 3 años, terminas en oct 2029.']);
    expect(titulo('¿cuánto pagué de intereses este mes?')).toBe('Pagaste $41.87 en intereses y comisiones este mes');
    expect(lineas('¿cuál es el mínimo de la visa?')).toEqual(['Visa Clásica: $8.20 antes del 1 dic.']);
  });

  it('pregunta que no entiende', () => {
    expect(titulo('¿qué hora es?')).toBe('noEntendi');
  });

  it('"el préstamo" sin nombre es el único que hay', () => {
    expect(titulo('¿cuánto me falta del préstamo?')).toBe('Préstamo personal');
  });
});
