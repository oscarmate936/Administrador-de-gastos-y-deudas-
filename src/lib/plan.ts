import type { Movimiento, Prestamo, Tarjeta } from '../db';
import { estadoPrestamo, estadoTarjeta, interesMensual } from './deudas';

// Simulador del plan para salir de deudas.

export interface DeudaPlan {
  tipo: 'tarjeta' | 'prestamo';
  id: string;
  nombre: string;
  saldoCentavos: number;
  /** Anual en porcentaje; 0 si no se conoce. */
  tasaAnual: number;
  tasaConocida: boolean;
  /** Pago mínimo mensual (se mantiene fijo, como lo calculan los bancos en su aviso). */
  minimoCentavos: number;
  /** true si el mínimo es un cálculo de la app y no el del estado de cuenta. */
  minimoEstimado: boolean;
  /** Tarjeta o préstamo a abrir al tocarla (las compras a plazos abren su tarjeta). */
  abrir: { tipo: 'tarjeta' | 'prestamo'; id: string };
}

export type Metodo = 'avalancha' | 'bola';

export interface ResultadoPlan {
  /** false si el pago mensual no cubre la suma de los mínimos. */
  alcanza: boolean;
  /** Meses hasta saldar todo; null si nunca (o más de 50 años). */
  meses: number | null;
  interesesCentavos: number;
  /** Mes (1 = este mes) en que termina cada deuda, en el orden en que terminan. */
  fines: Array<{ id: string; mes: number }>;
  /** Cuánto pagar a cada deuda el primer mes. */
  primerMes: Array<{ id: string; montoCentavos: number }>;
}

const MAX_MESES = 600;

/** Mínimo estimado cuando no hay estado de cuenta: intereses del mes más 2.5% del saldo, al menos $10. */
export function minimoEstimado(saldoCentavos: number, tasaAnual: number): number {
  const estimado = interesMensual(saldoCentavos, tasaAnual) + Math.round(saldoCentavos * 0.025);
  return Math.min(saldoCentavos, Math.max(1000, estimado));
}

/** Las deudas con saldo, listas para simular. */
export function deudasParaPlan(
  datos: { tarjetas: Tarjeta[]; prestamos: Prestamo[]; movimientos: Movimiento[] },
  hoy: string,
): DeudaPlan[] {
  const lista: DeudaPlan[] = [];
  for (const t of datos.tarjetas) {
    const e = estadoTarjeta(t, datos.movimientos, hoy);
    // Cada compra a plazos o extrafinanciamiento es una deuda con su propia cuota.
    e.planes.forEach((p, i) =>
      lista.push({
        tipo: 'tarjeta',
        id: `${t.id}:plan:${i}`,
        nombre: `${t.nombre} · ${p.descripcion}`,
        saldoCentavos: p.saldoCentavos,
        tasaAnual: Math.round(p.tasaMensual * 12 * 100) / 100,
        tasaConocida: true,
        minimoCentavos: Math.min(p.saldoCentavos, p.cuotaCentavos),
        minimoEstimado: false,
        abrir: { tipo: 'tarjeta', id: t.id },
      }),
    );
    if (e.saldoCentavos <= 0) continue;
    const tasa = t.tasaAnual ?? 0;
    // El mínimo del banco incluye la cuota del extrafinanciamiento, que ya va aparte.
    const cuotasConInteres = (t.ultimoEstado?.planes ?? []).filter((p) => p.tasaMensual > 0).reduce((s, p) => s + p.cuotaCentavos, 0);
    const delEstado = t.ultimoEstado?.pagoMinimoCentavos !== undefined ? t.ultimoEstado.pagoMinimoCentavos - cuotasConInteres : undefined;
    // El mínimo de un estado de cuenta sin intereses puede ser muy bajo; los
    // siguientes los incluirán, así que nunca se toma menos que intereses + 1%.
    const piso = interesMensual(e.saldoCentavos, tasa) + Math.round(e.saldoCentavos * 0.01);
    lista.push({
      tipo: 'tarjeta',
      id: t.id,
      nombre: t.nombre,
      saldoCentavos: e.saldoCentavos,
      tasaAnual: tasa,
      tasaConocida: t.tasaAnual !== undefined,
      minimoCentavos: Math.min(e.saldoCentavos, delEstado !== undefined ? Math.max(delEstado, piso) : minimoEstimado(e.saldoCentavos, tasa)),
      minimoEstimado: delEstado === undefined,
      abrir: { tipo: 'tarjeta', id: t.id },
    });
  }
  for (const p of datos.prestamos) {
    const e = estadoPrestamo(p, datos.movimientos, hoy);
    if (e.saldoCentavos <= 0) continue;
    lista.push({
      tipo: 'prestamo',
      id: p.id,
      nombre: p.nombre,
      saldoCentavos: e.saldoCentavos,
      tasaAnual: p.tasaAnual,
      tasaConocida: p.tasaAnual > 0,
      // Sin los seguros y otros cargos: esa parte de la cuota no baja la deuda.
      minimoCentavos: Math.min(p.cuotaCentavos - e.cargosCuotaCentavos, e.saldoCentavos + interesMensual(e.saldoCentavos, p.tasaAnual)),
      minimoEstimado: false,
      abrir: { tipo: 'prestamo', id: p.id },
    });
  }
  return lista;
}

export const sumaMinimos = (deudas: DeudaPlan[]) => deudas.reduce((t, d) => t + d.minimoCentavos, 0);

/**
 * Simula mes a mes: se paga el mínimo de cada deuda, lo que sobra va a la deuda
 * prioritaria y después se cobran los intereses del mes sobre lo que queda (el
 * saldo de partida ya trae los intereses del último corte; así coincide con el
 * aviso de "si solo paga el mínimo" de los estados de cuenta). La prioridad (avalancha: la de tasa más alta;
 * bola de nieve: la de saldo más pequeño). Cuando una deuda termina, su
 * mínimo queda libre y se suma a lo extra.
 * Con `reinvertir: false` simula pagar solo el mínimo de cada una.
 */
export function simularPlan(
  deudas: DeudaPlan[],
  pagoMensualCentavos: number,
  metodo: Metodo,
  opciones: { reinvertir?: boolean } = {},
): ResultadoPlan {
  const reinvertir = opciones.reinvertir ?? true;
  const minimos = sumaMinimos(deudas);
  const alcanza = pagoMensualCentavos >= minimos;
  const saldos = new Map(deudas.map((d) => [d.id, d.saldoCentavos]));
  const fines: ResultadoPlan['fines'] = [];
  let primerMes: ResultadoPlan['primerMes'] = [];
  let intereses = 0;

  const prioridad = (a: DeudaPlan, b: DeudaPlan) =>
    metodo === 'avalancha'
      ? b.tasaAnual - a.tasaAnual || saldos.get(a.id)! - saldos.get(b.id)!
      : saldos.get(a.id)! - saldos.get(b.id)! || b.tasaAnual - a.tasaAnual;

  if (!alcanza) return { alcanza, meses: null, interesesCentavos: 0, fines, primerMes };

  for (let mes = 1; mes <= MAX_MESES; mes++) {
    const activas = deudas.filter((d) => saldos.get(d.id)! > 0);
    if (activas.length === 0) return { alcanza, meses: mes - 1, interesesCentavos: intereses, fines, primerMes };

    const pagos = new Map<string, number>();
    let disponible = reinvertir ? pagoMensualCentavos : minimos;
    for (const d of activas) {
      const pago = Math.min(d.minimoCentavos, saldos.get(d.id)!, disponible);
      pagos.set(d.id, pago);
      disponible -= pago;
    }
    if (reinvertir) {
      for (const d of [...activas].sort(prioridad)) {
        if (disponible <= 0) break;
        const resta = saldos.get(d.id)! - pagos.get(d.id)!;
        const extra = Math.min(resta, disponible);
        pagos.set(d.id, pagos.get(d.id)! + extra);
        disponible -= extra;
      }
    }
    for (const d of activas) {
      const nuevo = saldos.get(d.id)! - pagos.get(d.id)!;
      if (nuevo <= 0) {
        saldos.set(d.id, 0);
        fines.push({ id: d.id, mes });
        continue;
      }
      const interes = interesMensual(nuevo, d.tasaAnual);
      intereses += interes;
      saldos.set(d.id, nuevo + interes);
    }
    if (mes === 1) primerMes = activas.map((d) => ({ id: d.id, montoCentavos: pagos.get(d.id)! }));
  }
  return { alcanza, meses: null, interesesCentavos: intereses, fines, primerMes };
}
