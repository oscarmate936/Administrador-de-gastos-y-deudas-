import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { aDate, aFechaTexto, diasEntre } from './fechas';

// ---------- Fechas que se repiten cada mes ----------

/** Fecha con ese día en ese mes; si el mes es más corto usa su último día. Acepta meses fuera de 0-11. */
export function fechaConDia(anio: number, mes0: number, dia: number): string {
  const ultimo = new Date(anio, mes0 + 1, 0);
  return aFechaTexto(new Date(ultimo.getFullYear(), ultimo.getMonth(), Math.min(dia, ultimo.getDate())));
}

function enMes(dia: number, fecha: string, deltaMes: number): string {
  const d = aDate(fecha);
  return fechaConDia(d.getFullYear(), d.getMonth() + deltaMes, dia);
}

/** La fecha más reciente con ese día del mes que sea igual o anterior a `fecha`. */
export function ultimoDiaHasta(dia: number, fecha: string): string {
  const esteMes = enMes(dia, fecha, 0);
  return esteMes <= fecha ? esteMes : enMes(dia, fecha, -1);
}

/** La primera fecha con ese día del mes que sea igual o posterior a `fecha`. */
export function primerDiaDesde(dia: number, fecha: string): string {
  const esteMes = enMes(dia, fecha, 0);
  return esteMes >= fecha ? esteMes : enMes(dia, fecha, 1);
}

/** La primera fecha con ese día del mes estrictamente posterior a `fecha`. */
export function primerDiaDespues(dia: number, fecha: string): string {
  const esteMes = enMes(dia, fecha, 0);
  return esteMes > fecha ? esteMes : enMes(dia, fecha, 1);
}

/** Suma meses conservando el día de `fecha` (o `diaAncla`), ajustado al largo de cada mes. */
export function sumarMeses(fecha: string, meses: number, diaAncla?: number): string {
  const d = aDate(fecha);
  return fechaConDia(d.getFullYear(), d.getMonth() + meses, diaAncla ?? d.getDate());
}

const sumar = (movs: Movimiento[]) => movs.reduce((t, m) => t + m.montoCentavos, 0);

// ---------- Tarjetas de crédito ----------

/**
 * Cuántos cortes hay entre la compra y `hastaCorte`, ambos incluidos.
 * Una compra hecha el día de corte entra en ese mismo estado de cuenta.
 * `hastaCorte` debe ser una fecha de corte.
 */
export function cortesFacturados(diaCorte: number, fechaCompra: string, hastaCorte: string): number {
  const primero = primerDiaDesde(diaCorte, fechaCompra);
  if (primero > hastaCorte) return 0;
  const a = aDate(primero);
  const b = aDate(hastaCorte);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

/** Parte de una compra que ya salió en estados de cuenta, según las cuotas facturadas. */
export function montoFacturado(montoCentavos: number, cuotas: number, cuotasFacturadas: number): number {
  if (cuotasFacturadas <= 0) return 0;
  if (cuotas <= 1 || cuotasFacturadas >= cuotas) return montoCentavos;
  // La última cuota absorbe los centavos que sobran de la división.
  return Math.floor(montoCentavos / cuotas) * cuotasFacturadas;
}

export interface EstadoTarjeta {
  /** Deuda total de la tarjeta hoy, incluidas las cuotas que aún no se facturan. */
  saldoCentavos: number;
  creditoDisponibleCentavos: number;
  /** Último corte que ya pasó (o es hoy). */
  corteAnterior: string;
  proximoCorte: string;
  /** Último día de pago del estado de cuenta de `corteAnterior`. */
  fechaLimite: string;
  /** Lo que falta pagar de ese estado de cuenta para no generar intereses. */
  pendienteCentavos: number;
  vencido: boolean;
  /** Días que faltan para `fechaLimite`; negativo si ya pasó. */
  diasParaLimite: number;
  /** Lo que saldría en el próximo estado de cuenta si no se compra ni se paga nada más. */
  proximoEstadoCentavos: number;
  /** Último día de pago de ese próximo estado de cuenta. */
  proximaFechaLimite: string;
}

export function estadoTarjeta(tarjeta: Tarjeta, movimientos: Movimiento[], hoy: string): EstadoTarjeta {
  const gastos = movimientos.filter((m) => m.tipo === 'gasto' && m.tarjetaId === tarjeta.id);
  const pagos = movimientos.filter((m) => m.tipo === 'pago' && m.tarjetaId === tarjeta.id);
  const saldoCentavos = tarjeta.saldoInicialCentavos + sumar(gastos) - sumar(pagos);
  const deuda = Math.max(0, saldoCentavos);

  const corteAnterior = ultimoDiaHasta(tarjeta.diaCorte, hoy);
  const proximoCorte = primerDiaDespues(tarjeta.diaCorte, hoy);
  const fechaLimite = primerDiaDespues(tarjeta.diaPago, corteAnterior);

  /** Lo que queda por pagar del estado de cuenta de ese corte. Solo para cortes posteriores al registro. */
  const pendienteDelCorte = (corte: string): number => {
    const facturado = gastos.reduce(
      (t, g) =>
        t + montoFacturado(g.montoCentavos, g.cuotas ?? 1, cortesFacturados(tarjeta.diaCorte, g.fecha, corte)),
      tarjeta.saldoInicialCentavos,
    );
    return Math.min(deuda, Math.max(0, facturado - sumar(pagos)));
  };

  // Si el último corte fue antes de registrar la tarjeta, la app no conoce ese
  // estado de cuenta: usa lo que la persona dijo que le faltaba pagar.
  const pendienteCentavos =
    corteAnterior <= tarjeta.fechaSaldo
      ? Math.min(deuda, Math.max(0, tarjeta.pendienteInicialCentavos - sumar(pagos)))
      : pendienteDelCorte(corteAnterior);

  return {
    saldoCentavos,
    creditoDisponibleCentavos: tarjeta.limiteCentavos - saldoCentavos,
    corteAnterior,
    proximoCorte,
    fechaLimite,
    pendienteCentavos,
    vencido: pendienteCentavos > 0 && hoy > fechaLimite,
    diasParaLimite: diasEntre(hoy, fechaLimite),
    proximoEstadoCentavos: pendienteDelCorte(proximoCorte),
    proximaFechaLimite: primerDiaDespues(tarjeta.diaPago, proximoCorte),
  };
}

// ---------- Préstamos ----------

/** Interés de un mes sobre el saldo, con tasa anual en porcentaje. */
export function interesMensual(saldoCentavos: number, tasaAnual: number): number {
  return Math.round((saldoCentavos * tasaAnual) / 1200);
}

export interface Proyeccion {
  /** Cuotas que faltan para terminar pagando la cuota normal. */
  meses: number;
  /** Intereses que se pagarían de aquí al final. */
  interesesCentavos: number;
}

/** Simula mes a mes hasta saldar. Devuelve null si la cuota no alcanza ni para los intereses. */
export function proyectar(saldoCentavos: number, tasaAnual: number, cuotaCentavos: number): Proyeccion | null {
  let saldo = saldoCentavos;
  let meses = 0;
  let interesesCentavos = 0;
  while (saldo > 0) {
    const interes = interesMensual(saldo, tasaAnual);
    if (cuotaCentavos <= interes || meses >= 1200) return null;
    saldo -= Math.min(saldo, cuotaCentavos - interes);
    interesesCentavos += interes;
    meses += 1;
  }
  return { meses, interesesCentavos };
}

/** Parte de un pago que baja el saldo: todo si es abono extra; si es cuota, lo que queda tras los intereses del mes. */
export function capitalSugerido(
  saldoCentavos: number,
  tasaAnual: number,
  montoCentavos: number,
  esExtra: boolean,
): number {
  const capital = esExtra ? montoCentavos : montoCentavos - interesMensual(saldoCentavos, tasaAnual);
  return Math.max(0, Math.min(saldoCentavos, capital));
}

export interface EstadoPrestamo {
  saldoCentavos: number;
  /** Capital abonado desde que se registró en la app. */
  abonadoCentavos: number;
  cuotasPagadas: number;
  /** Fecha de la próxima cuota sin pagar; null si ya está saldado. */
  proximaFecha: string | null;
  proximaCuotaCentavos: number;
  vencido: boolean;
  diasParaPago: number;
  /** null si está saldado o si la cuota no cubre los intereses. */
  proyeccion: Proyeccion | null;
  fechaFin: string | null;
  /** De 0 a 1: cuánto del préstamo (original, o del saldo registrado) ya está pagado. */
  avance: number;
}

export function estadoPrestamo(prestamo: Prestamo, movimientos: Movimiento[], hoy: string): EstadoPrestamo {
  const pagos = movimientos.filter((m) => m.tipo === 'pago' && m.prestamoId === prestamo.id);
  const abonadoCentavos = pagos.reduce((t, p) => t + (p.capitalCentavos ?? 0), 0);
  const saldoCentavos = Math.max(0, prestamo.saldoInicialCentavos - abonadoCentavos);
  const cuotasPagadas = pagos.filter((p) => !p.esExtra).length;
  const saldado = saldoCentavos === 0;

  const diaAncla = aDate(prestamo.primeraCuota).getDate();
  const proximaFecha = saldado ? null : sumarMeses(prestamo.primeraCuota, cuotasPagadas, diaAncla);
  const proyeccion = saldado ? null : proyectar(saldoCentavos, prestamo.tasaAnual, prestamo.cuotaCentavos);
  const base = Math.max(prestamo.montoOriginalCentavos ?? 0, prestamo.saldoInicialCentavos);

  return {
    saldoCentavos,
    abonadoCentavos,
    cuotasPagadas,
    proximaFecha,
    proximaCuotaCentavos: saldado
      ? 0
      : Math.min(prestamo.cuotaCentavos, saldoCentavos + interesMensual(saldoCentavos, prestamo.tasaAnual)),
    vencido: proximaFecha !== null && hoy > proximaFecha,
    diasParaPago: proximaFecha ? diasEntre(hoy, proximaFecha) : 0,
    proyeccion,
    fechaFin: proximaFecha && proyeccion ? sumarMeses(proximaFecha, proyeccion.meses - 1, diaAncla) : null,
    avance: base > 0 ? 1 - saldoCentavos / base : 1,
  };
}

export interface AhorroAbono {
  mesesMenos: number;
  interesesAhorradosCentavos: number;
}

/** Qué se gana con un abono extra a capital hoy, manteniendo la misma cuota. */
export function ahorroPorAbono(
  saldoCentavos: number,
  tasaAnual: number,
  cuotaCentavos: number,
  abonoCentavos: number,
): AhorroAbono | null {
  const antes = proyectar(saldoCentavos, tasaAnual, cuotaCentavos);
  const despues = proyectar(Math.max(0, saldoCentavos - abonoCentavos), tasaAnual, cuotaCentavos);
  if (!antes || !despues) return null;
  return {
    mesesMenos: antes.meses - despues.meses,
    interesesAhorradosCentavos: antes.interesesCentavos - despues.interesesCentavos,
  };
}

/** "2 años y 3 meses", "8 meses", "1 mes" */
export function textoDuracion(meses: number): string {
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes: string[] = [];
  if (anios > 0) partes.push(anios === 1 ? '1 año' : `${anios} años`);
  if (resto > 0 || anios === 0) partes.push(resto === 1 ? '1 mes' : `${resto} meses`);
  return partes.join(' y ');
}

// ---------- Próximos pagos ----------

export interface ProximoPago {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  nombre: string;
  fecha: string;
  montoCentavos: number;
  vencido: boolean;
  /** Días que faltan; negativo si ya pasó. */
  dias: number;
  /** true si el monto todavía puede cambiar (estado de cuenta que aún no corta). */
  estimado: boolean;
}

/** Lo que hay que pagar de tarjetas y préstamos, ordenado por fecha. */
export function proximosPagos(
  tarjetas: Tarjeta[],
  prestamos: Prestamo[],
  movimientos: Movimiento[],
  hoy: string,
): ProximoPago[] {
  const lista: ProximoPago[] = [];
  for (const t of tarjetas) {
    const e = estadoTarjeta(t, movimientos, hoy);
    if (e.pendienteCentavos > 0) {
      lista.push({
        tipo: 'tarjeta',
        id: t.id,
        nombre: t.nombre,
        fecha: e.fechaLimite,
        montoCentavos: e.pendienteCentavos,
        vencido: e.vencido,
        dias: e.diasParaLimite,
        estimado: false,
      });
    } else if (e.proximoEstadoCentavos > 0) {
      lista.push({
        tipo: 'tarjeta',
        id: t.id,
        nombre: t.nombre,
        fecha: e.proximaFechaLimite,
        montoCentavos: e.proximoEstadoCentavos,
        vencido: false,
        dias: diasEntre(hoy, e.proximaFechaLimite),
        estimado: true,
      });
    }
  }
  for (const p of prestamos) {
    const e = estadoPrestamo(p, movimientos, hoy);
    if (e.proximaFecha) {
      lista.push({
        tipo: 'prestamo',
        id: p.id,
        nombre: p.nombre,
        fecha: e.proximaFecha,
        montoCentavos: e.proximaCuotaCentavos,
        vencido: e.vencido,
        dias: e.diasParaPago,
        estimado: false,
      });
    }
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Suma de lo que vence dentro de los próximos `dias` días, incluido lo ya vencido. */
export function totalPorPagar(pagos: ProximoPago[], dias: number): number {
  return pagos.filter((p) => p.dias <= dias).reduce((t, p) => t + p.montoCentavos, 0);
}
