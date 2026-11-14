import { useState } from 'react';
import type { Datos, Detalle } from '../datos';
import { GraficaDeuda, GraficaFlujo } from '../componentes/Graficas';
import { IconoAnterior, IconoFlecha, IconoSiguiente } from '../componentes/Iconos';
import { Insignia, MarcaCategoria, Simbolo } from '../componentes/Simbolo';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { Hoja } from '../componentes/Hoja';
import type { Movimiento } from '../db';
import { cambiosContraMesAnterior, fijosYVariables } from '../lib/comparar';
import type { AjustesPlan } from '../lib/ajustes';
import { costosEntre } from '../lib/costos';
import { sumarMeses, textoDuracion } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { hoy, mesCorto, mesDe, moverMes, nombreMes } from '../lib/fechas';
import { deudaPorMes, flujoPorMes } from '../lib/graficas';
import { deudasParaPlan, simularPlan, sumaMinimos } from '../lib/plan';
import { gastosPorCategoria, ordenarRecientes, totalesDelMes } from '../lib/resumen';

interface Props {
  datos: Datos;
  plan: AjustesPlan;
  alAbrir: (d: Detalle) => void;
  alEditar: (m: Movimiento) => void;
}

/** Lo que ayuda a decidir: en qué se va el dinero, límites, costo de las deudas y el plan. */
export function Analisis({ datos, plan, alAbrir, alEditar }: Props) {
  const fechaHoy = hoy();
  const [mes, setMes] = useState(() => mesDe(fechaHoy));
  // Categoría abierta en detalle; '' = sin categoría.
  const [abierta, setAbierta] = useState<string | null>(null);
  const nombreCategoria = (id: string | undefined) => (id ? (datos.mapaCategorias.get(id)?.nombre ?? 'Sin categoría') : 'Sin categoría');
  const cambios = cambiosContraMesAnterior(datos.movimientos, mes);
  const fv = fijosYVariables(
    datos.movimientos,
    datos.recurrentes.filter((r) => r.activo),
    (id) => datos.prestamos.find((p) => p.id === id)?.nombre ?? 'préstamo',
    nombreCategoria,
    mes,
  );
  const mesAnterior = nombreMes(moverMes(mes, -1)).split(' ')[0].toLowerCase();

  const gastosMes = totalesDelMes(datos.movimientos, mes).movimientos.filter((m) => m.tipo === 'gasto');
  const porCategoria = gastosPorCategoria(gastosMes, new Set(datos.mapaCategorias.keys()));
  const mayor = porCategoria[0]?.totalCentavos ?? 0;
  const totalGastos = porCategoria.reduce((t, c) => t + c.totalCentavos, 0);
  // Categorías con límite que aún no tienen gastos este mes también se muestran.
  const sinGastoConLimite = datos.categorias.filter((c) => c.limiteCentavos && !porCategoria.some((p) => p.categoriaId === c.id));

  const anio = fechaHoy.slice(0, 4);
  const costoAnio = costosEntre(datos, `${anio}-01-01`, fechaHoy);
  const deudasPlan = deudasParaPlan(datos, fechaHoy);
  const pagoPlan = plan.pagoMensualCentavos ?? Math.ceil((sumaMinimos(deudasPlan) * 1.25) / 1000) * 1000;
  const resultadoPlan = deudasPlan.length > 0 ? simularPlan(deudasPlan, pagoPlan, plan.metodo) : null;
  const historial = deudaPorMes(datos.historial);

  return (
    <>
      <section className="tarjeta">
        <h2>Entra y sale</h2>
        <GraficaFlujo meses={flujoPorMes(datos.movimientos, mesDe(fechaHoy))} />
      </section>

      <section className="grupo">
        <div className="cabecera-grupo">
          <h2>En qué gastas</h2>
          <span className="selector-mini">
            <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">
              <IconoAnterior />
            </button>
            <span aria-live="polite">{nombreMes(mes)}</span>
            <button type="button" className="boton-icono" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">
              <IconoSiguiente />
            </button>
          </span>
        </div>
        <div className="tarjeta">
          {cambios.length > 0 && (
            <ul className="cambios" aria-label={`Comparado con ${mesAnterior}`}>
              {cambios.map((c) => (
                <li key={c.categoriaId ?? 'sin'} className={c.diferenciaCentavos > 0 ? 'sube' : 'baja'}>
                  <span className="cambio-flecha" aria-hidden="true">
                    <Simbolo nombre={c.diferenciaCentavos > 0 ? 'ingreso' : 'gasto'} tamano={16} />
                  </span>
                  <span>
                    <strong>{nombreCategoria(c.categoriaId)}:</strong>{' '}
                    {c.diferenciaCentavos > 0
                      ? c.porcentaje === null
                        ? `${formatearDinero(c.diferenciaCentavos)}; en ${mesAnterior} no hubo`
                        : `${formatearDinero(c.diferenciaCentavos)} más que en ${mesAnterior} (+${c.porcentaje}%)`
                      : c.actualCentavos === 0
                        ? `${formatearDinero(-c.diferenciaCentavos)} menos que en ${mesAnterior}; este mes no hubo`
                        : `${formatearDinero(-c.diferenciaCentavos)} menos que en ${mesAnterior} (${c.porcentaje}%)`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {porCategoria.length === 0 && sinGastoConLimite.length === 0 ? (
            <p className="texto-tenue">No hay gastos en este mes.</p>
          ) : (
            <ul className="categorias-barras sin-borde">
              {porCategoria.map(({ categoriaId, totalCentavos }) => {
                const c = categoriaId ? datos.mapaCategorias.get(categoriaId) : undefined;
                const limite = c?.limiteCentavos;
                const pct = limite ? Math.round((totalCentavos / limite) * 100) : null;
                const color = pct === null ? 'var(--serie-1)' : pct >= 100 ? 'var(--peligro)' : pct >= 80 ? 'var(--alerta)' : 'var(--serie-1)';
                const ancho = limite ? Math.min(100, (totalCentavos / limite) * 100) : (totalCentavos / mayor) * 100;
                return (
                  <li key={categoriaId ?? 'sin'}>
                    <button type="button" className="categoria-boton" onClick={() => setAbierta(categoriaId ?? '')}>
                      <span className="categoria-nombre">
                        {c ? <MarcaCategoria categoria={c} /> : null} {c?.nombre ?? 'Sin categoría'}
                      </span>
                      <span className="categoria-total">
                        {formatearDinero(totalCentavos)}{' '}
                        <span className={pct !== null && pct >= 80 ? (pct >= 100 ? 'texto-peligro' : 'texto-alerta') : 'texto-tenue'}>
                          {limite ? `${pct}% de ${formatearDinero(limite)}` : `${Math.round((totalCentavos / totalGastos) * 100)}%`}
                        </span>
                      </span>
                      <span className="categoria-barra">
                        <span style={{ width: `${Math.max(3, ancho)}%`, background: color }} />
                      </span>
                    </button>
                  </li>
                );
              })}
              {sinGastoConLimite.map((c) => (
                <li key={c.id}>
                  <span className="categoria-nombre">
                    <MarcaCategoria categoria={c} /> {c.nombre}
                  </span>
                  <span className="categoria-total">
                    {formatearDinero(0)} <span className="texto-tenue">de {formatearDinero(c.limiteCentavos!)}</span>
                  </span>
                  <span className="categoria-barra">
                    <span style={{ width: '0%' }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="ayuda sin-margen">
            Incluye las compras con tarjeta. Toca una categoría para ver sus gastos. Los límites se cambian en Ajustes, en Categorías.
          </p>
        </div>
      </section>

      {fv.fijosCentavos + fv.variablesCentavos > 0 && (
        <section className="tarjeta">
          <h2>Fijos y variables</h2>
          <div className="barra-doble" aria-hidden="true">
            <span className="fijos" style={{ width: `${(fv.fijosCentavos / (fv.fijosCentavos + fv.variablesCentavos)) * 100}%` }} />
          </div>
          <dl className="cifras dos">
            <div>
              <dt>
                <span className="muestra serie-1" /> Fijos (se repiten)
              </dt>
              <dd>{formatearDinero(fv.fijosCentavos)}</dd>
            </div>
            <div>
              <dt>
                <span className="muestra serie-2" /> Variables
              </dt>
              <dd>{formatearDinero(fv.variablesCentavos)}</dd>
            </div>
          </dl>
          {fv.fijos.length > 0 ? (
            <p className="texto-tenue">
              Fijos: {fv.fijos.slice(0, 4).map((f) => `${f.nombre} ${formatearDinero(f.montoCentavos)}`).join(' · ')}
              {fv.fijos.length > 4 ? ` y ${fv.fijos.length - 4} más` : ''}.
            </p>
          ) : (
            <p className="texto-tenue">Marca «Se repite cada mes» al registrar un gasto para que cuente como fijo.</p>
          )}
          <p className="ayuda sin-margen">Fijos: lo que se repite cada mes y las cuotas de préstamos. Variables: el resto de tus gastos.</p>
        </section>
      )}

      {resultadoPlan && (
        <section className="grupo">
          <h2 className="cabecera-grupo">Tus deudas</h2>
          <button type="button" className="tarjeta tarjeta-accion" onClick={() => alAbrir({ tipo: 'plan' })}>
            <Insignia color="var(--primario)" simbolo="objetivo" solida />
            <span className="fila-texto">
              <span className="fila-titulo">Plan para salir de deudas</span>
              <span className="fila-detalle envolver">
                {resultadoPlan.alcanza && resultadoPlan.meses !== null
                  ? `Pagando ${formatearDinero(pagoPlan)} al mes terminas en ${mesCorto(sumarMeses(fechaHoy, resultadoPlan.meses - 1))} (${textoDuracion(resultadoPlan.meses)})`
                  : 'Calcula en qué orden pagar y cuándo terminas'}
              </span>
            </span>
            <span className="opcion-flecha" aria-hidden="true">
              <IconoFlecha />
            </span>
          </button>
        </section>
      )}

      {costoAnio.totalCentavos + costoAnio.avances.cantidad > 0 && (
        <section className="tarjeta">
          <h2>Lo que te cuestan tus deudas en {anio}</h2>
          <p className="monto-medio texto-peligro">{formatearDinero(costoAnio.totalCentavos)}</p>
          <p className="texto-tenue">
            {formatearDinero(costoAnio.interesesCentavos)} en intereses y {formatearDinero(costoAnio.comisionesCentavos)} en comisiones e IVA.
          </p>
          {costoAnio.porDeuda.length > 0 && (
            <ul className="categorias-barras">
              {costoAnio.porDeuda.map((d) => {
                const total = d.interesesCentavos + d.comisionesCentavos;
                return (
                  <li key={`${d.tipo}-${d.id}`}>
                    <span className="categoria-nombre">{d.nombre}</span>
                    <span className="categoria-total">{formatearDinero(total)}</span>
                    <span className="categoria-barra">
                      <span style={{ width: `${Math.max(3, (total / costoAnio.totalCentavos) * 100)}%`, background: 'var(--peligro)' }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {costoAnio.avances.cantidad > 0 && (
            <p className="aviso error">
              Este año sacaste {costoAnio.avances.cantidad} {costoAnio.avances.cantidad === 1 ? 'avance' : 'avances'} de efectivo por{' '}
              {formatearDinero(costoAnio.avances.montoCentavos)}. Cada avance cobra comisión más IVA y genera intereses desde el primer
              día, aunque pagues el saldo de contado.
            </p>
          )}
          <p className="ayuda sin-margen">
            Intereses, comisiones e IVA de tus tarjetas (categoría “Intereses y comisiones”) y la parte de intereses de las cuotas de
            préstamos.
          </p>
        </section>
      )}

      {abierta !== null && (
        <DetalleCategoria
          datos={datos}
          mes={mes}
          categoriaId={abierta || undefined}
          alCerrar={() => setAbierta(null)}
          alEditar={(m) => {
            setAbierta(null);
            alEditar(m);
          }}
        />
      )}

      {historial.length > 0 && (
        <section className="tarjeta">
          <h2>Deuda total por mes</h2>
          <GraficaDeuda puntos={historial} />
        </section>
      )}
    </>
  );
}

function DetalleCategoria({
  datos,
  mes,
  categoriaId,
  alCerrar,
  alEditar,
}: {
  datos: Datos;
  mes: string;
  categoriaId: string | undefined;
  alCerrar: () => void;
  alEditar: (m: Movimiento) => void;
}) {
  const c = categoriaId ? datos.mapaCategorias.get(categoriaId) : undefined;
  const existe = (id?: string) => (id ? datos.mapaCategorias.has(id) : false);
  const gastos = ordenarRecientes(
    datos.movimientos.filter(
      (m) => m.tipo === 'gasto' && mesDe(m.fecha) === mes && (categoriaId ? m.categoriaId === categoriaId : !existe(m.categoriaId)),
    ),
  );
  const total = gastos.reduce((t, m) => t + m.montoCentavos, 0);
  return (
    <Hoja titulo={`${c?.nombre ?? 'Sin categoría'} · ${nombreMes(mes).split(' ')[0].toLowerCase()}`} alCerrar={alCerrar}>
      <div className="formulario">
        <dl className="cifras dos">
          <div>
            <dt>Gastaste</dt>
            <dd>{formatearDinero(total)}</dd>
          </div>
          <div>
            <dt>{c?.limiteCentavos ? 'Límite del mes' : 'Movimientos'}</dt>
            <dd>{c?.limiteCentavos ? formatearDinero(c.limiteCentavos) : gastos.length}</dd>
          </div>
        </dl>
        {gastos.length === 0 ? (
          <p className="texto-tenue">No hay gastos en esta categoría este mes.</p>
        ) : (
          <ul className="lista">
            {gastos.map((m) => (
              <FilaMovimiento key={m.id} movimiento={m} datos={datos} mostrarFecha alTocar={alEditar} />
            ))}
          </ul>
        )}
      </div>
    </Hoja>
  );
}
