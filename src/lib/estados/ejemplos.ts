import type { Item, Pagina } from './tipos';

// Estados de cuenta de ejemplo con datos inventados. Imitan la posición del texto
// en los PDF reales de cada banco para probar el lector sin datos personales.

const it = (texto: string, x: number, y: number): Item => ({ texto, x, y, ancho: texto.length * 4.4 });

export function ejemploDavivienda(): Pagina[] {
  const fila = (y: number, fecha: string, concepto: string, monto: string, abono = false): Item[] => [
    it(fecha, 35.3, y),
    it(fecha, 95.9, y),
    it('U12345', 156.5, y),
    it(concepto, 229.9, y),
    it('SAN SALVADOR', 303.3, y),
    it('$', abono ? 533 : 462.8, y),
    it(monto, abono ? 558.5 : 485.1, y),
  ];
  const p1: Item[] = [
    it('Banco Davivienda Salvadoreño, S.A.', 15.5, 748.3),
    it('ESTADO DE CUENTA TARJETA', 211, 726.4),
    it('MASTERCARD CLASICA', 420.8, 726.4),
    it('NÚMERO DE CUENTA', 211, 711.6),
    it('5200********1234', 449.8, 711.6),
    it('CLIENTE DE PRUEBA', 14, 693.5),
    it('PAGO MÍNIMO ($)', 207.6, 683.5), it('25.00', 303.5, 683.5), it('SALDO ANTERIOR', 332.3, 683.5), it('500.00', 437.8, 683.5),
    it('CUOTA EN MORA', 473.8, 683.5), it('0.00', 583.4, 683.5),
    it('PAGO DE CONTADO ($)', 207.6, 673), it('560.00', 293.8, 673), it('(+)CARGOS', 332.3, 673), it('90.00', 443.6, 673),
    it('FECHA LÍMITE DE PAGO', 207.6, 662), it('03 DIC 2026', 281.7, 662), it('(+) INTERESES', 332.3, 662), it('20.00', 447.5, 662),
    it('LÍMITE DE CRÉDITO ($)', 207.6, 653), it('1,000.00', 293.8, 653), it('(-) ABONOS', 332.3, 653), it('50.00', 443.6, 653),
    // El banco imprime estos dos valores un poco más arriba que sus etiquetas.
    it('440.00', 303.5, 642.6), it('560.00', 437.8, 642.6),
    it('CRÉDITO DISPONIBLE ($)', 207.6, 639.7), it('(=) SALDO TOTAL', 332.3, 639.7), it('(+)', 473.8, 639.7),
    it('FECHA DE CORTE', 207.6, 630), it('08/11/2026', 286, 630), it('(=) PAGO MÍNIMO', 473.8, 630), it('25.00', 579.5, 630),
    it('% TASA DE INTERÉS ANUAL', 474.2, 594.5), it('47.00', 579.5, 594.5),
    it('FECHA DE', 31.3, 475.9), it('FECHA DE', 101.2, 475.9), it('NÚMERO DE', 168.5, 475.9),
    it('CONCEPTO', 324.5, 471.9), it('CARGOS', 481.3, 471.9), it('ABONOS', 550.4, 471.9),
    it('TRANSACCIÓN', 25, 467.1), it('PROCESO', 102.5, 467.1), it('AUTORIZACIÓN', 163.7, 467.1),
    it('****00001234 CLIENTE', 229.9, 457.7),
    ...fila(449.8, '10/10/2026', 'SUPER SELECTOS', '40.00'),
    ...fila(441.9, '15/10/2026', 'PIZZA HUT', '30.00'),
    ...fila(434, '20/10/2026', 'GRACIAS POR SU PAGO INTERNET', '50.00', true),
    ...fila(426.1, '25/10/2026', 'NETFLIX.COM', '20.00'),
    it('08/11/2026', 35.3, 418.2), it('08/11/2026', 95.9, 418.2), it('INTERES SOBRE SALDO', 229.9, 418.2), it('$', 462.8, 418.2), it('20.00', 485.1, 418.2),
    it('RESUMEN DE EXTRAFINANCIAMIENTO Y/O COMPRA A PLAZOS', 162.9, 276),
    // Una fila con fecha debajo de otra tabla no debe leerse como movimiento.
    ...fila(250, '01/11/2026', 'NO ES UN MOVIMIENTO', '99.00'),
  ];
  const p2: Item[] = [
    it('FECHA DE', 32, 743.6), it('CONCEPTO', 325.1, 739.6), it('CARGOS', 481.9, 739.6), it('ABONOS', 551.1, 739.6),
    it('TRANSACCIÓN', 25.6, 734.9), it('AUTORIZACIÓN', 164.3, 734.9),
    it('INFORMACIÓN RELEVANTE', 264.5, 584.4),
  ];
  return [{ items: p1 }, { items: p2 }];
}

export function ejemploBancoAgricola(): Pagina[] {
  const fila = (y: number, fecha: string, concepto: string, cargo: string, abono: string): Item[] => [
    it(fecha, 260, y),
    it(concepto, 315, y),
    it(cargo, cargo.length > 4 ? 516.5 : 520.4, y),
    it(abono, abono.length > 4 ? 570.5 : 574.4, y),
  ];
  const p1: Item[] = [
    it('ESTADO DE CUENTA', 249.6, 745),
    it('VISA CLASICA', 266.7, 733),
    it('FECHA LÍMITE DE PAGO', 25, 700.9), it('01/12/2026', 124.5, 700.9), it('PAGO DE CONTADO TDC', 175.9, 700.9), it('215.50', 284.3, 700.9),
    it('PAGO MÍNIMO TDC', 330.2, 700.9), it('9.80', 421.7, 700.9), it('PAGO EXTRAFINAN', 463.7, 700.9), it('0.00', 557.7, 700.9),
    it('CLIENTE DE PRUEBA', 22, 672.3),
    it('bancoagricola.com', 239, 643.4),
    it('TARJETA DE CRÉDITO', 58, 547.4), it('AUTORIZACIÓN', 184.1, 547.4), it('FECHA TRANSAC', 247.9, 547.4),
    it('CONCEPTO', 375.7, 547.4), it('CARGOS', 492.3, 547.4), it('ABONOS', 547.5, 547.4),
    it('XX40-5678', 194, 532.5),
    it('LÍMITE DE CRÉDITO', 30, 528.9), it('500.00', 148.6, 528.9),
    it('123456', 199.8, 521.5), ...fila(521.5, '04/11/2026', 'COMPRA SUPER SELECTOS', '60.00', '0.00'),
    it('CRÉDITO DISPONIBLE', 30, 515.9), it('284.50', 148.6, 515.9),
    ...fila(510.5, '04/11/2026', 'IVA COMISION', '0.50', '0.00'),
    // En este banco la columna de la izquierda comparte renglón con los movimientos.
    it('FECHA DE CORTE', 30, 489.9), it('06/11/2026', 135, 489.9), ...fila(489.9, '29/10/2026', 'FARMACIA SAN NICOLAS', '25.00', '0.00'),
    ...fila(466.5, '20/10/2026', 'Pago a TDC propia', '0.00', '40.00'),
    it('FECHA LÍMITE DE PAGO', 30, 367.5), ...fila(367.5, '27/10/2026', 'UBER TRIP', '120.00', '0.00'),
    it('TOTAL TRANSACCIONES T.CRED', 315, 147.5), it('205.50', 512.6, 147.5), it('40.00', 566.6, 147.5),
    it('INTERÉS NORMAL', 28, 103.5), it('39.90% ANUAL', 115.3, 103.5),
    it('PAGO MÍNIMO', 248.8, 106.3), it('PAGO DE CONTADO', 292.4, 106.3),
  ];
  return [{ items: p1 }, { items: [it('Visa Plus en todo el mundo.', 28, 190)] }];
}
