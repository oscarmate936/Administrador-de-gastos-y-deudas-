import { useState } from 'react';
import type { Categoria, Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoAnterior, IconoSiguiente } from '../componentes/Iconos';
import { formatearDinero } from '../lib/dinero';
import { fechaRelativa, hoy, mesDe, moverMes, nombreMes } from '../lib/fechas';
import { agruparPorDia, totalesDelMes } from '../lib/resumen';

interface Props {
  movimientos: Movimiento[];
  categorias: Map<string, Categoria>;
  alEditar: (m: Movimiento) => void;
}

export function Movimientos({ movimientos, categorias, alEditar }: Props) {
  const [mes, setMes] = useState(() => mesDe(hoy()));
  const totales = totalesDelMes(movimientos, mes);
  const dias = agruparPorDia(totales.movimientos);

  return (
    <>
      <div className="selector-mes">
        <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">
          <IconoAnterior />
        </button>
        <h2 aria-live="polite">{nombreMes(mes)}</h2>
        <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">
          <IconoSiguiente />
        </button>
      </div>

      <section className="tarjeta">
        <dl className="cifras">
          <div>
            <dt>Ingresos</dt>
            <dd className="positivo">{formatearDinero(totales.ingresosCentavos)}</dd>
          </div>
          <div>
            <dt>Gastos</dt>
            <dd>{formatearDinero(totales.gastosCentavos)}</dd>
          </div>
          <div>
            <dt>Diferencia</dt>
            <dd>{formatearDinero(totales.ingresosCentavos - totales.gastosCentavos)}</dd>
          </div>
        </dl>
      </section>

      {dias.length === 0 ? (
        <p className="sin-datos">No hay movimientos en este mes.</p>
      ) : (
        dias.map(([fecha, lista]) => (
          <section className="tarjeta" key={fecha}>
            <h3 className="titulo-dia">{fechaRelativa(fecha)}</h3>
            <ul className="lista">
              {lista.map((m) => (
                <FilaMovimiento key={m.id} movimiento={m} categorias={categorias} alTocar={alEditar} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
