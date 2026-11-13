import { useState } from 'react';
import type { Datos } from '../datos';
import type { Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoAnterior, IconoSiguiente } from '../componentes/Iconos';
import { formatearDinero } from '../lib/dinero';
import { fechaRelativa, hoy, mesDe, moverMes, nombreMes } from '../lib/fechas';
import { agruparPorDia, totalesDelMes } from '../lib/resumen';

interface Props {
  datos: Datos;
  alEditar: (m: Movimiento) => void;
}

export function Movimientos({ datos, alEditar }: Props) {
  const [mes, setMes] = useState(() => mesDe(hoy()));
  const totales = totalesDelMes(datos.movimientos, mes);
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
            <dt>Salidas</dt>
            <dd>{formatearDinero(totales.salidasCentavos)}</dd>
          </div>
          <div>
            <dt>Diferencia</dt>
            <dd>{formatearDinero(totales.ingresosCentavos - totales.salidasCentavos)}</dd>
          </div>
        </dl>
        {totales.conTarjetaCentavos > 0 && (
          <p className="ayuda sin-margen">
            Además compraste {formatearDinero(totales.conTarjetaCentavos)} con tarjeta. Eso no resta de tu disponible
            hasta que pagas la tarjeta.
          </p>
        )}
      </section>

      {dias.length === 0 ? (
        <p className="sin-datos">No hay movimientos en este mes.</p>
      ) : (
        dias.map(([fecha, lista]) => (
          <section className="tarjeta" key={fecha}>
            <h3 className="titulo-dia">{fechaRelativa(fecha)}</h3>
            <ul className="lista">
              {lista.map((m) => (
                <FilaMovimiento key={m.id} movimiento={m} datos={datos} alTocar={alEditar} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
