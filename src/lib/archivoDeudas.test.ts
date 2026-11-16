import { describe, expect, it } from 'vitest';
import { BaseDeDatos, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { leerAjustes } from './ajustes';
import { aplicarImportacion, esArchivoDeudas, leerArchivoDeudas, planImportacion } from './archivoDeudas';
import { estadoPrestamo, estadoTarjeta } from './deudas';

const HOY = '2026-11-16';
const visa: Tarjeta = {
  id: 'archivo-visa', nombre: 'Visa ···1111', banco: 'Banco Uno', limiteCentavos: 50000, diaCorte: 6, diaPago: 1,
  saldoInicialCentavos: 30000, pendienteInicialCentavos: 30000, fechaSaldo: '2026-11-06', color: '#111', creadoEn: 1,
  ultimos4: '1111', tasaAnual: 40, formaPago: 'recomendado',
  ultimoEstado: { fechaCorte: '2026-11-06', fechaLimite: '2026-12-01', pagoContadoCentavos: 30000, pagoMinimoCentavos: 900, saldoCentavos: 30000 },
};
const master: Tarjeta = { ...visa, id: 'archivo-master', nombre: 'Master ···2222', banco: 'Banco Dos', ultimos4: '2222', diaCorte: 8, diaPago: 3 };
const prestamo: Prestamo = {
  id: 'archivo-p', nombre: 'Préstamo Banco Tres', acreedor: 'Banco Tres', saldoInicialCentavos: 400000, tasaAnual: 9, cuotaCentavos: 7000,
  primeraCuota: '2026-12-03', creadoEn: 1, cargosCentavos: 500, cargosBaseCentavos: 400000,
};
const adelanto: Prestamo = { ...prestamo, id: 'archivo-a', nombre: 'Adelanto', acreedor: 'Tienda', saldoInicialCentavos: 30000, tasaAnual: 0, cuotaCentavos: 7500, cargosCentavos: undefined, cargosBaseCentavos: undefined, primeraCuota: '2026-11-30' };
const archivo = { app: 'mis-finanzas', tipo: 'deudas', version: 1, tarjetas: [visa, master], prestamos: [prestamo, adelanto], sueldo: { frecuencia: 'mensual', dia: 18, diaHasta: 22, comidaCentavos: 20000 } };
const texto = JSON.stringify(archivo);

describe('archivo de deudas', () => {
  it('se reconoce y se valida; un respaldo normal no es un archivo de deudas', () => {
    expect(esArchivoDeudas(texto)).toBe(true);
    expect(esArchivoDeudas(JSON.stringify({ app: 'mis-finanzas', version: 3, movimientos: [] }))).toBe(false);
    const a = leerArchivoDeudas(texto);
    expect(a.tarjetas).toHaveLength(2);
    expect(a.prestamos).toHaveLength(2);
    expect(a.sueldo).toEqual({ frecuencia: 'mensual', dia: 18, diaHasta: 22, comidaCentavos: 20000 });
    expect(() => leerArchivoDeudas(JSON.stringify({ ...archivo, tarjetas: [], prestamos: [] }))).toThrow('no trae tarjetas ni préstamos');
    expect(() => leerArchivoDeudas('hola')).toThrow('no es un archivo de deudas');
  });

  it('en un celular vacío, todo es nuevo', () => {
    const plan = planImportacion(leerArchivoDeudas(texto), { tarjetas: [], prestamos: [], movimientos: [] }, HOY);
    expect(plan.tarjetas.every((t) => t.nueva)).toBe(true);
    expect(plan.prestamos.every((p) => p.nuevo)).toBe(true);
  });

  it('pone al día lo que ya existe sin duplicarlo y sin perder los pagos', () => {
    // En el celular: la Visa (mismos 4 dígitos, otro nombre y color), la Master creada a mano sin dígitos,
    // y el préstamo con otro nombre pero el mismo banco, con una cuota ya pagada.
    const visaCel: Tarjeta = { ...visa, id: 'cel-visa', nombre: 'Mi Visa', color: '#f00', fechaSaldo: '2026-10-06', saldoInicialCentavos: 25000 };
    const masterCel: Tarjeta = { ...master, id: 'cel-master', nombre: 'Master', ultimos4: undefined, fechaSaldo: '2026-10-08' };
    const prestamoCel: Prestamo = { ...prestamo, id: 'cel-p', nombre: 'Mi préstamo', saldoInicialCentavos: 405000, primeraCuota: '2026-11-03' };
    const cuota: Movimiento = { id: 'c1', tipo: 'pago', montoCentavos: 7000, fecha: '2026-11-03', prestamoId: 'cel-p', capitalCentavos: 5000, cuotaCentavos: 7000, nota: '', creadoEn: 1 };
    const plan = planImportacion(leerArchivoDeudas(texto), { tarjetas: [visaCel, masterCel], prestamos: [prestamoCel], movimientos: [cuota] }, HOY);

    const [v, m] = plan.tarjetas;
    expect(v).toMatchObject({ nueva: false, tarjeta: { id: 'cel-visa', nombre: 'Mi Visa', color: '#f00', fechaSaldo: '2026-11-06', saldoInicialCentavos: 30000, formaPago: 'recomendado' } });
    expect(m).toMatchObject({ nueva: false, tarjeta: { id: 'cel-master', ultimos4: '2222' } });

    const [p, a] = plan.prestamos;
    expect(p.nuevo).toBe(false);
    expect(p.prestamo.id).toBe('cel-p');
    // Con la cuota ya pagada, el saldo queda como dice el archivo y la próxima cuota es la del archivo.
    const e = estadoPrestamo(p.prestamo, [cuota], HOY);
    expect(e.saldoCentavos).toBe(400000);
    expect(e.proximaFecha).toBe('2026-12-03');
    expect(a.nuevo).toBe(true);
  });

  it('si el celular ya tiene un corte más reciente, no lo pisa', () => {
    const nueva: Tarjeta = { ...visa, id: 'cel-visa', fechaSaldo: '2026-12-06', saldoInicialCentavos: 12345, formaPago: 'total' };
    const [v] = planImportacion(leerArchivoDeudas(texto), { tarjetas: [nueva], prestamos: [], movimientos: [] }, HOY).tarjetas;
    expect(v).toMatchObject({ sinCambios: true, tarjeta: { fechaSaldo: '2026-12-06', saldoInicialCentavos: 12345, formaPago: 'recomendado' } });
  });

  it('cargarlo otra vez después de pagar cuotas no deshace los pagos', () => {
    const cuota: Movimiento = { id: 'c', tipo: 'pago', montoCentavos: 7000, fecha: '2026-12-03', prestamoId: 'archivo-p', capitalCentavos: 4000, cuotaCentavos: 7000, nota: '', creadoEn: 1 };
    const plan = planImportacion(leerArchivoDeudas(texto), { tarjetas: [], prestamos: [prestamo], movimientos: [cuota] }, '2026-12-05');
    expect(plan.prestamos[0]).toMatchObject({ nuevo: false, sinCambios: true });
    const e = estadoPrestamo(plan.prestamos[0].prestamo, [cuota], '2026-12-05');
    expect(e.saldoCentavos).toBe(396000);
    expect(e.proximaFecha).toBe('2027-01-03');
  });

  it('se guarda todo de una vez, con el sueldo, sin tocar los movimientos', async () => {
    const base = new BaseDeDatos('archivo-deudas-prueba');
    await base.open();
    await base.movimientos.add({ id: 'g', tipo: 'gasto', montoCentavos: 500, fecha: '2026-11-10', nota: 'café', creadoEn: 1 });
    const plan = planImportacion(leerArchivoDeudas(texto), { tarjetas: [], prestamos: [], movimientos: [] }, HOY);
    await aplicarImportacion(base, plan);
    expect(await base.tarjetas.count()).toBe(2);
    expect(await base.prestamos.count()).toBe(2);
    expect(await base.movimientos.count()).toBe(1);
    const s = (await leerAjustes(base)).sueldo;
    expect(s).toMatchObject({ frecuencia: 'mensual', dia: 18, diaHasta: 22, comidaCentavos: 20000, categoriasComida: ['comida', 'super'] });
    const t = await base.tarjetas.get('archivo-visa');
    expect(estadoTarjeta(t!, [], HOY).recomendadoPendienteCentavos).toBe(1300);
    base.close();
    await base.delete();
  });
});
