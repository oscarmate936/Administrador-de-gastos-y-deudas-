import { normalizar } from '../estados/lectura';
import { esFechaValida } from '../fechas';
import { combinar, type Lectura } from './combinar';
import { leerImporte } from './ticket';

// Interpreta el texto de una captura de la app del banco con el detalle de un
// préstamo ("Monto original", "Deuda total", "Cuota", "Tasa de interés",
// "Fecha de pago"...). El resultado siempre se revisa antes de guardar.

export interface DatosPrestamo {
  nombre?: string;
  montoOriginalCentavos?: number;
  saldoCentavos?: number;
  cuotaCentavos?: number;
  tasaAnual?: number;
  /** Fecha del próximo pago. */
  proximaFecha?: string;
  /** Lo que está vencido sin pagar. */
  pendienteCentavos?: number;
  cuotasEnMora?: number;
}

const importe = (t: string) => {
  const m = /\$?\s?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\$?\s?\d+[.,]\d{2}/.exec(t);
  return m ? leerImporte(m[0]) : null;
};
const tasa = (t: string) => {
  const m = /(\d{1,3}(?:[.,]\d{1,2})?)\s?%/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n > 0 && n <= 200 ? n : null;
};
const fecha = (t: string) => {
  const m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t);
  if (!m) return null;
  const f = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return esFechaValida(f) ? f : null;
};
const entero = (t: string) => {
  const m = /^\D{0,3}(\d{1,3})\D{0,3}$/.exec(t.trim());
  return m ? Number(m[1]) : null;
};

export function leerCapturaPrestamo(texto: string): DatosPrestamo {
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const normales = lineas.map((l) => normalizar(l).replace(/([A-Z])DE\b/g, '$1 DE'));

  /** Valor de la etiqueta: en su mismo renglón o en uno de los dos siguientes. */
  function valor<T>(etiqueta: RegExp, leer: (t: string) => T | null, excluir?: RegExp): T | undefined {
    for (let i = 0; i < normales.length; i++) {
      const m = etiqueta.exec(normales[i]);
      if (!m || (excluir && excluir.test(normales[i]))) continue;
      const resto = lineas[i].slice(Math.min(lineas[i].length, m.index + m[0].length));
      const mismo = leer(resto);
      if (mismo !== null) return mismo;
      for (const j of [i + 1, i + 2]) {
        if (j >= lineas.length) break;
        const v = leer(lineas[j]);
        if (v !== null) return v;
      }
    }
    return undefined;
  }

  const texto0 = (t: string) => {
    const limpio = t.replace(/\b\d{5,}\b/g, '').replace(/^[\s:·-]+/, '').replace(/\s+/g, ' ').trim();
    return /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(limpio) ? limpio : null;
  };

  const nombre = valor(/\bTIPO\b/, texto0) ?? valor(/\b(ALIAS|NOMBRE|PRODUCTO)\b/, texto0);
  return {
    nombre: nombre?.slice(0, 40),
    montoOriginalCentavos: valor(/MONTO (ORIGINAL|OTORGADO|DESEMBOLSADO|DEL PRESTAMO|APROBADO)/, importe),
    saldoCentavos:
      valor(/DEUDA TOTAL|SALDO (ACTUAL|PENDIENTE|DE CAPITAL|CAPITAL|TOTAL|ADEUDADO)|CAPITAL PENDIENTE/, importe) ??
      valor(/\bSALDO\b/, importe),
    cuotaCentavos: valor(/\b(VALOR DE (LA )?)?CUOTA( MENSUAL)?\b/, importe, /MORA|CUOTAS|PAGADAS|PENDIENTES/),
    tasaAnual: valor(/TASA/, tasa),
    proximaFecha: valor(/FECHA (DE |DEL |DE PROXIMO |DEL PROXIMO )?PAGO|PROXIMA CUOTA|PROXIMO PAGO|VENCIMIENTO/, fecha),
    pendienteCentavos: valor(/(VALOR|MONTO) PENDIENTE|PENDIENTE DE PAGO|VALOR VENCIDO/, importe),
    cuotasEnMora: valor(/CUOTAS (EN MORA|VENCIDAS)/, entero),
  };
}

export interface CapturaPrestamo {
  nombre?: string;
  montoOriginal: Lectura<number>;
  saldo: Lectura<number>;
  cuota: Lectura<number>;
  tasaAnual: Lectura<number>;
  proximaFecha: Lectura<string>;
  pendiente: Lectura<number>;
  cuotasEnMora: Lectura<number>;
}

/** Combina las lecturas de los dos motores: números del clásico, nombre del moderno. */
export function leerCapturaConDosMotores(textoLstm: string, textoClasico: string): CapturaPrestamo {
  const a = leerCapturaPrestamo(textoLstm);
  const b = leerCapturaPrestamo(textoClasico);
  return {
    nombre: a.nombre ?? b.nombre,
    montoOriginal: combinar(b.montoOriginalCentavos, a.montoOriginalCentavos),
    saldo: combinar(b.saldoCentavos, a.saldoCentavos),
    cuota: combinar(b.cuotaCentavos, a.cuotaCentavos),
    tasaAnual: combinar(b.tasaAnual, a.tasaAnual),
    proximaFecha: combinar(b.proximaFecha, a.proximaFecha),
    pendiente: combinar(b.pendienteCentavos, a.pendienteCentavos),
    cuotasEnMora: combinar(b.cuotasEnMora, a.cuotasEnMora),
  };
}
