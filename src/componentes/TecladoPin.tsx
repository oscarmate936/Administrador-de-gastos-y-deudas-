import { IconoBorrar } from './Iconos';

interface Props {
  valor: string;
  largo: number;
  alCambiar: (valor: string) => void;
  deshabilitado?: boolean;
  /** Botón extra en la esquina inferior izquierda (por ejemplo, la huella). */
  extra?: React.ReactNode;
}

/** Puntos del PIN y teclado numérico grande. */
export function TecladoPin({ valor, largo, alCambiar, deshabilitado, extra }: Props) {
  const tecla = (d: string) => (
    <button
      key={d}
      type="button"
      className="tecla"
      disabled={deshabilitado}
      onClick={() => valor.length < largo && alCambiar(valor + d)}
    >
      {d}
    </button>
  );
  return (
    <div className="teclado-pin">
      <div className="puntos-pin" aria-label={`${valor.length} de ${largo} dígitos`} role="status">
        {Array.from({ length: largo }, (_, i) => (
          <span key={i} className={i < valor.length ? 'punto-pin lleno' : 'punto-pin'} />
        ))}
      </div>
      <div className="teclas">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(tecla)}
        <span className="tecla-extra">{extra}</span>
        {tecla('0')}
        <button
          type="button"
          className="tecla tecla-icono"
          aria-label="Borrar"
          disabled={deshabilitado || valor.length === 0}
          onClick={() => alCambiar(valor.slice(0, -1))}
        >
          <IconoBorrar />
        </button>
      </div>
    </div>
  );
}
