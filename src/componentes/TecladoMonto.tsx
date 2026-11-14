import { useRef, type KeyboardEvent } from 'react';
import { agregarTecla, evaluarMonto, mostrarExpresion, tieneOperacion, type Tecla } from '../lib/calculo';
import { formatearDinero } from '../lib/dinero';
import { IconoBorrar } from './Iconos';

interface Props {
  /** Texto del monto, por ejemplo "12.50" o "5+3.50". */
  valor: string;
  alCambiar: (valor: string) => void;
  abierto: boolean;
  alAbrir: () => void;
  alCerrar: () => void;
  invalido?: boolean;
}

const FILAS: Array<Array<{ tecla: Tecla; texto?: string; etiqueta?: string }>> = [
  [{ tecla: '7' }, { tecla: '8' }, { tecla: '9' }, { tecla: 'borrar', etiqueta: 'Borrar' }],
  [{ tecla: '4' }, { tecla: '5' }, { tecla: '6' }, { tecla: '+', texto: '+', etiqueta: 'Más' }],
  [{ tecla: '1' }, { tecla: '2' }, { tecla: '3' }, { tecla: '-', texto: '−', etiqueta: 'Menos' }],
  [{ tecla: '.', texto: '.', etiqueta: 'Punto decimal' }, { tecla: '0' }, { tecla: 'limpiar', texto: 'C', etiqueta: 'Borrar todo' }],
];

/** Monto grande con teclado tipo calculadora: no abre el teclado del celular. */
export function TecladoMonto({ valor, alCambiar, abierto, alAbrir, alCerrar, invalido }: Props) {
  // Con un monto ya puesto (al editar o tras leer un ticket), el primer número lo reemplaza.
  const reemplazar = useRef(valor !== '');

  const pulsar = (tecla: Tecla) => {
    let base = valor;
    if (reemplazar.current) {
      reemplazar.current = false;
      if (/[0-9.]/.test(tecla)) base = '';
    }
    alCambiar(agregarTecla(base, tecla));
  };

  const conOperacion = tieneOperacion(valor);
  const resultado = evaluarMonto(valor);
  const texto = valor === '' ? '0.00' : mostrarExpresion(valor);

  // También se puede escribir con un teclado físico (en la computadora).
  function teclado(e: KeyboardEvent) {
    const mapa: Record<string, Tecla> = { Backspace: 'borrar', Delete: 'limpiar', ',': '.', '.': '.', '+': '+', '-': '-' };
    const tecla = /^[0-9]$/.test(e.key) ? (e.key as Tecla) : mapa[e.key];
    if (tecla) {
      e.preventDefault();
      if (!abierto) alAbrir();
      pulsar(tecla);
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault();
      alCerrar();
    }
  }

  return (
    <div className="monto-teclado">
      <button
        type="button"
        className={invalido ? 'pantalla-monto invalido' : 'pantalla-monto'}
        aria-label={`Monto: ${valor === '' ? 'vacío' : texto}${conOperacion && resultado ? `, total ${formatearDinero(resultado)}` : ''}`}
        aria-expanded={abierto}
        onClick={alAbrir}
        onKeyDown={teclado}
      >
        <span className="pantalla-moneda" aria-hidden="true">
          $
        </span>
        <span className={valor === '' ? 'pantalla-texto vacio' : 'pantalla-texto'} aria-hidden="true">
          {texto}
        </span>
        {conOperacion && (
          <span className="pantalla-resultado" aria-hidden="true">
            = {resultado ? formatearDinero(resultado) : '—'}
          </span>
        )}
      </button>
      {abierto && (
        <div className="teclado" role="group" aria-label="Teclado del monto">
          {FILAS.flat().map(({ tecla, texto: t, etiqueta }) => (
            <button
              key={tecla}
              type="button"
              className={/[0-9.]/.test(tecla) ? 'tecla-monto' : 'tecla-monto operacion'}
              aria-label={etiqueta ?? tecla}
              onClick={() => pulsar(tecla)}
            >
              {tecla === 'borrar' ? <IconoBorrar /> : (t ?? tecla)}
            </button>
          ))}
          <button type="button" className="tecla-monto listo" onClick={alCerrar}>
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
