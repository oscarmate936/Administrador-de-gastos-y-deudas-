import { describe, expect, it } from 'vitest';
import { combinar } from './combinar';
import { leerCapturaPrestamo } from './prestamo';

describe('combinar lecturas', () => {
  it('coinciden, falta una o difieren', () => {
    expect(combinar(2360, 2360)).toEqual({ valor: 2360, dudoso: false });
    expect(combinar(undefined, 2300)).toEqual({ valor: 2300, dudoso: false });
    expect(combinar(2360, null)).toEqual({ valor: 2360, dudoso: false });
    expect(combinar(2360, 2300)).toEqual({ valor: 2360, dudoso: true, alternativa: 2300 });
  });

  it('caso real de lector: el moderno confunde 6 con 0 y el clásico no', () => {
    const moderno = leerCapturaPrestamo('Tasade interés\n19.70%\nCuota\n$76.40');
    const clasico = leerCapturaPrestamo('. Tasa de interés\n19.76%\nCuota\n$76.40');
    const tasa = combinar(clasico.tasaAnual, moderno.tasaAnual);
    expect(tasa).toEqual({ valor: 19.76, dudoso: true, alternativa: 19.7 });
    expect(combinar(clasico.cuotaCentavos, moderno.cuotaCentavos)).toEqual({ valor: 7640, dudoso: false });
  });
});

import type { Movimiento, Prestamo } from '../../db';
import { ajustarPrestamo, estadoPrestamo } from '../deudas';
import { leerCapturaConDosMotores } from './prestamo';

describe('actualizar un préstamo con la captura del banco', () => {
  it('combina los dos motores', () => {
    const c = leerCapturaConDosMotores(
      'Tipo\nPréstamo de Consumo\nDeuda total\n$2,431.18\nCuota\n$76.40\nTasade interés\n19.70%\nFecha de pago\n05/12/2026',
      'Tipo\nPréstamo de Consumo ?\nDeuda total\n$2,431.18\nCuota\n$76.40\n. Tasa de interés\n19.76%\nFecha de pago\n05/12/2026',
    );
    expect(c.nombre).toBe('Préstamo de Consumo');
    expect(c.saldo).toEqual({ valor: 243118, dudoso: false });
    expect(c.tasaAnual).toEqual({ valor: 19.76, dudoso: true, alternativa: 19.7 });
    expect(c.proximaFecha).toEqual({ valor: '2026-12-05', dudoso: false });
  });

  it('el saldo y la próxima cuota quedan como los del banco sin borrar los pagos registrados', () => {
    const p: Prestamo = {
      id: 'p', nombre: 'Consumo', acreedor: '', saldoInicialCentavos: 250000, tasaAnual: 18, cuotaCentavos: 7000,
      primeraCuota: '2026-09-05', creadoEn: 0,
    };
    const pagos: Movimiento[] = [
      { id: 'a', tipo: 'pago', montoCentavos: 7000, fecha: '2026-09-05', prestamoId: 'p', capitalCentavos: 3250, nota: '', creadoEn: 1 },
      { id: 'b', tipo: 'pago', montoCentavos: 7000, fecha: '2026-10-05', prestamoId: 'p', capitalCentavos: 3300, nota: '', creadoEn: 2 },
    ];
    const ajustado = ajustarPrestamo(p, pagos, '2026-11-14', {
      saldoCentavos: 243118, cuotaCentavos: 7640, tasaAnual: 19.76, proximaFecha: '2026-12-05',
    });
    const e = estadoPrestamo(ajustado, pagos, '2026-11-14');
    expect(e.saldoCentavos).toBe(243118);
    expect(e.proximaFecha).toBe('2026-12-05');
    expect(e.cuotasPagadas).toBe(2);
    expect(ajustado).toMatchObject({ cuotaCentavos: 7640, tasaAnual: 19.76, saldoInicialCentavos: 243118 + 6550, primeraCuota: '2026-10-05' });
  });
});
