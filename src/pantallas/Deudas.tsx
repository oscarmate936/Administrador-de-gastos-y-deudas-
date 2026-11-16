import { useState } from 'react';
import type { Datos, Detalle } from '../datos';
import type { Prestamo, Tarjeta } from '../db';
import { Insignia, Simbolo } from '../componentes/Simbolo';
import type { AjustesPlan } from '../lib/ajustes';
import { costosEntre } from '../lib/costos';
import { estadoPrestamo, estadoTarjeta, proximosPagos, sumarMeses, totalPorPagar } from '../lib/deudas';
import { deudasParaPlan, simularPlan, sumaMinimos } from '../lib/plan';
import { progresoDeudas } from '../lib/progreso';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, mesCorto, mesDe } from '../lib/fechas';

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
  // Sin elección propia se muestra la pestaña que tiene algo (préstamos si no hay tarjetas).
  const [elegida, setVista] = useState<'tarjetas' | 'prestamos' | null>(null);
  const vista = elegida ?? (tarjetas.length === 0 && prestamos.length > 0 ? 'prestamos' : 'tarjetas');

  if (tarjetas.length === 0 && prestamos.length === 0) {
    return (
      <section className="vacio">
        <Insignia color="var(--primario)" simbolo="tarjeta" />
        <h2>Registra tus tarjetas y préstamos</h2>
        <p>
          La app te dirá cuánto debes, cuánto pagar para no generar intereses, cuándo vence cada pago y cuánto tiempo te falta
          para terminar.
        </p>
        <button type="button" className="boton primario" onClick={alNuevaTarjeta}>
          Agregar tarjeta de crédito
        </button>
        <button type="button" className="boton" onClick={alImportar}>
          <Simbolo nombre="documento" tamano={18} /> Importar estado de cuenta (PDF)
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
    estadosT.reduce((s, { e }) => s + e.deudaTotalCentavos, 0) + estadosP.reduce((s, { e }) => s + e.saldoCentavos, 0);
  const interesesEstimados = estadosT.reduce((s, { e }) => s + e.interesEstimadoCentavos, 0);
  const proximos = proximosPagos(tarjetas, prestamos, movimientos, fechaHoy);
  const vencidos = proximos.filter((p) => p.vencido);
  const porPagar30 = totalPorPagar(proximos, 30);
  const costoMes = costosEntre(datos, `${mesDe(fechaHoy)}-01`, fechaHoy);
  const progreso = progresoDeudas(datos.historial, deudaTotal);
  const deudasPlan = deudasParaPlan(datos, fechaHoy);
  const pagoPlan = plan.pagoMensualCentavos ?? Math.ceil((sumaMinimos(deudasPlan) * 1.25) / 1000) * 1000;
  const resultado = deudasPlan.length > 0 ? simularPlan(deudasPlan, pagoPlan, plan.metodo) : null;
  const meta = resultado?.alcanza && resultado.meses !== null ? mesCorto(sumarMeses(fechaHoy, resultado.meses - 1)) : null;

  return (
    <>
      <section className="tarjeta resumen-deudas">
        <p className="etiqueta">Debes en total</p>
        <p className="monto-grande">{formatearDinero(deudaTotal)}</p>
        <dl className="cifras">
          <div>
            <dt>Vence en 30 días</dt>
            <dd>{formatearDinero(porPagar30)}</dd>
          </div>
          <div>
            <dt>Intereses este mes</dt>
            <dd className={costoMes.totalCentavos > 0 ? 'texto-peligro' : ''}>{formatearDinero(costoMes.totalCentavos)}</dd>
          </div>
        </dl>
        {interesesEstimados > 0 && (
          <p className="ayuda sin-margen">
            Además, tus tarjetas suman unos {formatearDinero(interesesEstimados)} de intereses estimados por lo que quedó sin pagar. Ya
            están dentro de lo que debes.
          </p>
        )}
        {progreso && progreso.pagadoCentavos > 0 && (
          <div className="progreso-deudas">
            <div className="progreso-cabecera">
              <span>Camino a «libre de deudas»</span>
              <strong>{progreso.porcentaje}% pagado</strong>
            </div>
            <div
              className="barra"
              role="progressbar"
              aria-label="Camino a libre de deudas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progreso.porcentaje}
            >
              <div className="barra-relleno" style={{ width: `${Math.max(2, progreso.porcentaje)}%` }} />
              {[25, 50, 75].map((h) => (
                <span key={h} className={progreso.porcentaje >= h ? 'marca-hito alcanzada' : 'marca-hito'} style={{ left: `${h}%` }} />
              ))}
            </div>
            <p className="ayuda sin-margen">
              Bajaste {formatearDinero(progreso.pagadoCentavos)} desde lo más alto que debiste ({formatearDinero(progreso.maximoCentavos)}).
              {meta && ` Con tu plan, sin deudas en ${meta}.`}
            </p>
          </div>
        )}
        {vencidos.length > 0 && (
          <p className="aviso error">
            {vencidos.length === 1 ? `El pago de ${vencidos[0].nombre} está vencido.` : `Tienes ${vencidos.length} pagos vencidos.`}
          </p>
        )}
      </section>

      <div className="acciones-lista">
        <button type="button" className="boton" onClick={() => alAbrir({ tipo: 'calendario' })}>
          <Simbolo nombre="calendario" tamano={18} /> Calendario
        </button>
        <button type="button" className="boton" onClick={() => alAbrir({ tipo: 'plan' })}>
          <Simbolo nombre="objetivo" tamano={18} /> Plan para salir
        </button>
      </div>

      <div className="segmentos" role="group" aria-label="Tipo de deuda">
        <button type="button" aria-pressed={vista === 'tarjetas'} onClick={() => setVista('tarjetas')}>
          Tarjetas · {tarjetas.length}
        </button>
        <button type="button" aria-pressed={vista === 'prestamos'} onClick={() => setVista('prestamos')}>
          Préstamos · {prestamos.length}
        </button>
      </div>

      {vista === 'tarjetas' ? (
        <>
          {estadosT.length === 0 && <p className="sin-datos">No tienes tarjetas registradas.</p>}
          <ul className="plasticos">
            {estadosT.map(({ t, e }) => (
              <li key={t.id}>
                <Plastico tarjeta={t} alTocar={() => alAbrir({ tipo: 'tarjeta', id: t.id })}>
                  <span className="plastico-cuerpo">
                    <span className="plastico-cifra">
                      <span className="plastico-etiqueta">Debes</span>
                      <span className="plastico-monto">{formatearDinero(e.deudaTotalCentavos)}</span>
                    </span>
                    <span className={e.vencido ? 'pastilla peligro' : porPagar(t, e) > 0 && e.diasParaLimite <= 5 ? 'pastilla alerta' : 'pastilla'}>
                      {e.vencido
                        ? `Vencido ${fechaCorta(e.fechaLimite)}`
                        : porPagar(t, e) > 0
                          ? `${t.formaPago === 'minimo' ? 'Mínimo' : 'Pagar'} antes del ${fechaCorta(e.fechaLimite)}`
                          : `Corte el ${fechaCorta(e.proximoCorte)}`}
                    </span>
                  </span>
                  <span className="plastico-barra" aria-hidden="true">
                    <span style={{ width: `${uso(t, e.saldoCentavos)}%` }} />
                  </span>
                  <span className="plastico-pie">
                    {t.limiteCentavos > 0 ? `Usas el ${Math.round(uso(t, e.saldoCentavos))}% · ` : ''}
                    {conLimite(t) ? `disponible ${formatearDinero(e.creditoDisponibleCentavos)}` : 'sin límite registrado'}
                    {e.planesCentavos > 0 && ` · ${formatearDinero(e.planesCentavos)} en plazos`}
                  </span>
                </Plastico>
              </li>
            ))}
          </ul>
          <div className="acciones-lista">
            <button type="button" className="boton" onClick={alNuevaTarjeta}>
              <Simbolo nombre="tarjeta" tamano={18} /> Agregar tarjeta
            </button>
            <button type="button" className="boton" onClick={alImportar}>
              <Simbolo nombre="documento" tamano={18} /> Importar PDF
            </button>
          </div>
        </>
      ) : (
        <>
          {estadosP.length === 0 && <p className="sin-datos">No tienes préstamos registrados.</p>}
          <ul className="lista tarjeta prestamos">
            {estadosP.map(({ p, e }) => (
              <FilaPrestamo key={p.id} prestamo={p} estado={e} alTocar={() => alAbrir({ tipo: 'prestamo', id: p.id })} />
            ))}
          </ul>
          <div className="acciones-lista">
            <button type="button" className="boton" onClick={alNuevoPrestamo}>
              <Simbolo nombre="prestamo" tamano={18} /> Agregar préstamo
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** Lo que falta pagar de este estado de cuenta según cómo se paga la tarjeta; 0 si ya pasó el plazo y no hay mora. */
const porPagar = (t: Tarjeta, e: ReturnType<typeof estadoTarjeta>) => {
  if (e.diasParaLimite < 0 && !e.vencido) return 0;
  return t.formaPago === 'minimo' ? e.minimoPendienteCentavos : e.pendienteCentavos;
};

/** Se sabe el crédito disponible: hay límite o lo dio el banco en el estado de cuenta. */
export const conLimite = (t: Tarjeta) => t.limiteCentavos > 0 || t.ultimoEstado?.disponibleCentavos !== undefined;

const uso = (t: Tarjeta, saldo: number) => (t.limiteCentavos > 0 ? Math.min(100, Math.max(0, (saldo / t.limiteCentavos) * 100)) : 0);

/** Tarjeta dibujada con el color que elegiste para ella. */
export function Plastico({ tarjeta: t, alTocar, children }: { tarjeta: Tarjeta; alTocar?: () => void; children: React.ReactNode }) {
  const contenido = (
    <>
      <span className="plastico-cabecera">
        <span className="plastico-nombre">{t.nombre}</span>
        <span className="plastico-numero">{t.ultimos4 && !t.nombre.includes(t.ultimos4) ? `···${t.ultimos4}` : t.banco}</span>
      </span>
      {children}
    </>
  );
  const estilo = { '--color-tarjeta': t.color } as React.CSSProperties;
  return alTocar ? (
    <button type="button" className="plastico" style={estilo} onClick={alTocar}>
      {contenido}
    </button>
  ) : (
    <div className="plastico" style={estilo}>
      {contenido}
    </div>
  );
}

function FilaPrestamo({ prestamo: p, estado: e, alTocar }: { prestamo: Prestamo; estado: ReturnType<typeof estadoPrestamo>; alTocar: () => void }) {
  return (
    <li>
      <button type="button" className="fila fila-prestamo" onClick={alTocar}>
        <Insignia color="var(--primario)" simbolo="prestamo" />
        <span className="fila-texto">
          <span className="fila-titulo">{p.nombre}</span>
          <span className={e.vencido ? 'fila-detalle texto-peligro' : 'fila-detalle'}>
            {e.proximaFecha
              ? `${e.vencido ? 'Cuota vencida' : 'Cuota'} de ${formatearDinero(e.proximaCuotaCentavos)} el ${fechaCorta(e.proximaFecha)}`
              : 'Pagado por completo'}
          </span>
          <span className="barra" aria-hidden="true">
            <span className="barra-relleno" style={{ width: `${Math.round(e.avance * 100)}%` }} />
          </span>
          <span className="fila-detalle">
            {Math.round(e.avance * 100)}% pagado{e.fechaFin ? ` · terminas en ${mesCorto(e.fechaFin)}` : ''}
            {p.acreedor ? ` · ${p.acreedor}` : ''}
          </span>
        </span>
        <span className="fila-monto">{formatearDinero(e.saldoCentavos)}</span>
      </button>
    </li>
  );
}
