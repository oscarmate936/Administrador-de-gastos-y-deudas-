import type { Datos, Detalle } from '../datos';
import { costosEntre } from '../lib/costos';
import { estadoPrestamo, estadoTarjeta, proximosPagos, sumarMeses, textoDuracion, totalPorPagar } from '../lib/deudas';
import { deudasParaPlan, simularPlan, sumaMinimos } from '../lib/plan';
import type { AjustesPlan } from '../lib/ajustes';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, mesCorto, mesDe, nombreMes, textoFaltan } from '../lib/fechas';

interface Props {
  datos: Datos;
  alAbrir: (d: Detalle) => void;
  alNuevaTarjeta: () => void;
  alNuevoPrestamo: () => void;
  alImportar: () => void;
  plan: AjustesPlan;
}

export function Deudas({ datos, alAbrir, alNuevaTarjeta, alNuevoPrestamo, alImportar, plan }: Props) {
  const { tarjetas, prestamos, movimientos } = datos;
  const fechaHoy = hoy();

  if (tarjetas.length === 0 && prestamos.length === 0) {
    return (
      <section className="vacio">
        <div className="vacio-emoji" aria-hidden="true">
          💳
        </div>
        <h2>Registra tus tarjetas y préstamos</h2>
        <p>
          La app te dirá cuánto debes, cuánto pagar para no generar intereses, cuándo vence cada pago y
          cuánto tiempo te falta para terminar.
        </p>
        <button type="button" className="boton primario" onClick={alNuevaTarjeta}>
          Agregar tarjeta de crédito
        </button>
        <button type="button" className="boton" onClick={alImportar}>
          📄 Importar estado de cuenta (PDF)
        </button>
        <button type="button" className="boton" onClick={alNuevoPrestamo}>
          Agregar préstamo
        </button>
      </section>
    );
  }

  const estadosT = tarjetas.map((t) => ({ t, e: estadoTarjeta(t, movimientos, fechaHoy) }));
  const estadosP = prestamos.map((p) => ({ p, e: estadoPrestamo(p, movimientos, fechaHoy) }));
  const deudaTotal =
    estadosT.reduce((s, { e }) => s + e.deudaTotalCentavos, 0) +
    estadosP.reduce((s, { e }) => s + e.saldoCentavos, 0);
  const proximos = proximosPagos(tarjetas, prestamos, movimientos, fechaHoy);
  const vencidos = proximos.filter((p) => p.vencido);
  const porPagar30 = totalPorPagar(proximos, 30);

  const mes = mesDe(fechaHoy);
  const costoMes = costosEntre(datos, `${mes}-01`, fechaHoy);
  const costoAnio = costosEntre(datos, `${fechaHoy.slice(0, 4)}-01-01`, fechaHoy);
  const deudasPlan = deudasParaPlan(datos, fechaHoy);
  const pagoPlan = plan.pagoMensualCentavos ?? Math.ceil((sumaMinimos(deudasPlan) * 1.25) / 1000) * 1000;
  const resultadoPlan = deudasPlan.length > 0 ? simularPlan(deudasPlan, pagoPlan, plan.metodo) : null;

  return (
    <>
      <section className={vencidos.length > 0 ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">Deuda total</p>
        <p className="monto-grande">{formatearDinero(deudaTotal)}</p>
        <p className="nota-principal">
          {vencidos.length > 0
            ? `Tienes ${vencidos.length === 1 ? 'un pago vencido' : `${vencidos.length} pagos vencidos`}.`
            : porPagar30 > 0
              ? `${formatearDinero(porPagar30)} por pagar en los próximos 30 días.`
              : 'Nada por pagar en los próximos 30 días.'}
        </p>
      </section>

      <button type="button" className="boton boton-importar" onClick={alImportar}>
        📄 Importar estado de cuenta (PDF)
      </button>

      {resultadoPlan && (
        <button type="button" className="tarjeta tarjeta-accion" onClick={() => alAbrir({ tipo: 'plan' })}>
          <span className="tarjeta-accion-icono" aria-hidden="true">
            🎯
          </span>
          <span className="fila-texto">
            <span className="fila-titulo">Plan para salir de deudas</span>
            <span className="fila-detalle">
              {resultadoPlan.alcanza && resultadoPlan.meses !== null
                ? `Pagando ${formatearDinero(pagoPlan)} al mes terminas en ${mesCorto(sumarMeses(fechaHoy, resultadoPlan.meses - 1))} (${textoDuracion(resultadoPlan.meses)})`
                : 'Calcula en qué orden pagar y cuándo terminas'}
            </span>
          </span>
        </button>
      )}

      {proximos.length > 0 && (
        <section className="tarjeta">
          <h2>Próximos pagos</h2>
          <ListaProximos datos={datos} alAbrir={alAbrir} limite={proximos.length} />
        </section>
      )}

      {costoAnio.totalCentavos + costoAnio.avances.cantidad > 0 && (
        <section className="tarjeta">
          <h2>Lo que te cuestan tus deudas</h2>
          <dl className="cifras">
            <div>
              <dt>{nombreMes(mes).split(' ')[0]}</dt>
              <dd className={costoMes.totalCentavos > 0 ? 'texto-peligro' : ''}>{formatearDinero(costoMes.totalCentavos)}</dd>
            </div>
            <div>
              <dt>En {fechaHoy.slice(0, 4)}</dt>
              <dd className="texto-peligro">{formatearDinero(costoAnio.totalCentavos)}</dd>
            </div>
            <div>
              <dt>Comisiones</dt>
              <dd>{formatearDinero(costoAnio.comisionesCentavos)}</dd>
            </div>
          </dl>
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
              Este año sacaste {costoAnio.avances.cantidad} {costoAnio.avances.cantidad === 1 ? 'avance' : 'avances'} de efectivo
              por {formatearDinero(costoAnio.avances.montoCentavos)}. Cada avance cobra comisión más IVA y genera intereses desde el
              primer día, aunque pagues el saldo de contado.
            </p>
          )}
          <p className="ayuda sin-margen">
            Intereses, comisiones e IVA de tus tarjetas (categoría “Intereses y comisiones”) y la parte de intereses de las cuotas
            de préstamos.
          </p>
        </section>
      )}

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Tarjetas de crédito</h2>
          <button type="button" className="enlace" onClick={alNuevaTarjeta}>
            Agregar
          </button>
        </div>
        {estadosT.length === 0 ? (
          <p className="texto-tenue">No tienes tarjetas registradas.</p>
        ) : (
          <ul className="items-deuda">
            {estadosT.map(({ t, e }) => {
              const uso = t.limiteCentavos > 0 ? Math.min(100, Math.max(0, (e.saldoCentavos / t.limiteCentavos) * 100)) : 0;
              return (
                <li key={t.id}>
                  <button type="button" className="item-deuda" onClick={() => alAbrir({ tipo: 'tarjeta', id: t.id })}>
                    <span className="item-cabecera">
                      <span className="punto" style={{ background: t.color }} aria-hidden="true" />
                      <span className="item-nombre">
                        <strong>{t.nombre}</strong>
                        {t.banco && <span className="texto-tenue"> · {t.banco}</span>}
                      </span>
                      <span className="item-monto">{formatearDinero(e.deudaTotalCentavos)}</span>
                    </span>
                    <span className="barra" aria-hidden="true">
                      <span className="barra-relleno" style={{ width: `${uso}%`, background: t.color }} />
                    </span>
                    <span className={e.vencido ? 'item-pie texto-peligro' : 'item-pie'}>
                      {e.pendienteCentavos > 0
                        ? `${e.vencido ? 'Vencido: ' : ''}pagar ${formatearDinero(e.pendienteCentavos)} ${e.vencido ? 'desde el' : 'antes del'} ${fechaCorta(e.fechaLimite)}`
                        : `Al día · corte el ${fechaCorta(e.proximoCorte)}`}
                      {' · '}disponible {formatearDinero(e.creditoDisponibleCentavos)}
                      {e.planesCentavos > 0 && ` · incluye ${formatearDinero(e.planesCentavos)} en plazos`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Préstamos</h2>
          <button type="button" className="enlace" onClick={alNuevoPrestamo}>
            Agregar
          </button>
        </div>
        {estadosP.length === 0 ? (
          <p className="texto-tenue">No tienes préstamos registrados.</p>
        ) : (
          <ul className="items-deuda">
            {estadosP.map(({ p, e }) => (
              <li key={p.id}>
                <button type="button" className="item-deuda" onClick={() => alAbrir({ tipo: 'prestamo', id: p.id })}>
                  <span className="item-cabecera">
                    <span className="punto" style={{ background: 'var(--primario)' }} aria-hidden="true" />
                    <span className="item-nombre">
                      <strong>{p.nombre}</strong>
                      {p.acreedor && <span className="texto-tenue"> · {p.acreedor}</span>}
                    </span>
                    <span className="item-monto">{formatearDinero(e.saldoCentavos)}</span>
                  </span>
                  <span className="barra" aria-hidden="true">
                    <span className="barra-relleno" style={{ width: `${Math.round(e.avance * 100)}%` }} />
                  </span>
                  <span className={e.vencido ? 'item-pie texto-peligro' : 'item-pie'}>
                    {e.proximaFecha
                      ? `${e.vencido ? 'Cuota vencida' : 'Cuota'} de ${formatearDinero(e.proximaCuotaCentavos)} el ${fechaCorta(e.proximaFecha)}${e.fechaFin ? ` · terminas en ${mesCorto(e.fechaFin)}` : ''}`
                      : 'Pagado por completo'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

interface PropsLista {
  datos: Datos;
  alAbrir: (d: Detalle) => void;
  limite: number;
}

/** Lista de próximos pagos de tarjetas y préstamos. También se usa en Inicio. */
export function ListaProximos({ datos, alAbrir, limite }: PropsLista) {
  const lista = proximosPagos(datos.tarjetas, datos.prestamos, datos.movimientos, hoy()).slice(0, limite);
  return (
    <ul className="lista">
      {lista.map((p) => (
        <li key={`${p.tipo}-${p.id}`}>
          <button type="button" className="fila" onClick={() => alAbrir({ tipo: p.tipo, id: p.id } as Detalle)}>
            <span className="fila-emoji" style={{ background: 'var(--superficie-2)' }}>
              {p.tipo === 'tarjeta' ? '💳' : '🏦'}
            </span>
            <span className="fila-texto">
              <span className="fila-titulo">{p.nombre}</span>
              <span className={p.vencido ? 'fila-detalle texto-peligro' : 'fila-detalle'}>
                {fechaCorta(p.fecha)} · {textoFaltan(p.dias)}
                {p.estimado && ' · estimado'}
              </span>
            </span>
            <span className="fila-monto">{formatearDinero(p.montoCentavos)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
