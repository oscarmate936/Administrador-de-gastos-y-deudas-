import type { Categoria, Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, haceCuanto, hoy } from '../lib/fechas';
import {
  calcularDisponible,
  gastosPorCategoria,
  ordenarRecientes,
  resumenDesdeUltimoPago,
} from '../lib/resumen';

interface Props {
  movimientos: Movimiento[];
  categorias: Map<string, Categoria>;
  alAgregarIngreso: () => void;
  alAgregarGasto: () => void;
  alEditar: (m: Movimiento) => void;
  alVerTodos: () => void;
}

export function Inicio({ movimientos, categorias, alAgregarIngreso, alAgregarGasto, alEditar, alVerTodos }: Props) {
  const fechaHoy = hoy();
  const disponible = calcularDisponible(movimientos);
  const periodo = resumenDesdeUltimoPago(movimientos, fechaHoy);
  const recientes = ordenarRecientes(movimientos).slice(0, 5);

  if (movimientos.length === 0) {
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
      </section>
    );
  }

  const porCategoria = periodo ? gastosPorCategoria(periodo.gastos, new Set(categorias.keys())) : [];
  const mayor = porCategoria[0]?.totalCentavos ?? 0;
  const recibido = periodo ? periodo.pago.montoCentavos + periodo.otrosIngresosCentavos : 0;
  const porcentaje = recibido > 0 ? Math.min(100, Math.round((periodo!.gastadoCentavos / recibido) * 100)) : 0;

  return (
    <>
      <section className={disponible < 0 ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">Disponible</p>
        <p className="monto-grande">{formatearDinero(disponible)}</p>
        <p className="nota-principal">
          {disponible < 0
            ? 'Has gastado más de lo que has registrado como ingreso.'
            : 'Lo que has recibido menos lo que has gastado.'}
        </p>
      </section>

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
              <dt>Gastado</dt>
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

          {porCategoria.length > 0 && (
            <ul className="categorias-barras">
              {porCategoria.map(({ categoriaId, totalCentavos }) => {
                const c = categoriaId ? categorias.get(categoriaId) : undefined;
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

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Últimos movimientos</h2>
          <button type="button" className="enlace" onClick={alVerTodos}>
            Ver todos
          </button>
        </div>
        <ul className="lista">
          {recientes.map((m) => (
            <FilaMovimiento key={m.id} movimiento={m} categorias={categorias} mostrarFecha alTocar={alEditar} />
          ))}
        </ul>
      </section>
    </>
  );
}
