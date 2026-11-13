import type { Datos, Detalle } from '../datos';
import { estadoPrestamo, estadoTarjeta, proximosPagos, totalPorPagar } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, mesCorto, textoFaltan } from '../lib/fechas';

interface Props {
  datos: Datos;
  alAbrir: (d: Detalle) => void;
  alNuevaTarjeta: () => void;
  alNuevoPrestamo: () => void;
  alImportar: () => void;
}

export function Deudas({ datos, alAbrir, alNuevaTarjeta, alNuevoPrestamo, alImportar }: Props) {
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
    estadosT.reduce((s, { e }) => s + Math.max(0, e.saldoCentavos), 0) +
    estadosP.reduce((s, { e }) => s + e.saldoCentavos, 0);
  const proximos = proximosPagos(tarjetas, prestamos, movimientos, fechaHoy);
  const vencidos = proximos.filter((p) => p.vencido);
  const porPagar30 = totalPorPagar(proximos, 30);

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

      {proximos.length > 0 && (
        <section className="tarjeta">
          <h2>Próximos pagos</h2>
          <ListaProximos datos={datos} alAbrir={alAbrir} limite={proximos.length} />
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
                      <span className="item-monto">{formatearDinero(e.saldoCentavos)}</span>
                    </span>
                    <span className="barra" aria-hidden="true">
                      <span className="barra-relleno" style={{ width: `${uso}%`, background: t.color }} />
                    </span>
                    <span className={e.vencido ? 'item-pie texto-peligro' : 'item-pie'}>
                      {e.pendienteCentavos > 0
                        ? `${e.vencido ? 'Vencido: ' : ''}pagar ${formatearDinero(e.pendienteCentavos)} ${e.vencido ? 'desde el' : 'antes del'} ${fechaCorta(e.fechaLimite)}`
                        : `Al día · corte el ${fechaCorta(e.proximoCorte)}`}
                      {' · '}disponible {formatearDinero(e.creditoDisponibleCentavos)}
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
          <button type="button" className="fila" onClick={() => alAbrir({ tipo: p.tipo, id: p.id })}>
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
