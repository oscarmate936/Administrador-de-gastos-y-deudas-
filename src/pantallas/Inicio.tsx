import type { Datos, Detalle } from '../datos';
import type { Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { proximosPagos, totalPorPagar } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, haceCuanto, hoy, mesDe, nombreMes } from '../lib/fechas';
import {
  calcularDisponible,
  gastosPorCategoria,
  ordenarRecientes,
  resumenDesdeUltimoPago,
} from '../lib/resumen';
import { estadoLimites } from '../lib/limites';
import { omitirRecurrente, pendientes, registrarRecurrente } from '../lib/recurrentes';
import { db } from '../db';
import { ListaProximos } from './Deudas';

/** Días hacia adelante que se apartan para pagos al calcular lo "libre". */
const DIAS_A_APARTAR = 15;

interface Props {
  datos: Datos;
  alAgregarIngreso: () => void;
  alAgregarGasto: () => void;
  alEditar: (m: Movimiento) => void;
  alVerTodos: () => void;
  alVerDeudas: () => void;
  alAbrirDeuda: (d: Detalle) => void;
  /** Días desde el último respaldo externo; null si nunca se hizo. */
  diasSinRespaldo: number | null;
  alRespaldar: () => void;
}

/** Cada cuántos días se recuerda hacer un respaldo. */
const DIAS_ENTRE_RESPALDOS = 7;

export function Inicio({ datos, alAgregarIngreso, alAgregarGasto, alEditar, alVerTodos, alVerDeudas, alAbrirDeuda, diasSinRespaldo, alRespaldar }: Props) {
  const { movimientos, mapaCategorias, tarjetas, prestamos } = datos;
  const fechaHoy = hoy();

  if (movimientos.length === 0 && tarjetas.length === 0 && prestamos.length === 0) {
    return (
      <section className="vacio">
        <div className="vacio-emoji" aria-hidden="true">
          💵
        </div>
        <h2>Empieza con tu último pago</h2>
        <p>
          Registra cuánto te pagaron y la app irá restando cada gasto que anotes, para que siempre
          sepas cuánto te queda.
        </p>
        <button type="button" className="boton primario" onClick={alAgregarIngreso}>
          Registrar mi pago
        </button>
        <button type="button" className="boton" onClick={alAgregarGasto}>
          Registrar un gasto
        </button>
        <button type="button" className="boton" onClick={alVerDeudas}>
          Agregar tarjetas y préstamos
        </button>
      </section>
    );
  }

  const disponible = calcularDisponible(movimientos);
  const periodo = resumenDesdeUltimoPago(movimientos, fechaHoy);
  const recientes = ordenarRecientes(movimientos).slice(0, 5);
  const proximos = proximosPagos(tarjetas, prestamos, movimientos, fechaHoy);
  const porApartar = totalPorPagar(proximos, DIAS_A_APARTAR);
  const limites = estadoLimites(movimientos, datos.categorias, mesDe(fechaHoy));
  const porConfirmar = pendientes(datos.recurrentes, fechaHoy);
  const libre = disponible - porApartar;

  // Por categoría cuenta todo lo comprado desde el pago, también con tarjeta.
  const comprasPeriodo = periodo
    ? movimientos.filter((m) => m.tipo === 'gasto' && m.fecha >= periodo.pago.fecha && m.fecha <= fechaHoy)
    : [];
  const porCategoria = gastosPorCategoria(comprasPeriodo, new Set(mapaCategorias.keys()));
  const mayor = porCategoria[0]?.totalCentavos ?? 0;
  const recibido = periodo ? periodo.pago.montoCentavos + periodo.otrosIngresosCentavos : 0;
  const porcentaje = recibido > 0 ? Math.min(100, Math.round((periodo!.gastadoCentavos / recibido) * 100)) : 0;

  return (
    <>
      <section className={disponible < 0 ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">Disponible</p>
        <p className="monto-grande">{formatearDinero(disponible)}</p>
        {porApartar > 0 ? (
          <dl className="cifras-heroe">
            <div>
              <dt>Pagos en {DIAS_A_APARTAR} días</dt>
              <dd>{formatearDinero(porApartar)}</dd>
            </div>
            <div>
              <dt>Libre después de pagar</dt>
              <dd className={libre < 0 ? 'heroe-alerta' : ''}>{formatearDinero(libre)}</dd>
            </div>
          </dl>
        ) : (
          <p className="nota-principal">
            {disponible < 0
              ? 'Ha salido más dinero del que has registrado como ingreso.'
              : 'Lo que has recibido menos lo que ha salido.'}
          </p>
        )}
      </section>

      {porConfirmar.length > 0 && (
        <section className="tarjeta">
          <h2>Por confirmar</h2>
          <p className="texto-tenue">Movimientos que se repiten cada mes y ya tocaban.</p>
          <ul className="lista-confirmar">
            {porConfirmar.map((r) => {
              const c = r.categoriaId ? mapaCategorias.get(r.categoriaId) : undefined;
              const titulo = r.nota || (r.tipo === 'ingreso' ? (r.esPago ? 'Mi pago' : 'Otro ingreso') : (c?.nombre ?? 'Gasto'));
              return (
                <li key={r.id}>
                  <span className="fila-emoji" style={{ background: 'var(--superficie-2)' }}>
                    {r.tipo === 'ingreso' ? '💵' : (c?.emoji ?? '🔁')}
                  </span>
                  <span className="fila-texto">
                    <span className="fila-titulo">{titulo}</span>
                    <span className="fila-detalle">
                      {r.tipo === 'ingreso' ? '+' : '−'}
                      {formatearDinero(r.montoCentavos)} · tocaba {fechaCorta(r.proxima)}
                    </span>
                  </span>
                  <span className="botones-confirmar">
                    <button type="button" className="boton chico" onClick={() => void omitirRecurrente(db, r)}>
                      Omitir
                    </button>
                    <button type="button" className="boton chico primario" onClick={() => void registrarRecurrente(db, r)}>
                      Registrar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(diasSinRespaldo === null || diasSinRespaldo >= DIAS_ENTRE_RESPALDOS) && (
        <section className="tarjeta aviso-tarjeta">
          <div className="aviso-tarjeta-texto">
            <h2>Haz un respaldo</h2>
            <p className="texto-tenue">
              Tus datos solo están en este celular.{' '}
              {diasSinRespaldo === null ? 'Aún no guardas ninguna copia fuera.' : `Tu último respaldo fue hace ${diasSinRespaldo} días.`}
            </p>
          </div>
          <button type="button" className="boton primario" onClick={alRespaldar}>
            Hacer respaldo
          </button>
        </section>
      )}

      {proximos.length > 0 && (
        <section className="tarjeta">
          <div className="cabecera-seccion">
            <h2>Próximos pagos</h2>
            <button type="button" className="enlace" onClick={alVerDeudas}>
              Ver deudas
            </button>
          </div>
          <ListaProximos datos={datos} alAbrir={alAbrirDeuda} limite={3} />
        </section>
      )}

      {limites.length > 0 && (
        <section className="tarjeta">
          <h2>Límites de {nombreMes(mesDe(fechaHoy)).split(' ')[0].toLowerCase()}</h2>
          <ul className="categorias-barras sin-borde">
            {limites.map((l) => (
              <li key={l.categoria.id}>
                <span className="categoria-nombre">
                  <span aria-hidden="true">{l.categoria.emoji}</span> {l.categoria.nombre}
                </span>
                <span className={l.porcentaje >= 100 ? 'categoria-total texto-peligro' : 'categoria-total'}>
                  {formatearDinero(l.gastadoCentavos)} <span className="texto-tenue">de {formatearDinero(l.limiteCentavos)}</span>
                </span>
                <span className="categoria-barra">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(3, l.porcentaje))}%`,
                      background: l.porcentaje >= 100 ? 'var(--peligro)' : l.porcentaje >= 80 ? 'var(--alerta)' : 'var(--primario)',
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {periodo ? (
        <section className="tarjeta">
          <h2>Desde tu último pago</h2>
          <p className="texto-tenue">
            Recibiste {formatearDinero(periodo.pago.montoCentavos)} el {fechaCorta(periodo.pago.fecha)} (
            {haceCuanto(periodo.pago.fecha, fechaHoy)})
            {periodo.otrosIngresosCentavos > 0 &&
              ` y ${formatearDinero(periodo.otrosIngresosCentavos)} en otros ingresos`}
            .
          </p>
          <div
            className="barra"
            role="progressbar"
            aria-valuenow={porcentaje}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Porcentaje gastado desde tu último pago"
          >
            <div
              className={porcentaje >= 90 ? 'barra-relleno alerta' : 'barra-relleno'}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <dl className="cifras">
            <div>
              <dt>Ha salido</dt>
              <dd>{formatearDinero(periodo.gastadoCentavos)}</dd>
            </div>
            <div>
              <dt>Del pago</dt>
              <dd>{porcentaje}%</dd>
            </div>
            <div>
              <dt>Por día</dt>
              <dd>{formatearDinero(periodo.promedioDiarioCentavos)}</dd>
            </div>
          </dl>
          {periodo.pagosDeudasCentavos > 0 && (
            <p className="ayuda sin-margen">
              Incluye {formatearDinero(periodo.pagosDeudasCentavos)} en pagos de tarjetas y préstamos.
            </p>
          )}

          {porCategoria.length > 0 && (
            <ul className="categorias-barras">
              {porCategoria.map(({ categoriaId, totalCentavos }) => {
                const c = categoriaId ? mapaCategorias.get(categoriaId) : undefined;
                return (
                  <li key={categoriaId ?? 'sin'}>
                    <span className="categoria-nombre">
                      <span aria-hidden="true">{c?.emoji ?? '📦'}</span> {c?.nombre ?? 'Sin categoría'}
                    </span>
                    <span className="categoria-total">{formatearDinero(totalCentavos)}</span>
                    <span className="categoria-barra">
                      <span
                        style={{
                          width: `${Math.max(3, (totalCentavos / mayor) * 100)}%`,
                          background: c?.color ?? 'var(--tenue)',
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="tarjeta">
          <h2>Aún no registras tu pago</h2>
          <p className="texto-tenue">
            Cuando te paguen, regístralo como “Mi pago” para ver cuánto llevas gastado desde ese día.
          </p>
          <button type="button" className="boton primario" onClick={alAgregarIngreso}>
            Registrar mi pago
          </button>
        </section>
      )}

      {recientes.length > 0 && (
        <section className="tarjeta">
          <div className="cabecera-seccion">
            <h2>Últimos movimientos</h2>
            <button type="button" className="enlace" onClick={alVerTodos}>
              Ver todos
            </button>
          </div>
          <ul className="lista">
            {recientes.map((m) => (
              <FilaMovimiento key={m.id} movimiento={m} datos={datos} mostrarFecha alTocar={alEditar} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
