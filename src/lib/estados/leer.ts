import {
  buscarValor,
  columnasMovimientos,
  leerPlanes,
  leerFecha,
  leerMonto,
  leerMovimientos,
  leerTasa,
  montosDelRenglon,
  normalizar,
  ordenLectura,
} from './lectura';
import type { Banco, EstadoCuentaTarjeta, MovimientoEstado, Pagina } from './tipos';

export class ErrorEstado extends Error {}

function detectarBanco(texto: string): Banco | null {
  if (texto.includes('DAVIVIENDA')) return 'Davivienda';
  if (texto.includes('BANCOAGRICOLA') || texto.includes('BANCO AGRICOLA')) return 'Banco Agrícola';
  return null;
}

/** "MASTERCARD CLASICA" -> "Mastercard Clasica" */
const titulo = (t: string) => t.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

const sumar = (movs: MovimientoEstado[], tipo: 'cargo' | 'abono') =>
  movs.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.montoCentavos, 0);

/**
 * Lee un estado de cuenta de tarjeta de crédito de Davivienda o Banco Agrícola
 * a partir del texto del PDF. Lanza ErrorEstado con un mensaje para mostrar.
 */
export function leerEstadoTarjeta(paginas: Pagina[]): EstadoCuentaTarjeta {
  const todos = paginas.flatMap((p) => p.items);
  if (todos.length === 0) {
    throw new ErrorEstado(
      'Este PDF no tiene texto: parece una imagen escaneada. Por ahora solo puedo leer los estados de cuenta que descargas de la banca en línea.',
    );
  }
  const textoCompleto = normalizar(todos.map((i) => i.texto).join(' '));
  const banco = detectarBanco(textoCompleto);
  if (!banco) {
    throw new ErrorEstado('No reconozco este documento. Por ahora leo estados de cuenta de tarjetas de Davivienda y Banco Agrícola.');
  }
  if (!/ESTADO DE CUENTA/.test(textoCompleto) || !/TARJETA|TDC|VISA|MASTERCARD/.test(textoCompleto)) {
    throw new ErrorEstado('Este documento no parece un estado de cuenta de tarjeta de crédito.');
  }

  // Los datos del resumen están en la primera página.
  const p1 = paginas[0].items;
  const fechaCorte = buscarValor(p1, /^FECHA DE CORTE/, leerFecha);
  const fechaLimite = buscarValor(p1, /^FECHA LIMITE DE PAGO/, leerFecha);
  const pagoContado = buscarValor(p1, /^PAGO DE CONTADO( \(\$\)| TDC)?$/, leerMonto);
  const pagoMinimo = buscarValor(p1, /^PAGO MINIMO( \(\$\)| TDC)?$/, leerMonto);
  const limite = buscarValor(p1, /^LIMITE DE CREDITO/, leerMonto);
  const disponible = buscarValor(p1, /^CREDITO DISPONIBLE/, leerMonto);
  const saldoTotal = buscarValor(p1, /^\(=\) ?SALDO TOTAL/, leerMonto);
  const tasa = buscarValor(p1, /^(% )?TASA DE INTERES ANUAL|^INTERES NORMAL/, leerTasa);

  const faltan = [
    !fechaCorte && 'la fecha de corte',
    !fechaLimite && 'el último día de pago',
    pagoContado === null && 'el pago de contado',
  ].filter(Boolean);
  if (faltan.length > 0) {
    throw new ErrorEstado(`No pude leer ${faltan.join(', ')} de este estado de cuenta.`);
  }

  // Banco Agrícola no imprime el saldo total con etiqueta: es lo usado del límite.
  const saldo =
    saldoTotal ?? (limite !== null && disponible !== null ? limite - disponible : pagoContado!);

  const producto = todos
    .filter((i) => /^(VISA|MASTERCARD|AMERICAN EXPRESS|AMEX)\b/.test(normalizar(i.texto)))
    .sort(ordenLectura)[0];
  const cuenta = todos.map((i) => /(?:\*{4,}|^X+\d*-)(\d{4})$/.exec(i.texto.trim())).find(Boolean);

  const movimientos: MovimientoEstado[] = [];
  for (const p of paginas) {
    const columnas = columnasMovimientos(p.items);
    if (columnas) movimientos.push(...leerMovimientos(p.items, columnas));
  }

  return {
    banco,
    producto: producto ? titulo(normalizar(producto.texto)) : 'Tarjeta de crédito',
    ultimos4: cuenta ? cuenta[1] : null,
    fechaCorte: fechaCorte!,
    fechaLimite: fechaLimite!,
    limiteCentavos: limite,
    disponibleCentavos: disponible,
    saldoCentavos: saldo,
    pagoContadoCentavos: pagoContado!,
    pagoMinimoCentavos: pagoMinimo,
    tasaAnual: tasa,
    movimientos,
    planes: paginas.flatMap((p) => leerPlanes(p.items)).filter((p) => p.saldoCentavos > 0),
    totalesCuadran: comprobarTotales(paginas, banco, movimientos),
  };
}

/** Compara la suma de los movimientos con los totales que imprime el banco. */
function comprobarTotales(paginas: Pagina[], banco: Banco, movs: MovimientoEstado[]): boolean | null {
  const items = paginas.flatMap((p) => p.items);
  let cargos: number | null = null;
  let abonos: number | null = null;
  if (banco === 'Davivienda') {
    const p1 = paginas[0].items;
    const compras = buscarValor(p1, /^\(\+\) ?CARGOS$/, leerMonto);
    const intereses = buscarValor(p1, /^\(\+\) ?INTERESES$/, leerMonto);
    abonos = buscarValor(p1, /^\(-\) ?ABONOS$/, leerMonto);
    cargos = compras !== null && intereses !== null ? compras + intereses : null;
  } else {
    const totales = montosDelRenglon(items, /^TOTAL TRANSACCIONES/);
    if (totales && totales.length >= 2) [cargos, abonos] = totales;
  }
  if (cargos === null || abonos === null) return null;
  return cargos === sumar(movs, 'cargo') && abonos === sumar(movs, 'abono');
}
