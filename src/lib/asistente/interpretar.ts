import type { Datos, Detalle } from '../../datos';
import type { Prestamo, Tarjeta } from '../../db';
import { costosEntre } from '../costos';
import { estadoPrestamo, estadoTarjeta, proximosPagos, sumarMeses, textoDuracion, totalPorPagar } from '../deudas';
import { formatearDinero } from '../dinero';
import { sugerirCategoria } from '../estados/categorias';
import { fechaCorta, mesCorto, textoFaltan } from '../fechas';
import { calcularDisponible } from '../resumen';
import { extraerFecha, extraerMonto, extraerPeriodo, normal } from './textos';

// Asistente sin IA: entiende frases comunes para registrar movimientos y
// responde preguntas con los datos de la app. Todo con reglas, en el teléfono.

export type Intencion =
  | { tipo: 'gasto'; montoCentavos?: number; categoriaId?: string; tarjetaId?: string; fecha: string; nota: string }
  | { tipo: 'ingreso'; montoCentavos?: number; esPago: boolean; fecha: string; nota: string }
  | { tipo: 'pagoTarjeta'; tarjetaId: string; montoCentavos?: number; fecha: string }
  | { tipo: 'pagoPrestamo'; prestamoId: string; montoCentavos?: number; extra: boolean; fecha: string }
  | { tipo: 'respuesta'; titulo: string; lineas: string[]; destino?: Detalle | 'movimientos' }
  | { tipo: 'noEntendi' };

const PALABRAS_COMUNES = new Set(['TARJETA', 'CREDITO', 'CLASICA', 'CLASICO', 'DE', 'LA', 'EL', 'MI', 'BANCO', 'PRESTAMO', 'PERSONAL', 'GOLD', 'ORO']);

const CATEGORIAS: Array<[RegExp, string]> = [
  [/\b(ALMUERZO|DESAYUNO|CENA|COMIDA|PUPUSAS?|RESTAURANTE|POLLO|PIZZA|CAFE|HAMBURGUESA|ANTOJO|REFRESCO|SODA)\b/, 'comida'],
  [/\b(SUPER|SUPERMERCADO|DESPENSA|MERCADO|SELECTOS|WALMART|COMPRAS DE LA SEMANA)\b/, 'super'],
  [/\b(BUS|UBER|GASOLINA|TAXI|PASAJES?|PARQUEO|TRANSPORTE|INDRIVE|COMBUSTIBLE|DIESEL)\b/, 'transporte'],
  [/\b(ALQUILER|RENTA|MUEBLES?|LIMPIEZA|FERRETERIA)\b/, 'casa'],
  [/\b(LUZ|AGUA|INTERNET|TELEFONO|CELULAR|RECARGA|CABLE|SERVICIOS?)\b/, 'servicios'],
  [/\b(FARMACIA|MEDICINAS?|MEDICAMENTOS?|DOCTOR|CONSULTA|HOSPITAL|MEDICO|DENTISTA|SALUD)\b/, 'salud'],
  [/\b(CINE|NETFLIX|SPOTIFY|SALIDA|FIESTA|JUEGOS?|OCIO|CERVEZAS?|CONCIERTO)\b/, 'ocio'],
  [/\b(INTERES(ES)?|COMISION(ES)?|MEMBRESIA|RECARGO)\b/, 'intereses'],
];

function palabrasDe(nombre: string): string[] {
  return normal(nombre)
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length >= 3 && !PALABRAS_COMUNES.has(p));
}

/** La deuda nombrada en la frase, si hay una sola que coincida mejor que las demás. */
function buscarDeuda<T extends Tarjeta | Prestamo>(t: string, deudas: T[]): { deuda: T; indice: number } | null {
  const puntos = deudas.map((d) => {
    const extra = 'banco' in d ? [d.banco, d.ultimos4 ?? ''] : [d.acreedor];
    const palabras = [...palabrasDe(d.nombre), ...extra.flatMap((x) => palabrasDe(x))];
    let indice = -1;
    let n = 0;
    for (const p of palabras) {
      const i = t.search(new RegExp(`\\b${p}\\b`));
      if (i >= 0) {
        n++;
        if (indice < 0 || i < indice) indice = i;
      }
    }
    return { deuda: d, n, indice };
  });
  const mejor = Math.max(0, ...puntos.map((p) => p.n));
  const ganadores = puntos.filter((p) => p.n === mejor && mejor > 0);
  return ganadores.length === 1 ? { deuda: ganadores[0].deuda, indice: ganadores[0].indice } : null;
}

function buscarCategoria(t: string, datos: Datos): string | undefined {
  const propia = datos.categorias.find((c) => {
    const n = normal(c.nombre);
    return n.length >= 3 && new RegExp(`\\b${n}\\b`).test(t);
  });
  if (propia) return propia.id;
  const regla = CATEGORIAS.find(([re]) => re.test(t))?.[1] ?? sugerirCategoria(t);
  return regla && datos.mapaCategorias.has(regla) ? regla : undefined;
}

/** "gasté 12 en almuerzo con la visa" -> "almuerzo". */
function notaDe(original: string): string {
  const m = /\b(?:en|de|para)\s+(?:el|la|los|las|un|una|mi)?\s*([a-záéíóúñü][\wáéíóúñü\s]{1,40}?)(?=\s+(?:con|el|ayer|hoy|anteayer|antier|por|en efectivo|del?)\b|[.,!?]|$)/i.exec(
    original.replace(/\$?\s?\d[\d.,]*\s*(d[oó]lares?|usd)?/gi, ' '),
  );
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}

const ES_PREGUNTA = /^(CUANTO|CUANTA|CUANDO|QUE|CUAL|CUALES|COMO|DIME|MUESTRAME|ME FALTA|TENGO QUE|DEBO)\b/;

export function interpretar(original: string, datos: Datos, hoy: string): Intencion {
  const texto = original.trim();
  if (!texto) return { tipo: 'noEntendi' };
  const t = normal(texto).replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim();
  const esPregunta = /[?¿]/.test(texto) || ES_PREGUNTA.test(t);

  if (esPregunta) return responder(t, datos, hoy);

  const fecha = extraerFecha(t, hoy);
  const sinFecha = fecha ? fecha.resto : t;
  const monto = extraerMonto(sinFecha);
  const montoCentavos = monto?.valor;
  const dia = fecha?.valor ?? hoy;
  const nota = notaDe(texto);

  // Ingresos
  if (/\b(ME PAGARON|ME DEPOSITARON|RECIBI|COBRE|INGRESO|SUELDO|SALARIO|QUINCENA|ME DIERON|ME REGALARON|GANE|VENDI|ME CAYO)\b/.test(t)) {
    const esPago = /\b(ME PAGARON|SUELDO|SALARIO|QUINCENA|MI PAGO|ME DEPOSITARON)\b/.test(t);
    return { tipo: 'ingreso', montoCentavos, esPago, fecha: dia, nota: esPago ? nota : nota || 'Otro ingreso' };
  }

  const tarjeta = buscarDeuda(t, datos.tarjetas);
  const prestamo = buscarDeuda(t, datos.prestamos);
  const verboPago = /\b(PAGUE|ABONE|ABONO|PAGO|DEPOSITE|CANCELE)\b/.test(t);

  // Pago de un préstamo
  if (verboPago && (prestamo || /\b(PRESTAMO|CUOTA)\b/.test(t)) && !/\bCON\b/.test(t.slice(0, prestamo?.indice ?? 0))) {
    const p = prestamo?.deuda ?? (datos.prestamos.length === 1 ? datos.prestamos[0] : undefined);
    if (p) return { tipo: 'pagoPrestamo', prestamoId: p.id, montoCentavos, extra: /\b(EXTRA|ADELANTO|ABONO A CAPITAL)\b/.test(t), fecha: dia };
  }

  // Pago a una tarjeta: "pagué 100 a la visa" (con "con la visa" es una compra con tarjeta)
  if (verboPago && tarjeta) {
    const antes = t.slice(0, tarjeta.indice);
    if (!/\bCON (LA |MI |EL )?(TARJETA )?$/.test(antes)) {
      const conCategoria = buscarCategoria(sinFecha, datos);
      if (!conCategoria) return { tipo: 'pagoTarjeta', tarjetaId: tarjeta.deuda.id, montoCentavos, fecha: dia };
    }
  }

  // Gastos
  const verboGasto = /\b(GASTE|COMPRE|PAGUE|ME COBRARON|CONSUMI|GASTO|COSTO|SALIO|ECHE)\b/.test(t);
  const categoriaId = buscarCategoria(sinFecha, datos);
  if (verboGasto || (montoCentavos && (categoriaId || tarjeta))) {
    let tarjetaId: string | undefined;
    if (/\b(EFECTIVO|DEBITO|CASH)\b/.test(t)) tarjetaId = undefined;
    else if (tarjeta) tarjetaId = tarjeta.deuda.id;
    else if (/\bCON (LA )?TARJETA\b/.test(t) && datos.tarjetas.length === 1) tarjetaId = datos.tarjetas[0].id;
    return { tipo: 'gasto', montoCentavos, categoriaId, tarjetaId, fecha: dia, nota };
  }

  return { tipo: 'noEntendi' };
}

// ---------- Preguntas ----------

function responder(t: string, datos: Datos, hoy: string): Intencion {
  // "la tarjeta" o "el préstamo" sin nombre se refiere a la única que haya.
  const tarjeta =
    buscarDeuda(t, datos.tarjetas)?.deuda ?? (/\bTARJETA\b/.test(t) && datos.tarjetas.length === 1 ? datos.tarjetas[0] : undefined);
  const prestamo =
    buscarDeuda(t, datos.prestamos)?.deuda ?? (/\bPRESTAMO\b/.test(t) && datos.prestamos.length === 1 ? datos.prestamos[0] : undefined);

  // ¿Cuánto me queda / tengo disponible / puedo gastar?
  if (/\b(DISPONIBLE|ME QUEDA|TENGO|PUEDO GASTAR|SALDO A FAVOR)\b/.test(t) && !/\b(QUE PAGAR|DEBO|DEUDA|TENGO QUE)\b/.test(t)) {
    const disponible = calcularDisponible(datos.movimientos);
    const proximos = proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy);
    const apartar = totalPorPagar(proximos, 15);
    return {
      tipo: 'respuesta',
      titulo: `Tienes ${formatearDinero(disponible)} disponibles`,
      lineas:
        apartar > 0
          ? [`Pagos en los próximos 15 días: ${formatearDinero(apartar)}.`, `Libre después de pagarlos: ${formatearDinero(disponible - apartar)}.`]
          : ['No tienes pagos en los próximos 15 días.'],
    };
  }

  // ¿Cuándo pago...? ¿Qué tengo que pagar? Próximos pagos / corte
  if (/\b(CUANDO|QUE TENGO QUE PAGAR|PROXIMOS? PAGOS?|QUE PAGOS|VENCE|FECHA)\b/.test(t) || /\bCORTE\b/.test(t)) {
    if (tarjeta) {
      const e = estadoTarjeta(tarjeta, datos.movimientos, hoy);
      const lineas = [
        e.pendienteCentavos > 0
          ? `Pago de contado: ${formatearDinero(e.pendienteCentavos)} antes del ${fechaCorta(e.fechaLimite)} (${textoFaltan(e.diasParaLimite)}).`
          : `El último estado de cuenta ya está pagado.`,
      ];
      if (e.pagoMinimoCentavos) lineas.push(`Pago mínimo: ${formatearDinero(e.pagoMinimoCentavos)}.`);
      lineas.push(`Próximo corte: ${fechaCorta(e.proximoCorte)}. Lo que compres después se paga hasta el ${fechaCorta(e.proximaFechaLimite)}.`);
      return { tipo: 'respuesta', titulo: tarjeta.nombre, lineas, destino: { tipo: 'tarjeta', id: tarjeta.id } };
    }
    if (prestamo) {
      const e = estadoPrestamo(prestamo, datos.movimientos, hoy);
      return {
        tipo: 'respuesta',
        titulo: prestamo.nombre,
        lineas: e.proximaFecha
          ? [`Próxima cuota: ${formatearDinero(e.proximaCuotaCentavos)} el ${fechaCorta(e.proximaFecha)} (${textoFaltan(e.diasParaPago)}).`]
          : ['Este préstamo ya está pagado.'],
        destino: { tipo: 'prestamo', id: prestamo.id },
      };
    }
    const proximos = proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy).slice(0, 5);
    return {
      tipo: 'respuesta',
      titulo: proximos.length > 0 ? 'Tus próximos pagos' : 'No tienes pagos pendientes',
      lineas: proximos.map(
        (p) => `${p.nombre}: ${formatearDinero(p.montoCentavos)} el ${fechaCorta(p.fecha)} (${textoFaltan(p.dias)})${p.estimado ? ', estimado' : ''}.`,
      ),
    };
  }

  // ¿Cuánto me falta del préstamo? ¿Cuándo termino?
  if (/\b(FALTA|TERMINO|TERMINAR|ACABO|ACABAR)\b/.test(t) && (prestamo || datos.prestamos.length > 0)) {
    const lista = prestamo ? [prestamo] : datos.prestamos;
    return {
      tipo: 'respuesta',
      titulo: prestamo ? prestamo.nombre : 'Tus préstamos',
      lineas: lista.map((p) => {
        const e = estadoPrestamo(p, datos.movimientos, hoy);
        if (!e.proximaFecha) return `${p.nombre}: ya está pagado.`;
        const tiempo = e.proyeccion ? `${textoDuracion(e.proyeccion.meses)}, terminas en ${mesCorto(e.fechaFin ?? sumarMeses(hoy, e.proyeccion.meses))}` : 'la cuota no cubre los intereses';
        return `${p.nombre}: debes ${formatearDinero(e.saldoCentavos)}; te faltan ${tiempo}.`;
      }),
      destino: prestamo ? { tipo: 'prestamo', id: prestamo.id } : undefined,
    };
  }

  // ¿Cuánto debo?
  if (/\b(DEBO|DEUDA|DEUDAS|SALDO)\b/.test(t)) {
    if (tarjeta) {
      const e = estadoTarjeta(tarjeta, datos.movimientos, hoy);
      return {
        tipo: 'respuesta',
        titulo: `Debes ${formatearDinero(Math.max(0, e.saldoCentavos))} en ${tarjeta.nombre}`,
        lineas: [`Crédito disponible: ${formatearDinero(e.creditoDisponibleCentavos)}.`],
        destino: { tipo: 'tarjeta', id: tarjeta.id },
      };
    }
    if (prestamo) {
      const e = estadoPrestamo(prestamo, datos.movimientos, hoy);
      return { tipo: 'respuesta', titulo: `Debes ${formatearDinero(e.saldoCentavos)} de ${prestamo.nombre}`, lineas: [], destino: { tipo: 'prestamo', id: prestamo.id } };
    }
    const partes = [
      ...datos.tarjetas.map((x) => ({ nombre: x.nombre, saldo: Math.max(0, estadoTarjeta(x, datos.movimientos, hoy).saldoCentavos) })),
      ...datos.prestamos.map((x) => ({ nombre: x.nombre, saldo: estadoPrestamo(x, datos.movimientos, hoy).saldoCentavos })),
    ].filter((p) => p.saldo > 0);
    const total = partes.reduce((s, p) => s + p.saldo, 0);
    return {
      tipo: 'respuesta',
      titulo: total > 0 ? `Debes ${formatearDinero(total)} en total` : 'No tienes deudas registradas',
      lineas: partes.sort((a, b) => b.saldo - a.saldo).map((p) => `${p.nombre}: ${formatearDinero(p.saldo)}.`),
    };
  }

  // ¿Cuánto pagué de intereses?
  if (/\b(INTERES|INTERESES|COMISION|COMISIONES|ME COBRAN|ME CUESTA)\b/.test(t)) {
    const periodo = extraerPeriodo(t, hoy);
    const c = costosEntre(datos, periodo.desde, periodo.hasta);
    return {
      tipo: 'respuesta',
      titulo: `Pagaste ${formatearDinero(c.totalCentavos)} en intereses y comisiones ${periodo.nombre}`,
      lineas: c.porDeuda.map((d) => `${d.nombre}: ${formatearDinero(d.interesesCentavos + d.comisionesCentavos)}.`),
    };
  }

  // ¿Cuánto gasté (en comida) (este mes)?
  if (/\b(GASTE|GASTADO|GASTOS|GASTO|SALIDO)\b/.test(t)) {
    const periodo = extraerPeriodo(t, hoy);
    const categoriaId = buscarCategoria(t.replace(/\b(GASTE|GASTADO|GASTOS|GASTO)\b/g, ' '), datos);
    const gastos = datos.movimientos.filter(
      (m) => m.tipo === 'gasto' && m.fecha >= periodo.desde && m.fecha <= periodo.hasta && (!categoriaId || m.categoriaId === categoriaId),
    );
    const total = gastos.reduce((s, m) => s + m.montoCentavos, 0);
    const categoria = categoriaId ? datos.mapaCategorias.get(categoriaId) : undefined;
    const lineas: string[] = [];
    if (!categoria) {
      const porCat = new Map<string, number>();
      for (const g of gastos) {
        const nombre = (g.categoriaId && datos.mapaCategorias.get(g.categoriaId)?.nombre) || 'Sin categoría';
        porCat.set(nombre, (porCat.get(nombre) ?? 0) + g.montoCentavos);
      }
      for (const [nombre, monto] of [...porCat].sort((a, b) => b[1] - a[1]).slice(0, 4)) lineas.push(`${nombre}: ${formatearDinero(monto)}.`);
    }
    const conTarjeta = gastos.filter((g) => g.tarjetaId).reduce((s, g) => s + g.montoCentavos, 0);
    if (conTarjeta > 0) lineas.push(`De eso, ${formatearDinero(conTarjeta)} con tarjeta.`);
    return {
      tipo: 'respuesta',
      titulo: `Gastaste ${formatearDinero(total)}${categoria ? ` en ${categoria.nombre.toLowerCase()}` : ''} ${periodo.nombre}`,
      lineas,
      destino: 'movimientos',
    };
  }

  // ¿Cuál es el mínimo?
  if (/\bMINIMO\b/.test(t)) {
    const lista = tarjeta ? [tarjeta] : datos.tarjetas;
    return {
      tipo: 'respuesta',
      titulo: 'Pago mínimo',
      lineas: lista.map((x) => {
        const e = estadoTarjeta(x, datos.movimientos, hoy);
        return e.pagoMinimoCentavos !== null
          ? `${x.nombre}: ${formatearDinero(e.pagoMinimoCentavos)} antes del ${fechaCorta(e.fechaLimite)}.`
          : `${x.nombre}: importa su estado de cuenta para saber el mínimo.`;
      }),
    };
  }

  return { tipo: 'noEntendi' };
}
