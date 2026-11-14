import type { ReactNode } from 'react';
import { IconoFlecha } from './Iconos';

interface Props {
  icono: ReactNode;
  titulo: string;
  detalle?: ReactNode;
  valor?: ReactNode;
  alTocar: () => void;
}

/** Fila de una lista de ajustes: ícono, título, detalle y flecha. */
export function Opcion({ icono, titulo, detalle, valor, alTocar }: Props) {
  return (
    <li>
      <button type="button" className="opcion" onClick={alTocar}>
        <span className="opcion-icono" aria-hidden="true">
          {icono}
        </span>
        <span className="fila-texto">
          <span className="fila-titulo">{titulo}</span>
          {detalle && <span className="fila-detalle">{detalle}</span>}
        </span>
        {valor && <span className="opcion-valor">{valor}</span>}
        <span className="opcion-flecha" aria-hidden="true">
          <IconoFlecha />
        </span>
      </button>
    </li>
  );
}
