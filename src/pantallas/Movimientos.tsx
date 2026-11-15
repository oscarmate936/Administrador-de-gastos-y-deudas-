import { useState } from 'react';
import type { Datos } from '../datos';
import type { Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoAnterior, IconoSiguiente } from '../componentes/Iconos';
import { Simbolo } from '../componentes/Simbolo';
import { formatearDinero } from '../lib/dinero';
import { fechaRelativa, hoy, mesDe, moverMes, nombreMes } from '../lib/fechas';
import { coincide, FILTROS, pasaFiltro, type Filtro } from '../lib/filtros';
import { agruparPorDia, ordenarRecientes, totalesDelMes } from '../lib/resumen';

interface Props {
  datos: Datos;
  alEditar: (m: Movimiento) => void;
  alBorrar: (m: Movimiento) => void;
}

export function Movimientos({ datos, alEditar, alBorrar }: Props) {
  const [mes, setMes] = useState(() => mesDe(hoy()));
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const selector = (
    <div className="selector-mes">
      <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">
        <IconoAnterior />
      </button>
      <h2 aria-live="polite">{nombreMes(mes)}</h2>
      <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">
        <IconoSiguiente />
      </button>
    </div>
  );

  const buscando = busqueda.trim() !== '';
  // Al buscar se recorren todos los meses; si no, solo el elegido.
  const base = buscando ? ordenarRecientes(datos.movimientos) : totalesDelMes(datos.movimientos, mes).movimientos;
  const visibles = base.filter((m) => pasaFiltro(m, filtro) && coincide(m, busqueda, datos));
  const totales = totalesDelMes(datos.movimientos, mes);
  const dias = agruparPorDia(visibles);

  return (
    <>
      {!buscando && selector}
      <div className="buscador">
        <Simbolo nombre="buscar" tamano={18} />
        <input
          type="search"
          placeholder="Buscar nota, categoría o monto"
          aria-label="Buscar movimientos por nota, categoría, tarjeta o monto"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="chips desplazable" role="group" aria-label="Filtrar">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.nombre}
          </button>
        ))}
      </div>

      {buscando ? (
        <p className="texto-tenue" aria-live="polite">
          {visibles.length === 1 ? '1 resultado' : `${visibles.length} resultados`} en todos los meses
        </p>
      ) : (
        <>
          <section className="tarjeta">
            <dl className="cifras">
              <div>
                <dt>Entró</dt>
                <dd className="positivo">{formatearDinero(totales.ingresosCentavos)}</dd>
              </div>
              <div>
                <dt>Salió</dt>
                <dd>{formatearDinero(totales.salidasCentavos)}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{formatearDinero(totales.ingresosCentavos - totales.salidasCentavos)}</dd>
              </div>
            </dl>
            {totales.conTarjetaCentavos > 0 && (
              <p className="ayuda sin-margen">
                Además compraste {formatearDinero(totales.conTarjetaCentavos)} con tarjeta. Eso no resta de tu disponible hasta
                que pagas la tarjeta.
              </p>
            )}
          </section>
        </>
      )}

      {dias.length > 0 && <p className="ayuda sin-margen consejo">Desliza un movimiento a la izquierda para editarlo o borrarlo.</p>}

      {dias.length === 0 ? (
        <p className="sin-datos">{buscando || filtro !== 'todos' ? 'No hay movimientos que coincidan.' : 'No hay movimientos en este mes.'}</p>
      ) : (
        dias.map(([fecha, lista]) => (
          <section className="grupo" key={fecha}>
            <h3 className="cabecera-grupo">
              <span>{buscando ? `${fechaRelativa(fecha)} · ${nombreMes(mesDe(fecha))}` : fechaRelativa(fecha)}</span>
              <span>{totalDia(lista)}</span>
            </h3>
            <ul className="lista tarjeta">
              {lista.map((m) => (
                <FilaMovimiento key={m.id} movimiento={m} datos={datos} alTocar={alEditar} alBorrar={alBorrar} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

/** Lo que salió en el día (sin contar compras con tarjeta, que no salen de tu dinero). */
function totalDia(lista: Movimiento[]) {
  const entra = lista.filter((m) => m.tipo === 'ingreso').reduce((t, m) => t + m.montoCentavos, 0);
  const sale = lista.filter((m) => m.tipo !== 'ingreso' && !(m.tipo === 'gasto' && m.tarjetaId)).reduce((t, m) => t + m.montoCentavos, 0);
  const neto = entra - sale;
  if (neto === 0) return '';
  return neto > 0 ? `+${formatearDinero(neto)}` : `−${formatearDinero(-neto)}`;
}
