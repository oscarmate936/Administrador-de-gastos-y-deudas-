import type { FormaPago } from '../lib/deudas';

/** Qué hace la app con cada forma de pagar una tarjeta. */
export const AYUDA_FORMA: Record<FormaPago, string> = {
  total: 'La app aparta el pago de contado y te avisa hasta que lo pagues completo.',
  recomendado: 'La app aparta lo mínimo para que la deuda baje: cubre los intereses y las cuotas de compras a plazos.',
  minimo: 'La app aparta solo el mínimo del banco. A veces no alcanza para que la deuda baje.',
};

const NOMBRES: Record<FormaPago, string> = { total: 'El total', recomendado: 'Recomendado', minimo: 'El mínimo' };

/** Botones «El total / Recomendado / El mínimo», con el monto de cada uno si se da. */
export function SegmentosForma({
  valor,
  alCambiar,
  montos,
  etiqueta,
}: {
  valor: FormaPago | undefined;
  alCambiar: (f: FormaPago) => void;
  montos?: Partial<Record<FormaPago, string>>;
  etiqueta: string;
}) {
  const actual = valor ?? 'total';
  return (
    <div className="segmentos segmentos-forma" role="group" aria-label={etiqueta}>
      {(['total', 'recomendado', 'minimo'] as const).map((f) => (
        <button key={f} type="button" aria-pressed={actual === f} onClick={() => alCambiar(f)}>
          {NOMBRES[f]}
          {montos?.[f] && <span className="segmento-monto">{montos[f]}</span>}
        </button>
      ))}
    </div>
  );
}
