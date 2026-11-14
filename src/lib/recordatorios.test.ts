import { describe, expect, it } from 'vitest';
import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { AJUSTES_INICIALES } from './ajustes';
import { generarRecordatorios, idDe } from './recordatorios';

const tarjeta: Tarjeta = {
  id: 't1', nombre: 'Visa', banco: '', limiteCentavos: 100000, diaCorte: 20, diaPago: 15,
  saldoInicialCentavos: 30000, pendienteInicialCentavos: 10000, fechaSaldo: '2026-11-12', color: '#000', creadoEn: 0,
};
const prestamo: Prestamo = {
  id: 'p1', nombre: 'Personal', acreedor: '', saldoInicialCentavos: 100000, tasaAnual: 12, cuotaCentavos: 10000,
  primeraCuota: '2026-11-30', creadoEn: 0,
};
const ajustes = {
  recordatorios: { ...AJUSTES_INICIALES.recordatorios, activo: true },
  respaldo: { recordarCadaDias: 7, ultimoExterno: '2026-11-10T12:00:00' },
};
// 13 nov 2026, 7:00 a. m. hora local (antes de la hora de los avisos, 8:00)
const ahora = new Date(2026, 10, 13, 7, 0);
const fecha = (r: { fecha: Date }) =>
  `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}-${String(r.fecha.getDate()).padStart(2, '0')}`;

describe('recordatorios', () => {
  it('sin activar no programa nada', () => {
    expect(generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [], ajustes: { ...ajustes, recordatorios: AJUSTES_INICIALES.recordatorios } }, ahora)).toEqual([]);
  });

  it('avisa del pago de contado pendiente, del corte y del estado de cuenta', () => {
    const lista = generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [], ajustes: { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false } } }, ahora);
    const claves = lista.map((r) => `${fecha(r)} ${r.clave.split(':').slice(2).join(':')}`);
    // El de 5 días antes (10 nov) ya pasó; quedan 2 días antes y el mismo día.
    expect(claves).toContain('2026-11-13 pago:2026-11-15:2');
    expect(claves).toContain('2026-11-15 pago:2026-11-15:0');
    expect(claves).toContain('2026-11-16 vencido:2026-11-15:2026-11-16');
    expect(claves).toContain('2026-11-19 corte:2026-11-20');
    expect(claves).toContain('2026-11-22 estado:2026-11-20');
    expect(claves).toContain('2026-12-19 corte:2026-12-20');
    // Lo del próximo estado de cuenta (30,000 facturados al corte del 20 nov).
    expect(claves).toContain('2026-12-10 pago:2026-12-15:5');
    expect(claves.some((c) => c.startsWith('2026-11-10'))).toBe(false);
    const hoy = lista.find((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:0')!;
    expect(hoy.titulo).toBe('Hoy es el último día para pagar Visa');
    expect(hoy.cuerpo).toBe('Pago de contado: $100.00. Último día: 15 nov.');
    expect(hoy.pagar).toBe(true);
    expect(hoy.fecha.getHours()).toBe(8);
    expect(lista[0].fecha.getTime()).toBeLessThanOrEqual(lista[1].fecha.getTime());
  });

  it('a las 9 a. m. el aviso de las 8 del mismo día ya no se programa', () => {
    const t = { ...tarjeta, pendienteInicialCentavos: 10000 };
    const lista = generarRecordatorios({ tarjetas: [t], prestamos: [], movimientos: [], ajustes }, new Date(2026, 10, 15, 9, 0));
    expect(lista.some((r) => r.clave === 'tarjeta:t1:pago:2026-11-15:0')).toBe(false);
  });

  it('al pagar el pendiente desaparecen sus avisos', () => {
    const pago: Movimiento = { id: 'x', tipo: 'pago', montoCentavos: 10000, fecha: '2026-11-13', tarjetaId: 't1', nota: '', creadoEn: 1 };
    const lista = generarRecordatorios({ tarjetas: [tarjeta], prestamos: [], movimientos: [pago], ajustes }, ahora);
    expect(lista.some((r) => r.clave.includes('pago:2026-11-15'))).toBe(false);
    expect(lista.some((r) => r.clave.includes('vencido'))).toBe(false);
  });

  it('avisa las próximas cuotas del préstamo', () => {
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [prestamo], movimientos: [], ajustes: { ...ajustes, recordatorios: { ...ajustes.recordatorios, respaldo: false } } }, ahora);
    expect(lista.filter((r) => r.clave.startsWith('prestamo')).map((r) => fecha(r))).toEqual([
      '2026-11-27', '2026-11-30', '2026-12-27', '2026-12-30',
    ]);
    expect(lista[0].titulo).toBe('Cuota de Personal en 3 días');
    expect(lista[0].cuerpo).toBe('$100.00 el 30 nov.');
  });

  it('recuerda el respaldo cada semana y deja un aviso para abrir la app', () => {
    const lista = generarRecordatorios({ tarjetas: [], prestamos: [], movimientos: [], ajustes }, ahora);
    const respaldos = lista.filter((r) => r.clave.startsWith('respaldo')).map(fecha);
    expect(respaldos.slice(0, 3)).toEqual(['2026-11-17', '2026-11-24', '2026-12-01']);
    const abrir = lista.find((r) => r.clave === 'abrir:2026-11-13');
    expect(abrir && fecha(abrir)).toBe('2027-01-09');
  });

  it('los identificadores son estables y positivos', () => {
    expect(idDe('a')).toBe(idDe('a'));
    expect(idDe('a')).not.toBe(idDe('b'));
    expect(idDe('tarjeta:t1:pago:2026-11-15:0')).toBeGreaterThan(0);
  });
});
