import { useState } from 'react';
import { GLOSARIO, type Termino } from '../lib/glosario';
import { Hoja } from './Hoja';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Botón (i) que explica un término en dos frases. */
export function Ayuda({ termino, clara }: { termino: Termino; clara?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        className={clara ? 'ayuda-i clara' : 'ayuda-i'}
        aria-label={`Qué significa ${termino}`}
        onClick={(e) => {
          e.stopPropagation();
          setAbierta(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5h.01" />
        </svg>
      </button>
      {abierta && (
        <Hoja titulo={mayuscula(termino)} alCerrar={() => setAbierta(false)}>
          <div className="formulario">
            <p className="texto-ayuda">{GLOSARIO[termino]}</p>
            <div className="acciones">
              <button type="button" className="boton primario" onClick={() => setAbierta(false)}>
                Entendido
              </button>
            </div>
          </div>
        </Hoja>
      )}
    </>
  );
}
