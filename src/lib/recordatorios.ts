import type { Movimiento, Prestamo, Tarjeta } from '../db';
import type { Ajustes } from './ajustes';
import { estadoPrestamo, estadoTarjeta, fechaConDia, sumarMeses } from './deudas';
import { formatearDinero } from './dinero';
import { aDate, aFechaTexto, diasEntre, fechaCorta, moverMes, nombreMes, sumarDias } from './fechas';
import type { ClavePago } from './pagoRapido';

// Qué notificaciones programar y cuándo. Es lógica pura: la parte de Android
// solo las agenda (lib/nativo.ts).

export interface Recordatorio {
  /** Número estable derivado de `clave` (Android pide un entero). */
  id: number;
  clave: string;
  fecha: Date;
  titulo: string;
  cuerpo: string;
  destino?: { tipo: 'tarjeta' | 'prestamo'; id: string } | { tipo: 'ajustes' } | { tipo: 'resumen' };
  /** Si la notificación ofrece el botón "Registrar pago". */
  pagar?: boolean;
  /**
   * Pago con monto exacto: la notificación ofrece «Ya pagué», que lo registra
   * sin abrir el formulario (lib/pagoRapido.ts).
   */
  pagoDirecto?: ClavePago;
}

interface Entrada {
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  movimientos: Movimiento[];
  ajustes: Pick<Ajustes, 'recordatorios' | 'respaldo'>;
}

export const HORIZONTE_DIAS = 60;
/** Días después de la cuota para pedir actualizar el préstamo (el banco ya aplicó el pago). */
const DIAS_TRAS_CUOTA = 3;

/** FNV-1a de 31 bits: el mismo texto da siempre el mismo número positivo. */
export function idDe(clave: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < clave.length; i++) {
    h ^= clave.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2_147_483_647 || 1;
}

const cuandoFalta = (dias: number) => (dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);

export function generarRecordatorios(e: Entrada, ahora: Date, horizonte = HORIZONTE_DIAS): Recordatorio[] {
  const r = e.ajustes.recordatorios;
  if (!r.activo) return [];
  const [hh, mm] = r.hora.split(':').map(Number);
  const hoy = aFechaTexto(ahora);
  const limite = new Date(ahora.getTime() + horizonte * 86_400_000);
  const lista: Recordatorio[] = [];

  const agregar = (clave: string, fecha: string, datos: Omit<Recordatorio, 'id' | 'clave' | 'fecha'>) => {
    const d = aDate(fecha);
    d.setHours(hh, mm, 0, 0);
    if (d <= ahora || d > limite) return;
    lista.push({ id: idDe(clave), clave, fecha: d, ...datos });
  };

  /** Fechas con ese día del mes desde `desde` (incluida) hasta el final del horizonte. */
  const mensuales = (desde: string, dia: number) => {
    const fechas: string[] = [];
    for (let i = 0, f = desde; aDate(f) <= limite && i < 4; i++) {
      fechas.push(f);
      const d = aDate(f);
      f = fechaConDia(d.getFullYear(), d.getMonth() + 1, dia);
    }
    return fechas;
  };

  for (const t of e.tarjetas) {
    const est = estadoTarjeta(t, e.movimientos, hoy);
    const destino = { tipo: 'tarjeta' as const, id: t.id };

    if (r.pagos && est.pendienteCentavos > 0) {
      const minimo = est.pagoMinimoCentavos ? ` · mínimo ${formatearDinero(est.pagoMinimoCentavos)}` : '';
      for (const dias of r.diasTarjeta) {
        agregar(`tarjeta:${t.id}:pago:${est.fechaLimite}:${dias}`, sumarDias(est.fechaLimite, -dias), {
          titulo: dias === 0 ? `Hoy es el último día para pagar ${t.nombre}` : `Pago de ${t.nombre} ${cuandoFalta(dias)}`,
          cuerpo: `Pago de contado: ${formatearDinero(est.pendienteCentavos)}${minimo}. Último día: ${fechaCorta(est.fechaLimite)}.`,
          destino,
          pagar: true,
          pagoDirecto: { tipo: 'tarjeta', id: t.id, fecha: est.fechaLimite },
        });
      }
      const vence = est.vencido ? sumarDias(hoy, 1) : sumarDias(est.fechaLimite, 1);
      agregar(`tarjeta:${t.id}:vencido:${est.fechaLimite}:${vence}`, vence, {
        titulo: `Venció el pago de ${t.nombre}`,
        cuerpo: 'Paga cuanto antes para evitar intereses y cargos por mora.',
        destino,
        pagar: true,
        pagoDirecto: { tipo: 'tarjeta', id: t.id, fecha: est.fechaLimite },
      });
    }
    if (r.pagos && est.proximoEstadoCentavos > 0) {
      for (const dias of r.diasTarjeta) {
        agregar(`tarjeta:${t.id}:pago:${est.proximaFechaLimite}:${dias}`, sumarDias(est.proximaFechaLimite, -dias), {
          titulo: dias === 0 ? `Hoy es el último día para pagar ${t.nombre}` : `Pago de ${t.nombre} ${cuandoFalta(dias)}`,
          cuerpo: `Según lo registrado, serían unos ${formatearDinero(est.proximoEstadoCentavos)}. Revisa tu estado de cuenta.`,
          destino,
          pagar: true,
        });
      }
    }
    for (const corte of mensuales(est.proximoCorte, t.diaCorte)) {
      if (r.cortes) {
        agregar(`tarjeta:${t.id}:corte:${corte}`, sumarDias(corte, -1), {
          titulo: `Mañana es el corte de ${t.nombre}`,
          cuerpo: 'Lo que compres desde mañana se cobra en el estado de cuenta siguiente.',
          destino,
        });
      }
      if (r.estados) {
        agregar(`tarjeta:${t.id}:estado:${corte}`, sumarDias(corte, 2), {
          titulo: `Ya debe estar tu estado de cuenta de ${t.nombre}`,
          cuerpo: 'Impórtalo en Deudas para tener el pago de contado y el mínimo exactos.',
          destino,
        });
      }
    }
  }

  if (r.pagos) {
    for (const p of e.prestamos) {
      const est = estadoPrestamo(p, e.movimientos, hoy);
      if (!est.proximaFecha) continue;
      const destino = { tipo: 'prestamo' as const, id: p.id };
      const ancla = aDate(p.primeraCuota).getDate();
      const restantes = est.proyeccion?.meses ?? 1;
      for (let k = 0; k < Math.min(restantes, 3); k++) {
        const fecha = k === 0 ? est.proximaFecha : sumarMeses(est.proximaFecha, k, ancla);
        const monto = k === 0 ? est.proximaCuotaCentavos : p.cuotaCentavos;
        for (const dias of r.diasPrestamo) {
          agregar(`prestamo:${p.id}:cuota:${fecha}:${dias}`, sumarDias(fecha, -dias), {
            titulo: `Cuota de ${p.nombre} ${cuandoFalta(dias)}`,
            cuerpo: `${formatearDinero(monto)} el ${fechaCorta(fecha)}.`,
            destino,
            pagar: true,
            pagoDirecto: { tipo: 'prestamo', id: p.id, fecha },
          });
        }
      }
      if (est.vencido) {
        agregar(`prestamo:${p.id}:vencida:${est.proximaFecha}:${hoy}`, sumarDias(hoy, 1), {
          titulo: `La cuota de ${p.nombre} está vencida`,
          cuerpo: `Era el ${fechaCorta(est.proximaFecha)}. Págala cuanto antes para evitar cargos por mora.`,
          destino,
          pagar: true,
          pagoDirecto: { tipo: 'prestamo', id: p.id, fecha: est.proximaFecha },
        });
      }
    }
  }

  // Cada mes, unos días después de la cuota, actualizar el préstamo con una
  // captura del banco para que saldo y fecha de término sigan coincidiendo.
  if (r.actualizar) {
    for (const p of e.prestamos) {
      const est = estadoPrestamo(p, e.movimientos, hoy);
      if (!est.proximaFecha) continue;
      const ancla = aDate(p.primeraCuota).getDate();
      for (let k = 0; k < 2; k++) {
        const fecha = sumarDias(sumarMeses(est.proximaFecha, k, ancla), DIAS_TRAS_CUOTA);
        // Si se actualizó hace poco, ese mes no hace falta.
        if (p.actualizadoEn && diasEntre(p.actualizadoEn, fecha) < 25) continue;
        agregar(`prestamo:${p.id}:actualizar:${fecha}`, fecha, {
          titulo: `Actualiza ${p.nombre} con el banco`,
          cuerpo: 'Toma una captura del detalle del préstamo en la app del banco para que el saldo y la fecha de término sigan iguales.',
          destino: { tipo: 'prestamo', id: p.id },
        });
      }
    }
  }

  if (r.respaldo) {
    const cada = Math.max(1, e.ajustes.respaldo.recordarCadaDias);
    const ultimo = e.ajustes.respaldo.ultimoExterno;
    let fecha = ultimo ? sumarDias(aFechaTexto(new Date(ultimo)), cada) : sumarDias(hoy, 1);
    if (fecha <= hoy) fecha = sumarDias(hoy, 1);
    for (let i = 0; i < 9; i++, fecha = sumarDias(fecha, cada)) {
      agregar(`respaldo:${fecha}`, fecha, {
        titulo: 'Haz un respaldo de tus finanzas',
        cuerpo: 'Tus datos solo están en este celular. Toca para guardar una copia en Drive o en otro lugar.',
        destino: { tipo: 'ajustes' },
      });
    }
  }

  // El día 1, el resumen del mes que terminó (se ve al tocar, ya con todos los datos).
  if (r.resumen && e.movimientos.length > 0) {
    const d = aDate(hoy);
    for (let k = 1; k <= 2; k++) {
      const primero = fechaConDia(d.getFullYear(), d.getMonth() + k, 1);
      const mes = nombreMes(moverMes(primero.slice(0, 7), -1)).split(' ')[0].toLowerCase();
      agregar(`resumen:${primero}`, primero, {
        titulo: `Así te fue en ${mes}`,
        cuerpo: 'Toca para ver cuánto entró, cuánto gastaste y cuánto bajaron tus deudas.',
        destino: { tipo: 'resumen' },
      });
    }
  }

  if (lista.length > 0) {
    agregar(`abrir:${hoy}`, sumarDias(hoy, horizonte - 3), {
      titulo: 'Abre Mis Finanzas',
      cuerpo: 'Así tus recordatorios de pago siguen al día.',
    });
  }

  return lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
