import type { Movimiento, Prestamo, Tarjeta } from '../db';
import type { PlanCuotas } from './estados/tipos';
import { aDate, aFechaTexto, diasEntre, sumarDias } from './fechas';

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

/** Cortes que hubo después de `desde` hasta `hasta` (fechas de corte), por meses. */
export function cortesEntre(desde: string, hasta: string): number {
  if (hasta <= desde) return 0;
  const a = aDate(desde);
  const b = aDate(hasta);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export interface PlanProyectado extends PlanCuotas {
  /** Cuotas que faltan por cobrar. */
  restantes: number;
}

/**
 * Cómo va un plan después de `cortes` cortes desde el estado de cuenta: cada
 * corte cobra una cuota en la tarjeta. En el extrafinanciamiento la cuota
 * incluye intereses sobre lo que falta.
 */
export function proyectarPlan(p: PlanCuotas, cortes: number): { plan: PlanProyectado; cobradoCentavos: number } {
  let saldo = p.saldoCentavos;
  let restantes = Math.max(0, p.cuotasTotales - p.cuotaActual);
  let cobrado = 0;
  for (let i = 0; i < cortes && restantes > 0 && saldo > 0; i++) {
    const interes = Math.round((saldo * p.tasaMensual) / 100);
    const cuota = restantes === 1 ? saldo + interes : Math.min(p.cuotaCentavos, saldo + interes);
    saldo = Math.max(0, saldo + interes - cuota);
    cobrado += cuota;
    restantes--;
  }
  if (restantes === 0) saldo = 0;
  return {
    plan: { ...p, saldoCentavos: saldo, restantes, cuotaActual: p.cuotasTotales - restantes },
    cobradoCentavos: cobrado,
  };
}

export interface EstadoTarjeta {
  /** Saldo de la tarjeta hoy, incluidas las cuotas de compras registradas en la app. */
  saldoCentavos: number;
  /** Compras a plazos y extrafinanciamientos del estado de cuenta, proyectados a hoy. */
  planes: PlanProyectado[];
  /** Lo que falta de esos planes (aparte del saldo). */
  planesCentavos: number;
  /** Saldo más planes: todo lo que se debe por esta tarjeta. */
  deudaTotalCentavos: number;
  creditoDisponibleCentavos: number;
  /** Último corte que ya pasó (o es hoy). */
  corteAnterior: string;
  proximoCorte: string;
  /** Último día de pago del estado de cuenta de `corteAnterior`. */
  fechaLimite: string;
  /** Lo que falta pagar de ese estado de cuenta para no generar intereses. */
  pendienteCentavos: number;
  /** Lo que falta del pago mínimo; null si no se conoce (no se importó ese estado de cuenta). */
  pagoMinimoCentavos: number | null;
  /** true si las cifras del corte vienen de un estado de cuenta importado. */
  segunEstado: boolean;
  vencido: boolean;
  /** Días que faltan para `fechaLimite`; negativo si ya pasó. */
  diasParaLimite: number;
  /** Lo que saldría en el próximo estado de cuenta si no se compra ni se paga nada más. */
  proximoEstadoCentavos: number;
  /** Último día de pago de ese próximo estado de cuenta. */
  proximaFechaLimite: string;
}

export function estadoTarjeta(tarjeta: Tarjeta, movimientos: Movimiento[], hoy: string): EstadoTarjeta {
  // Lo de `fechaSaldo` y antes ya está incluido en los saldos iniciales.
  const posterior = (m: Movimiento) => m.tarjetaId === tarjeta.id && m.fecha > tarjeta.fechaSaldo;
  const gastos = movimientos.filter((m) => m.tipo === 'gasto' && posterior(m));
  const pagos = movimientos.filter((m) => m.tipo === 'pago' && posterior(m));
  const pagado = sumar(pagos);
  const ue = tarjeta.ultimoEstado;

  // Planes (compras a plazos, extrafinanciamiento) del estado de cuenta que dio
  // los saldos: cada corte posterior cobra una cuota en la tarjeta.
  const planesBase = ue && ue.fechaCorte === tarjeta.fechaSaldo ? (ue.planes ?? []) : [];
  const cobradoHasta = (corte: string) =>
    planesBase.reduce((t, p) => t + proyectarPlan(p, cortesEntre(ue!.fechaCorte, corte)).cobradoCentavos, 0);

  // Si el banco corrió el corte unos días (fin de semana, feriado), manda la
  // fecha del estado de cuenta importado.
  const corteCalculado = ultimoDiaHasta(tarjeta.diaCorte, hoy);
  const segunEstado = ue !== undefined && ue.fechaCorte <= hoy && Math.abs(diasEntre(ue.fechaCorte, corteCalculado)) <= 5;
  const corteAnterior = segunEstado ? ue.fechaCorte : corteCalculado;
  const d = aDate(corteAnterior);
  const proximoCorte = fechaConDia(d.getFullYear(), d.getMonth() + 1, tarjeta.diaCorte);
  const fechaLimite = segunEstado ? ue.fechaLimite : primerDiaDespues(tarjeta.diaPago, corteAnterior);

  const saldoCentavos = tarjeta.saldoInicialCentavos + sumar(gastos) - pagado + cobradoHasta(corteAnterior);
  const deuda = Math.max(0, saldoCentavos);
  const planes = planesBase
    .map((p) => proyectarPlan(p, cortesEntre(ue!.fechaCorte, corteAnterior)).plan)
    .filter((p) => p.saldoCentavos > 0);
  const planesCentavos = planes.reduce((t, p) => t + p.saldoCentavos, 0);

  /** Lo que queda por pagar del estado de cuenta de ese corte, si es posterior a `fechaSaldo`. */
  const pendienteDelCorte = (corte: string): number => {
    const facturado = gastos.reduce(
      (t, g) =>
        t + montoFacturado(g.montoCentavos, g.cuotas ?? 1, cortesFacturados(tarjeta.diaCorte, g.fecha, corte)),
      tarjeta.saldoInicialCentavos + cobradoHasta(corte),
    );
    // Las cuotas de planes que se cobren en ese corte todavía no están en el saldo de hoy.
    const tope = deuda + Math.max(0, cobradoHasta(corte) - cobradoHasta(corteAnterior));
    return Math.min(tope, Math.max(0, facturado - pagado));
  };

  // Si el último corte no es posterior a `fechaSaldo`, la app no armó ese estado
  // de cuenta: usa lo que se registró (a mano o desde el PDF) como pendiente.
  const corteConocido = corteAnterior <= tarjeta.fechaSaldo;
  const pendienteCentavos = corteConocido
    ? Math.min(deuda, Math.max(0, tarjeta.pendienteInicialCentavos - pagado))
    : pendienteDelCorte(corteAnterior);
  const pagoMinimoCentavos =
    corteConocido && segunEstado && ue.pagoMinimoCentavos !== undefined
      ? Math.min(pendienteCentavos, Math.max(0, ue.pagoMinimoCentavos - pagado))
      : null;

  return {
    saldoCentavos,
    planes,
    planesCentavos,
    deudaTotalCentavos: deuda + planesCentavos,
    // Si los saldos vienen del estado de cuenta, parte del disponible que dio el banco.
    creditoDisponibleCentavos:
      ue?.disponibleCentavos !== undefined && ue.fechaCorte === tarjeta.fechaSaldo
        ? ue.disponibleCentavos - (saldoCentavos - tarjeta.saldoInicialCentavos)
        : tarjeta.limiteCentavos - saldoCentavos,
    corteAnterior,
    proximoCorte,
    fechaLimite,
    pendienteCentavos,
    pagoMinimoCentavos,
    segunEstado: segunEstado && corteConocido,
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

/**
 * Interés de `dias` días sobre el saldo (año de 365 días), como lo cobran los
 * bancos: por los días que pasan desde el último pago.
 */
export function interesPorDias(saldoCentavos: number, tasaAnual: number, dias: number): number {
  return Math.round((saldoCentavos * tasaAnual * Math.max(0, dias)) / 36500);
}

/** Qué parte del saldo se cobra cada mes en seguros y otros cargos (0 si no hay). */
export function factorCargos(p: Pick<Prestamo, 'cargosCentavos' | 'cargosBaseCentavos' | 'saldoInicialCentavos'>): number {
  const base = p.cargosBaseCentavos ?? p.saldoInicialCentavos;
  return p.cargosCentavos && base > 0 ? p.cargosCentavos / base : 0;
}

/** Seguros y otros cargos de una cuota con ese saldo: bajan junto con el saldo. */
export const cargosConSaldo = (saldoCentavos: number, factor: number) => Math.round(saldoCentavos * factor);

export interface Proyeccion {
  /** Cuotas que faltan para terminar pagando la cuota normal. */
  meses: number;
  /** Intereses que se pagarían de aquí al final. */
  interesesCentavos: number;
}

/** Fechas de las cuotas, para contar el interés por días. */
export interface Periodos {
  /** Desde cuándo corre el interés de la primera cuota (último pago). */
  desde: string;
  /** Fecha de la primera cuota que falta. */
  primera: string;
  /** Día del mes en que caen las cuotas. */
  ancla: number;
}

/**
 * Simula cuota por cuota hasta saldar. `factor` es la parte del saldo que se
 * va cada mes en seguros y otros cargos (no baja el saldo). Con `periodos`, el
 * interés se cuenta por los días de cada período; sin ellos, por meses.
 * Devuelve null si la cuota no alcanza ni para los intereses.
 */
export function proyectar(
  saldoCentavos: number,
  tasaAnual: number,
  cuotaTotalCentavos: number,
  factor = 0,
  periodos?: Periodos,
): Proyeccion | null {
  let saldo = saldoCentavos;
  let meses = 0;
  let interesesCentavos = 0;
  let desde = periodos?.desde;
  while (saldo > 0) {
    let interes: number;
    if (periodos && desde) {
      const hasta = sumarMeses(periodos.primera, meses, periodos.ancla);
      interes = interesPorDias(saldo, tasaAnual, diasEntre(desde, hasta));
      desde = hasta;
    } else {
      interes = interesMensual(saldo, tasaAnual);
    }
    const capital = cuotaTotalCentavos - interes - cargosConSaldo(saldo, factor);
    if (capital <= 0 || meses >= 1200) return null;
    saldo -= Math.min(saldo, capital);
    interesesCentavos += interes;
    meses += 1;
  }
  return { meses, interesesCentavos };
}

/**
 * Parte de un pago que baja el saldo: todo si es abono extra; si es cuota, lo
 * que queda tras los intereses y los seguros. Con `dias`, el interés es el de
 * esos días desde el último pago; sin ellos, el de un mes.
 */
export function capitalSugerido(
  saldoCentavos: number,
  tasaAnual: number,
  montoCentavos: number,
  esExtra: boolean,
  factor = 0,
  dias?: number,
): number {
  const interes = dias === undefined ? interesMensual(saldoCentavos, tasaAnual) : interesPorDias(saldoCentavos, tasaAnual, dias);
  const capital = esExtra ? montoCentavos : montoCentavos - interes - cargosConSaldo(saldoCentavos, factor);
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
  /** Desde cuándo corre el interés de la próxima cuota (último pago de cuota). */
  inicioPeriodo: string | null;
  /** Seguros y otros cargos de la próxima cuota (bajan con el saldo). */
  cargosCuotaCentavos: number;
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
  const cuotas = pagos.filter((p) => !p.esExtra);
  const cuotasPagadas = cuotas.length;
  const saldado = saldoCentavos === 0;

  const diaAncla = aDate(prestamo.primeraCuota).getDate();
  const proximaFecha = saldado ? null : sumarMeses(prestamo.primeraCuota, cuotasPagadas, diaAncla);
  // El interés corre desde el último pago de cuota (los abonos extra van todos a capital).
  const ultimoPago = cuotas.reduce<string | null>((u, m) => (u === null || m.fecha > u ? m.fecha : u), null);
  const inicioPeriodo = proximaFecha
    ? (ultimoPago ?? prestamo.inicioPeriodo ?? sumarMeses(proximaFecha, -1, diaAncla))
    : null;
  const factor = factorCargos(prestamo);
  const periodos = proximaFecha && inicioPeriodo ? { desde: inicioPeriodo, primera: proximaFecha, ancla: diaAncla } : undefined;
  const proyeccion = saldado ? null : proyectar(saldoCentavos, prestamo.tasaAnual, prestamo.cuotaCentavos, factor, periodos);
  const base = Math.max(prestamo.montoOriginalCentavos ?? 0, prestamo.saldoInicialCentavos);
  const cargosCuotaCentavos = saldado ? 0 : cargosConSaldo(saldoCentavos, factor);
  const interesCuota =
    proximaFecha && inicioPeriodo ? interesPorDias(saldoCentavos, prestamo.tasaAnual, diasEntre(inicioPeriodo, proximaFecha)) : 0;

  return {
    saldoCentavos,
    abonadoCentavos,
    cuotasPagadas,
    proximaFecha,
    proximaCuotaCentavos: saldado ? 0 : Math.min(prestamo.cuotaCentavos, saldoCentavos + interesCuota + cargosCuotaCentavos),
    inicioPeriodo,
    cargosCuotaCentavos,
    vencido: proximaFecha !== null && hoy > proximaFecha,
    diasParaPago: proximaFecha ? diasEntre(hoy, proximaFecha) : 0,
    proyeccion,
    fechaFin: proximaFecha && proyeccion ? sumarMeses(proximaFecha, proyeccion.meses - 1, diaAncla) : null,
    avance: base > 0 ? 1 - saldoCentavos / base : 1,
  };
}

/**
 * Desde cuándo corre el interés de una cuota según el desglose del banco: el
 * interés de la cuota (lo que no es capital ni cargos) dice cuántos días cobra.
 * undefined si los datos no cuadran con un período razonable (20 a 75 días).
 */
export function inicioSegunDesglose(d: {
  saldoCentavos: number;
  tasaAnual: number;
  cuotaCentavos: number;
  cargosCentavos: number;
  capitalCentavos: number;
  fecha: string;
}): string | undefined {
  const interes = d.cuotaCentavos - d.capitalCentavos - d.cargosCentavos;
  if (interes <= 0 || d.saldoCentavos <= 0 || d.tasaAnual <= 0) return undefined;
  const dias = Math.round((interes * 36500) / (d.saldoCentavos * d.tasaAnual));
  return dias >= 20 && dias <= 75 ? sumarDias(d.fecha, -dias) : undefined;
}

/** Fechas de cuotas del préstamo para proyectar con interés por días. */
export function periodosDe(p: Prestamo, e: EstadoPrestamo): Periodos | undefined {
  return e.proximaFecha && e.inicioPeriodo ? { desde: e.inicioPeriodo, primera: e.proximaFecha, ancla: aDate(p.primeraCuota).getDate() } : undefined;
}

/** Qué se gana con un abono extra hoy a este préstamo. */
export function ahorroDelAbono(p: Prestamo, e: EstadoPrestamo, abonoCentavos: number): AhorroAbono | null {
  return ahorroPorAbono(e.saldoCentavos, p.tasaAnual, p.cuotaCentavos, Math.min(abonoCentavos, e.saldoCentavos), factorCargos(p), periodosDe(p, e));
}

/**
 * Capital de la cuota normal pagada en `fechaPago`. Si el banco dio el desglose
 * de esa cuota (captura) y se paga completa, su capital es exacto.
 */
export function capitalDeCuota(p: Prestamo, e: EstadoPrestamo, montoCentavos: number, fechaPago: string): number {
  if (p.desgloseCuota && e.proximaFecha === p.desgloseCuota.fecha && montoCentavos === p.cuotaCentavos) {
    return Math.min(e.saldoCentavos, p.desgloseCuota.capitalCentavos);
  }
  return capitalDelPago(p, e, montoCentavos, false, fechaPago);
}

/**
 * Capital de un pago a un préstamo hecho en `fechaPago`: el interés es el de
 * los días desde el último pago de cuota hasta ese día.
 */
export function capitalDelPago(p: Prestamo, e: EstadoPrestamo, montoCentavos: number, esExtra: boolean, fechaPago: string): number {
  const dias = e.inicioPeriodo ? diasEntre(e.inicioPeriodo, fechaPago) : undefined;
  return capitalSugerido(e.saldoCentavos, p.tasaAnual, montoCentavos, esExtra, factorCargos(p), dias);
}

/**
 * Ajusta un préstamo a lo que dice el banco hoy (saldo, cuota, tasa y fecha de
 * la próxima cuota) sin borrar los pagos ya registrados: el saldo inicial y la
 * fecha de la primera cuota se recalculan para que, con esos pagos, el saldo y
 * la próxima cuota queden como los del banco.
 */
export function ajustarPrestamo(
  p: Prestamo,
  movimientos: Movimiento[],
  hoy: string,
  banco: {
    saldoCentavos: number;
    cuotaCentavos?: number;
    tasaAnual?: number;
    proximaFecha?: string;
    montoOriginalCentavos?: number;
    cargosCentavos?: number;
    desgloseCuota?: { fecha: string; capitalCentavos: number };
    /** Último pago hecho al banco, si se conoce. */
    inicioPeriodo?: string;
  },
): Prestamo {
  const e = estadoPrestamo(p, movimientos, hoy);
  const ancla = banco.proximaFecha ? aDate(banco.proximaFecha).getDate() : undefined;
  return {
    ...p,
    saldoInicialCentavos: banco.saldoCentavos + e.abonadoCentavos,
    cuotaCentavos: banco.cuotaCentavos ?? p.cuotaCentavos,
    tasaAnual: banco.tasaAnual ?? p.tasaAnual,
    primeraCuota: banco.proximaFecha ? sumarMeses(banco.proximaFecha, -e.cuotasPagadas, ancla) : p.primeraCuota,
    montoOriginalCentavos: banco.montoOriginalCentavos ?? p.montoOriginalCentavos,
    cargosCentavos: banco.cargosCentavos ?? p.cargosCentavos,
    // Los cargos se midieron con el saldo que da el banco hoy.
    cargosBaseCentavos: banco.cargosCentavos !== undefined ? banco.saldoCentavos : p.cargosBaseCentavos,
    inicioPeriodo: banco.inicioPeriodo ?? p.inicioPeriodo,
    desgloseCuota: banco.desgloseCuota,
    actualizadoEn: hoy,
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
  factor = 0,
  periodos?: Periodos,
): AhorroAbono | null {
  const antes = proyectar(saldoCentavos, tasaAnual, cuotaCentavos, factor, periodos);
  const despues = proyectar(Math.max(0, saldoCentavos - abonoCentavos), tasaAnual, cuotaCentavos, factor, periodos);
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
