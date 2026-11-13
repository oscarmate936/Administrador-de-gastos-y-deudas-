import { useEffect, useRef, type ReactNode } from 'react';
import { IconoCerrar } from './Iconos';

interface Props {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}

/** Panel que sube desde abajo. Usa <dialog> para atrapar el foco y cerrar con Escape. */
export function Hoja({ titulo, alCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
    return () => dialogo?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="hoja"
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        // Un toque en el fondo oscuro cierra la hoja.
        if (e.target === ref.current) alCerrar();
      }}
    >
      <div className="hoja-contenido">
        <header className="hoja-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar">
            <IconoCerrar />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
