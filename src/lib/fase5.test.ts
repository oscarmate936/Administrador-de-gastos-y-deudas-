import { describe, expect, it } from 'vitest';
import { BaseDeDatos, type Categoria, type Movimiento, type Recurrente, type Tarjeta } from '../db';
import { movimientosACsv } from './csv';
import { coincide, pasaFiltro } from './filtros';
import { deudaPorMes, flujoPorMes, topeEje } from './graficas';
import { omitirRecurrente, pendientes, primeraFecha, registrarRecurrente, siguienteFecha } from './recurrentes';

const internet: Recurrente = {
  id: 'r1', tipo: 'gasto', montoCentavos: 2500, categoriaId: 'servicios', nota: 'Internet', dia: 31,
  proxima: '2026-10-31', activo: true, creadoEn: 0,
};

describe('movimientos recurrentes', () => {
  it('calcula la siguiente fecha conservando el día en meses cortos', () => {
    expect(siguienteFecha(internet)).toBe('2026-11-30');
    expect(siguienteFecha({ dia: 31, proxima: '2026-11-30' })).toBe('2026-12-31');
    expect(primeraFecha('2026-01-31')).toEqual({ dia: 31, proxima: '2026-02-28' });
  });

  it('lista los que ya tocan y están activos', () => {
    const otro = { ...internet, id: 'r2', proxima: '2026-11-20' };
    const pausado = { ...internet, id: 'r3', activo: false };
    expect(pendientes([otro, internet, pausado], '2026-11-14').map((r) => r.id)).toEqual(['r1']);
  });

  it('registrar crea el movimiento con la fecha que tocaba y avanza; omitir solo avanza', async () => {
    const db = new BaseDeDatos('recurrentes-prueba');
    await db.recurrentes.add(internet);
    await registrarRecurrente(db, internet);
    const [m] = await db.movimientos.toArray();
    expect(m).toMatchObject({ tipo: 'gasto', montoCentavos: 2500, fecha: '2026-10-31', categoriaId: 'servicios', nota: 'Internet' });
    expect((await db.recurrentes.get('r1'))?.proxima).toBe('2026-11-30');
    await omitirRecurrente(db, (await db.recurrentes.get('r1'))!);
    expect((await db.recurrentes.get('r1'))?.proxima).toBe('2026-12-31');
    expect(await db.movimientos.count()).toBe(1);
  });
});

const categorias: Categoria[] = [{ id: 'super', nombre: 'Supermercado', emoji: '', color: '', orden: 1 }];
const tarjetas: Tarjeta[] = [{
  id: 't1', nombre: 'Visa Clásica', banco: '', limiteCentavos: 1, diaCorte: 1, diaPago: 1, saldoInicialCentavos: 0,
  pendienteInicialCentavos: 0, fechaSaldo: '2026-01-01', color: '', creadoEn: 0,
}];
const datos = { categorias, mapaCategorias: new Map(categorias.map((c) => [c.id, c])), tarjetas, prestamos: [] };
const m = (x: Partial<Movimiento>): Movimiento => ({ id: Math.random().toString(), tipo: 'gasto', montoCentavos: 0, fecha: '2026-11-10', nota: '', creadoEn: 0, ...x });

describe('búsqueda y filtros', () => {
  const compra = m({ montoCentavos: 12550, categoriaId: 'super', tarjetaId: 't1', nota: 'Compra Selectos' });
  it('busca sin tildes ni mayúsculas en nota, categoría, tarjeta y monto', () => {
    expect(coincide(compra, 'selectos', datos)).toBe(true);
    expect(coincide(compra, 'SUPERMERCADO', datos)).toBe(true);
    expect(coincide(compra, 'visa clasica', datos)).toBe(true);
    expect(coincide(compra, '125.5', datos)).toBe(true);
    expect(coincide(compra, 'farmacia', datos)).toBe(false);
    expect(coincide(compra, '  ', datos)).toBe(true);
  });
  it('filtra por tipo', () => {
    expect(pasaFiltro(compra, 'tarjeta')).toBe(true);
    expect(pasaFiltro(compra, 'gastos')).toBe(true);
    expect(pasaFiltro(compra, 'ingresos')).toBe(false);
    expect(pasaFiltro(m({ tipo: 'pago', tarjetaId: 't1' }), 'tarjeta')).toBe(false);
  });
});

describe('CSV', () => {
  it('exporta con encabezados, signo, BOM y celdas seguras', () => {
    const csv = movimientosACsv(
      [
        m({ tipo: 'ingreso', esPago: true, montoCentavos: 80000, fecha: '2026-11-01', nota: 'Quincena' }),
        m({ montoCentavos: 12550, categoriaId: 'super', tarjetaId: 't1', nota: 'Compra, "grande"' }),
        m({ montoCentavos: 500, nota: '=HYPERLINK("x")' }),
      ],
      datos,
    );
    expect(csv.startsWith('﻿Fecha,Tipo,Monto,Categoría')).toBe(true);
    const lineas = csv.trim().split('\r\n');
    expect(lineas[1]).toBe('2026-11-01,Mi pago,800.00,,,,Quincena');
    expect(lineas[2]).toBe('2026-11-10,Gasto,-125.50,Supermercado,Visa Clásica,,"Compra, ""grande"""');
    expect(lineas[3]).toBe(`2026-11-10,Gasto,-5.00,Sin categoría,Efectivo o débito,,"'=HYPERLINK(""x"")"`);
  });
});

describe('datos de gráficas', () => {
  it('suma ingresos y salidas por mes, sin contar compras con tarjeta', () => {
    const f = flujoPorMes(
      [
        m({ tipo: 'ingreso', montoCentavos: 1000, fecha: '2026-11-01' }),
        m({ montoCentavos: 300, fecha: '2026-11-02' }),
        m({ montoCentavos: 999, fecha: '2026-11-02', tarjetaId: 't1' }),
        m({ tipo: 'pago', montoCentavos: 200, fecha: '2026-10-05', tarjetaId: 't1' }),
        m({ montoCentavos: 5, fecha: '2026-01-01' }),
      ],
      '2026-11',
      3,
    );
    expect(f).toEqual([
      { mes: '2026-09', ingresosCentavos: 0, salidasCentavos: 0 },
      { mes: '2026-10', ingresosCentavos: 0, salidasCentavos: 200 },
      { mes: '2026-11', ingresosCentavos: 1000, salidasCentavos: 300 },
    ]);
  });
  it('ordena la deuda por mes y calcula topes redondos', () => {
    const foto = (mes: string, deuda: number) => ({ mes, fecha: `${mes}-01`, disponibleCentavos: 0, deudaTotalCentavos: deuda, deudas: [] });
    expect(deudaPorMes([foto('2026-11', 5), foto('2026-10', 7)])).toEqual([
      { mes: '2026-10', deudaCentavos: 7 },
      { mes: '2026-11', deudaCentavos: 5 },
    ]);
    expect(topeEje(0)).toBe(1);
    expect(topeEje(87)).toBe(100);
    expect(topeEje(130000)).toBe(150000);
    expect(topeEje(560000)).toBe(600000);
    expect(topeEje(240)).toBe(250);
  });
});
