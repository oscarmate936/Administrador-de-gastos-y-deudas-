import type { Categoria, Movimiento, Prestamo, Tarjeta } from '../db';

// Exportar movimientos para abrirlos en Excel o Google Sheets.

const TIPOS: Record<Movimiento['tipo'], string> = { ingreso: 'Ingreso', gasto: 'Gasto', pago: 'Pago de deuda' };

/** Encierra en comillas si hace falta y evita que Excel ejecute fórmulas. */
function celda(valor: string): string {
  const esNumero = /^-?\d+(\.\d+)?$/.test(valor);
  const seguro = !esNumero && /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function movimientosACsv(
  movimientos: Movimiento[],
  datos: { categorias: Categoria[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
): string {
  const categoria = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const tarjeta = new Map(datos.tarjetas.map((t) => [t.id, t.nombre]));
  const prestamo = new Map(datos.prestamos.map((p) => [p.id, p.nombre]));
  const filas = [
    ['Fecha', 'Tipo', 'Monto', 'Categoría', 'Forma de pago o deuda', 'Abono a capital', 'Nota'],
    ...[...movimientos]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn - b.creadoEn)
      .map((m) => {
        const signo = m.tipo === 'ingreso' ? 1 : -1;
        const destino = m.prestamoId
          ? (prestamo.get(m.prestamoId) ?? 'Préstamo eliminado')
          : m.tarjetaId
            ? (tarjeta.get(m.tarjetaId) ?? 'Tarjeta eliminada')
            : m.tipo === 'gasto'
              ? 'Efectivo o débito'
              : '';
        return [
          m.fecha,
          m.tipo === 'ingreso' && m.esPago ? 'Mi pago' : TIPOS[m.tipo],
          ((signo * m.montoCentavos) / 100).toFixed(2),
          m.categoriaId ? (categoria.get(m.categoriaId) ?? 'Sin categoría') : m.tipo === 'gasto' ? 'Sin categoría' : '',
          destino,
          m.capitalCentavos !== undefined ? (m.capitalCentavos / 100).toFixed(2) : '',
          m.nota,
        ];
      }),
  ];
  // BOM para que Excel lea bien las tildes.
  return '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n') + '\r\n';
}
