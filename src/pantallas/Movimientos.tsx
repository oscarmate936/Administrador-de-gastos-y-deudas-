import { useState } from 'react';
import type { Datos } from '../datos';
import type { Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { GraficaDeuda, GraficaFlujo } from '../componentes/Graficas';
import { IconoAnterior, IconoSiguiente } from '../componentes/Iconos';
import { formatearDinero } from '../lib/dinero';
import { fechaRelativa, hoy, mesDe, moverMes, nombreMes } from '../lib/fechas';
import { coincide, FILTROS, pasaFiltro, type Filtro } from '../lib/filtros';
import { deudaPorMes, flujoPorMes } from '../lib/graficas';
import { agruparPorDia, gastosPorCategoria, ordenarRecientes, totalesDelMes } from '../lib/resumen';

interface Props {
  datos: Datos;
  alEditar: (m: Movimiento) => void;
}

export function Movimientos({ datos, alEditar }: Props) {
  const [vista, setVista] = useState<'lista' | 'resumen'>('lista');
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

  const pestanas = (
    <div className="segmentos" role="tablist" aria-label="Vista">
      <button type="button" role="tab" aria-selected={vista === 'lista'} aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
        Lista
      </button>
      <button type="button" role="tab" aria-selected={vista === 'resumen'} aria-pressed={vista === 'resumen'} onClick={() => setVista('resumen')}>
        Resumen
      </button>
    </div>
  );

  if (vista === 'resumen') {
    const totales = totalesDelMes(datos.movimientos, mes);
    const gastosMes = totales.movimientos.filter((m) => m.tipo === 'gasto');
    const porCategoria = gastosPorCategoria(gastosMes, new Set(datos.mapaCategorias.keys()));
    const mayor = porCategoria[0]?.totalCentavos ?? 0;
    return (
      <>
        {pestanas}
        <section className="tarjeta">
          <h2>Ingresos y salidas</h2>
          <GraficaFlujo meses={flujoPorMes(datos.movimientos, mesDe(hoy()))} />
        </section>
        <section className="tarjeta">
          <h2>Deuda total por mes</h2>
          <GraficaDeuda puntos={deudaPorMes(datos.historial)} />
        </section>
        {selector}
        <section className="tarjeta">
          <h2>En qué gastaste</h2>
          {porCategoria.length === 0 ? (
            <p className="texto-tenue">No hay gastos en este mes.</p>
          ) : (
            <ul className="categorias-barras sin-borde">
              {porCategoria.map(({ categoriaId, totalCentavos }) => {
                const c = categoriaId ? datos.mapaCategorias.get(categoriaId) : undefined;
                return (
                  <li key={categoriaId ?? 'sin'}>
                    <span className="categoria-nombre">
                      <span aria-hidden="true">{c?.emoji ?? '📦'}</span> {c?.nombre ?? 'Sin categoría'}
                    </span>
                    <span className="categoria-total">{formatearDinero(totalCentavos)}</span>
                    <span className="categoria-barra">
                      <span style={{ width: `${Math.max(3, (totalCentavos / mayor) * 100)}%`, background: c?.color ?? 'var(--tenue)' }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="ayuda sin-margen">Incluye las compras con tarjeta.</p>
        </section>
      </>
    );
  }

  const buscando = busqueda.trim() !== '';
  // Al buscar se recorren todos los meses; si no, solo el elegido.
  const base = buscando ? ordenarRecientes(datos.movimientos) : totalesDelMes(datos.movimientos, mes).movimientos;
  const visibles = base.filter((m) => pasaFiltro(m, filtro) && coincide(m, busqueda, datos));
  const totales = totalesDelMes(datos.movimientos, mes);
  const dias = agruparPorDia(visibles);

  return (
    <>
      {pestanas}
      <div className="buscador">
        <input
          type="search"
          placeholder="Buscar por nota, categoría, tarjeta o monto"
          aria-label="Buscar movimientos"
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
          {selector}
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
                Además compraste {formatearDinero(totales.conTarjetaCentavos)} con tarjeta. Eso no resta de tu disponible hasta
                que pagas la tarjeta.
              </p>
            )}
          </section>
        </>
      )}

      {dias.length === 0 ? (
        <p className="sin-datos">{buscando || filtro !== 'todos' ? 'No hay movimientos que coincidan.' : 'No hay movimientos en este mes.'}</p>
      ) : (
        dias.map(([fecha, lista]) => (
          <section className="tarjeta" key={fecha}>
            <h3 className="titulo-dia">{buscando ? `${fechaRelativa(fecha)} · ${nombreMes(mesDe(fecha))}` : fechaRelativa(fecha)}</h3>
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
