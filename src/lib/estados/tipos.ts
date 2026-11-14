/** Un fragmento de texto del PDF con su posición (puntos, origen abajo a la izquierda). */
export interface Item {
  texto: string;
  x: number;
  y: number;
  ancho: number;
}

export interface Pagina {
  items: Item[];
}

export type Banco = 'Davivienda' | 'Banco Agrícola';

export interface MovimientoEstado {
  /** Fecha de la transacción, "AAAA-MM-DD". */
  fecha: string;
  concepto: string;
  /** Siempre positivo. */
  montoCentavos: number;
  /** cargo: compra, interés o comisión. abono: pago a la tarjeta o devolución. */
  tipo: 'cargo' | 'abono';
}

/** Compra a plazos o extrafinanciamiento: deuda aparte del saldo que se cobra en cuotas. */
export interface PlanCuotas {
  /** Comercio de la compra, o "Extrafinanciamiento". */
  descripcion: string;
  /** Tasa mensual en porcentaje (0 en compras a plazos sin intereses). */
  tasaMensual: number;
  /** Número de la cuota cobrada en este estado de cuenta. */
  cuotaActual: number;
  cuotasTotales: number;
  cuotaCentavos: number;
  /** Lo que falta después de la cuota de este corte. */
  saldoCentavos: number;
}

export interface EstadoCuentaTarjeta {
  banco: Banco;
  /** Ej. "Mastercard Clasica". */
  producto: string;
  ultimos4: string | null;
  fechaCorte: string;
  fechaLimite: string;
  limiteCentavos: number | null;
  disponibleCentavos: number | null;
  /** Deuda total al corte. */
  saldoCentavos: number;
  pagoContadoCentavos: number;
  pagoMinimoCentavos: number | null;
  tasaAnual: number | null;
  movimientos: MovimientoEstado[];
  /** Compras a plazos y extrafinanciamientos vigentes (no están dentro del saldo). */
  planes: PlanCuotas[];
  /**
   * true si los movimientos leídos suman lo mismo que los totales del estado de
   * cuenta; false si no (puede faltar alguno); null si no se pudo comprobar.
   */
  totalesCuadran: boolean | null;
}
