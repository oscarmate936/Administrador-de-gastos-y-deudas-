import type { Movimiento, Prestamo, Tarjeta } from '../db';
import type { AjustesSueldo } from './ajustes';
import { fechaConDia, primerDiaDespues, proximosPagos, ultimoDiaHasta, type ProximoPago } from './deudas';
import { aDate, diasEntre, sumarDias } from './fechas';
import { calcularDisponible, esPagoDeDeuda } from './resumen';

// Tu sueldo y en qué se va: de cada sueldo se apartan las deudas que vencen
// antes del siguiente y el bono de comida; lo que queda es para lo demás.

/** Días de pago en el mes según cada cuánto te pagan. */
export function diasDePago(s: Pick<AjustesSueldo, 'frecuencia' | 'dia'>, diaSugerido?: number): number[] {
  const elegido = s.dia ?? diaSugerido ?? (s.frecuencia === 'quincenal' ? 15 : 30);
  const dia = Math.min(31, Math.max(1, Math.round(elegido) || 30));
  if (s.frecuencia !== 'quincenal') return [dia];
  // Quincenal: dos días separados por 15 (por ejemplo, 15 y 30).
  const primero = dia > 15 ? dia - 15 : dia;
  return [primero, primero + 15];
}

export interface Periodo {
  /** Desde el sueldo que se está usando (o el día en que tocaba). */
  desde: string;
  /** El día del próximo sueldo (no incluido en el periodo). */
  hasta: string;
  /** El sueldo registrado en este periodo; undefined si todavía no se registra. */
  sueldo?: Movimiento;
}

/** Un sueldo se acepta como del periodo aunque llegue hasta una semana antes. */
const DIAS_DE_ADELANTO = 7;

/** El periodo de sueldo en que cae `hoy`: del último sueldo al siguiente. */
export function periodoDelSueldo(movimientos: Movimiento[], hoy: string, s: Pick<AjustesSueldo, 'frecuencia' | 'dia'>): Periodo {
  const sueldos = movimientos.filter((m) => m.tipo === 'ingreso' && m.esPago && m.fecha <= hoy);
  const ultimo = sueldos.reduce<Movimiento | undefined>(
    (a, m) => (!a || m.fecha > a.fecha || (m.fecha === a.fecha && m.creadoEn > a.creadoEn) ? m : a),
    undefined,
  );
  const dias = diasDePago(s, ultimo ? aDate(ultimo.fecha).getDate() : undefined);
  const anterior = (f: string) => dias.map((d) => ultimoDiaHasta(d, f)).reduce((a, b) => (a > b ? a : b));
  const siguiente = (f: string) => dias.map((d) => primerDiaDespues(d, f)).reduce((a, b) => (a < b ? a : b));

  const tocaba = anterior(hoy);
  const conSueldo = ultimo && ultimo.fecha >= sumarDias(tocaba, -DIAS_DE_ADELANTO);
  const desde = conSueldo ? ultimo.fecha : tocaba;
  // Si el sueldo llegó unos días antes de la fecha, el siguiente es el de la fecha que sigue a esa.
  const hasta = siguiente(desde > tocaba ? sumarDias(desde, DIAS_DE_ADELANTO) : hoy);
  return { desde, hasta, sueldo: conSueldo ? ultimo : undefined };
}

export interface PlanSueldo {
  periodo: Periodo;
  /** Ingresos registrados en el periodo (sueldo y otros). */
  ingresosCentavos: number;
  /**
   * Lo que tenías antes del periodo (con la corrección de «¿Cuánto dinero tienes
   * hoy?»); negativo si habías anotado más gastos que ingresos.
   */
  teniasCentavos: number;
  deudas: {
    /** Pagado a tarjetas y préstamos en el periodo. */
    pagadoCentavos: number;
    /** Lo que falta pagar antes del próximo sueldo (o ya vencido). */
    faltaCentavos: number;
    pendientes: ProximoPago[];
  };
  /** null si no hay bono de comida. */
  comida: {
    presupuestoCentavos: number;
    gastadoCentavos: number;
    /** De lo gastado, lo que fue con tarjeta de crédito (se paga después, con la tarjeta). */
    conTarjetaCentavos: number;
    quedaCentavos: number;
    /**
     * Lo que se aparta de tu dinero: lo que queda del bono más lo que pagaste con
     * tarjeta (ese dinero se usará al pagar la tarjeta).
     */
    apartadoCentavos: number;
  } | null;
  /** Gastos en efectivo o débito del periodo que no son comida (los de comida van en su apartado). */
  otrosCentavos: number;
  /** El dinero que tienes hoy. */
  disponibleCentavos: number;
  fondoCentavos: number;
  /** Lo que queda para lo demás: disponible menos lo que falta de deudas, lo apartado de comida y el fondo. */
  libreCentavos: number;
  /** Días que faltan para el próximo sueldo (al menos 1). */
  diasRestantes: number;
  /** Lo libre repartido en esos días; null si no queda nada. */
  porDiaCentavos: number | null;
}

/** Bono de comida que toca en cada periodo: el mensual, o la mitad si te pagan por quincena. */
export const comidaDelPeriodo = (s: AjustesSueldo) =>
  s.frecuencia === 'quincenal' ? Math.round(s.comidaCentavos / 2) : s.comidaCentavos;

/** Lo que hace falta de los ajustes para calcular lo que te queda. */
export interface OpcionesSueldo {
  sueldo: AjustesSueldo;
  /** Lo apartado en el fondo de emergencia. */
  fondoCentavos?: number;
  /** Corrección de «¿Cuánto dinero tienes hoy?». */
  ajusteSaldoCentavos?: number;
}

export function planDelSueldo(
  datos: { movimientos: Movimiento[]; tarjetas: Tarjeta[]; prestamos: Prestamo[] },
  hoy: string,
  opciones: OpcionesSueldo,
): PlanSueldo {
  const { sueldo: s } = opciones;
  const periodo = periodoDelSueldo(datos.movimientos, hoy, s);
  const enPeriodo = datos.movimientos.filter((m) => m.fecha >= periodo.desde && m.fecha <= hoy);
  const suma = (movs: Movimiento[]) => movs.reduce((t, m) => t + m.montoCentavos, 0);

  // Deudas: lo que vence antes del próximo sueldo (y lo vencido), según cómo pagas cada tarjeta.
  const pendientes = proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy).filter(
    (p) => p.fecha < periodo.hasta && p.montoCentavos > 0,
  );
  const faltaCentavos = pendientes.reduce((t, p) => t + p.montoCentavos, 0);

  // Comida: todos los gastos de esas categorías, con o sin tarjeta, salen del bono.
  const deComida = new Set(s.categoriasComida);
  const esComida = (m: Movimiento) => m.tipo === 'gasto' && m.categoriaId !== undefined && deComida.has(m.categoriaId);
  const presupuesto = comidaDelPeriodo(s);
  const gastadoComida = suma(enPeriodo.filter(esComida));
  const comidaConTarjeta = suma(enPeriodo.filter((m) => esComida(m) && m.tarjetaId !== undefined));
  const comida =
    presupuesto > 0
      ? {
          presupuestoCentavos: presupuesto,
          gastadoCentavos: gastadoComida,
          conTarjetaCentavos: comidaConTarjeta,
          quedaCentavos: Math.max(0, presupuesto - gastadoComida),
          apartadoCentavos: Math.max(presupuesto, gastadoComida) - (gastadoComida - comidaConTarjeta),
        }
      : null;

  const disponible = calcularDisponible(datos.movimientos) + (opciones.ajusteSaldoCentavos ?? 0);
  const ingresos = suma(enPeriodo.filter((m) => m.tipo === 'ingreso'));
  // Lo que salió de tu dinero en el periodo: pagos de deudas y gastos en efectivo o débito.
  const salidas = suma(enPeriodo.filter((m) => esPagoDeDeuda(m) || (m.tipo === 'gasto' && m.tarjetaId === undefined)));
  const fondo = Math.max(0, opciones.fondoCentavos ?? 0);
  const libre = disponible - faltaCentavos - (comida?.apartadoCentavos ?? 0) - fondo;
  const diasRestantes = Math.max(1, diasEntre(hoy, periodo.hasta));
  return {
    periodo,
    ingresosCentavos: ingresos,
    teniasCentavos: disponible - ingresos + salidas,
    deudas: { pagadoCentavos: suma(enPeriodo.filter(esPagoDeDeuda)), faltaCentavos, pendientes },
    comida,
    otrosCentavos: suma(enPeriodo.filter((m) => m.tipo === 'gasto' && m.tarjetaId === undefined && (!comida || !esComida(m)))),
    disponibleCentavos: disponible,
    fondoCentavos: fondo,
    libreCentavos: libre,
    diasRestantes,
    porDiaCentavos: libre > 0 ? Math.floor(libre / diasRestantes) : null,
  };
}

/** Nombre del mes del periodo: el del sueldo (un sueldo del 30 de noviembre es «de noviembre»). */
export function mesDelPeriodo(p: Periodo): string {
  const d = aDate(p.desde);
  return fechaConDia(d.getFullYear(), d.getMonth(), 1).slice(0, 7);
}
