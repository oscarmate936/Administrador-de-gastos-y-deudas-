import { useState } from 'react';
import type { Datos, Detalle } from '../datos';
import { IconoAnterior } from '../componentes/Iconos';
import { Insignia } from '../componentes/Simbolo';
import { Ayuda } from '../componentes/Ayuda';
import { guardarAjuste, type AjustesPlan } from '../lib/ajustes';
import { sumarMeses, textoDuracion } from '../lib/deudas';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { hoy, mesCorto } from '../lib/fechas';
import { deudasParaPlan, simularPlan, sumaMinimos, type Metodo } from '../lib/plan';

interface Props {
  datos: Datos;
  ajustes: AjustesPlan;
  alVolver: () => void;
  alAbrir: (d: Detalle) => void;
}

/** Pagos extra que se comparan: $20, $50 y $100 al mes. */
const EXTRAS = [2000, 5000, 10000];

/** Redondea hacia arriba a los siguientes $10. */
const redondear = (centavos: number) => Math.ceil(centavos / 1000) * 1000;

export function PlanDeudas({ datos, ajustes, alVolver, alAbrir }: Props) {
  const fechaHoy = hoy();
  const deudas = deudasParaPlan(datos, fechaHoy);
  const minimos = sumaMinimos(deudas);
  const [texto, setTexto] = useState(() =>
    centavosATexto(ajustes.pagoMensualCentavos ?? redondear(minimos * 1.25)),
  );
  const metodo = ajustes.metodo;
  const pago = textoACentavos(texto);

  const cambiarPago = (valor: string) => {
    setTexto(valor);
    const c = textoACentavos(valor);
    if (c) void guardarAjuste('plan', { pagoMensualCentavos: c });
  };
  const cambiarMetodo = (m: Metodo) => void guardarAjuste('plan', { metodo: m });

  const cabecera = (
    <div className="barra-detalle">
      <button type="button" className="boton-icono" onClick={alVolver} aria-label="Volver">
        <IconoAnterior />
      </button>
      <h2>Plan para salir de deudas</h2>
    </div>
  );

  if (deudas.length === 0) {
    return (
      <>
        {cabecera}
        <section className="tarjeta">
          <h2>No tienes deudas con saldo</h2>
          <p className="texto-tenue">Cuando registres tarjetas o préstamos con saldo, aquí verás el mejor orden para pagarlos.</p>
        </section>
      </>
    );
  }

  const plan = pago ? simularPlan(deudas, pago, metodo) : null;
  const soloMinimos = simularPlan(deudas, minimos, metodo, { reinvertir: false });
  const nombre = (id: string) => deudas.find((d) => d.id === id)!;
  const colorDe = (a: { tipo: 'tarjeta' | 'prestamo'; id: string }) =>
    a.tipo === 'tarjeta' ? (datos.tarjetas.find((t) => t.id === a.id)?.color ?? 'var(--tenue)') : 'var(--primario)';
  const fechaFin = (mes: number) => mesCorto(sumarMeses(fechaHoy, mes - 1));
  const sinTasa = deudas.filter((d) => !d.tasaConocida);
  const estimados = deudas.filter((d) => d.minimoEstimado);

  return (
    <>
      {cabecera}

      <section className="tarjeta">
        <label className="campo">
          <span>¿Cuánto puedes pagar al mes entre todas tus deudas?</span>
          <span className="campo-dinero">
            <span aria-hidden="true">$</span>
            <input type="text" inputMode="decimal" value={texto} onChange={(e) => cambiarPago(e.target.value)} />
          </span>
          <span className="ayuda sin-margen">Los pagos mínimos suman {formatearDinero(minimos)} al mes.</span>
        </label>
        <div className="segmentos" role="group" aria-label="Método">
          <button type="button" aria-pressed={metodo === 'avalancha'} onClick={() => cambiarMetodo('avalancha')}>
            Avalancha
          </button>
          <button type="button" aria-pressed={metodo === 'bola'} onClick={() => cambiarMetodo('bola')}>
            Bola de nieve
          </button>
        </div>
        <p className="ayuda sin-margen">
          <Ayuda termino={metodo === 'avalancha' ? 'avalancha' : 'bola de nieve'} />{' '}
          {metodo === 'avalancha'
            ? 'Recomendado: lo extra va primero a la deuda con la tasa más alta. Es la forma de pagar menos intereses.'
            : 'Lo extra va primero a la deuda más pequeña. Pagas algo más de intereses, pero terminas deudas más rápido y eso motiva.'}
        </p>
      </section>

      {!plan ? (
        <p className="aviso error">Escribe un monto válido.</p>
      ) : !plan.alcanza ? (
        <p className="aviso error">
          Con {formatearDinero(pago!)} no alcanzas a cubrir los pagos mínimos ({formatearDinero(minimos)}). Si pagas menos del
          mínimo te cobran recargos por mora y afecta tu historial.
        </p>
      ) : plan.meses === null ? (
        <p className="aviso error">Con ese monto la deuda no baja: los intereses crecen más rápido. Prueba con más.</p>
      ) : (
        <>
          <section className="tarjeta-principal">
            <p className="etiqueta">Sin deudas en</p>
            <p className="monto-grande">{fechaFin(plan.meses)}</p>
            <p className="nota-principal">
              {textoDuracion(plan.meses)} · pagarías cerca de {formatearDinero(plan.interesesCentavos)} en intereses
            </p>
          </section>

          <section className="grupo">
            <h2 className="cabecera-grupo">¿Y si pagas un poco más?</h2>
            <ul className="lista tarjeta">
              {EXTRAS.map((extra) => {
                const otro = simularPlan(deudas, pago! + extra, metodo);
                const meses = otro.meses !== null ? plan.meses! - otro.meses : 0;
                const ahorro = plan.interesesCentavos - otro.interesesCentavos;
                return (
                  <li key={extra}>
                    <button type="button" className="fila" onClick={() => cambiarPago(centavosATexto(pago! + extra))}>
                      <Insignia color="var(--primario)" simbolo="ingreso" />
                      <span className="fila-texto">
                        <span className="fila-titulo">+{formatearDinero(extra)} al mes</span>
                        <span className="fila-detalle envolver">
                          {meses > 0
                            ? `Terminas ${textoDuracion(meses)} antes y ahorras cerca de ${formatearDinero(ahorro)}`
                            : `Ahorras cerca de ${formatearDinero(ahorro)} en intereses`}
                        </span>
                      </span>
                      <span className="fila-monto-sub">Usar</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="tarjeta">
            <h2>Comparado con pagar solo los mínimos</h2>
            {soloMinimos.meses === null ? (
              <p className="texto-tenue">Pagando solo los mínimos tardarías más de 50 años: los intereses no dejan bajar la deuda.</p>
            ) : (
              <dl className="cifras">
                <div>
                  <dt>Solo mínimos</dt>
                  <dd>{textoDuracion(soloMinimos.meses)}</dd>
                </div>
                <div>
                  <dt>Terminas antes</dt>
                  <dd className="positivo">{soloMinimos.meses > plan.meses ? textoDuracion(soloMinimos.meses - plan.meses) : '—'}</dd>
                </div>
                <div>
                  <dt>Ahorras</dt>
                  <dd className="positivo">
                    {formatearDinero(Math.max(0, soloMinimos.interesesCentavos - plan.interesesCentavos))}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className="tarjeta">
            <h2>Este mes paga</h2>
            <ul className="lista">
              {plan.primerMes.map(({ id, montoCentavos }) => {
                const d = nombre(id);
                return (
                  <li key={id}>
                    <button type="button" className="fila" onClick={() => alAbrir(d.abrir)}>
                      <Insignia color={colorDe(d.abrir)} simbolo={d.tipo === 'tarjeta' ? 'tarjeta' : 'prestamo'} />
                      <span className="fila-texto">
                        <span className="fila-titulo">{d.nombre}</span>
                        <span className="fila-detalle envolver">
                          {montoCentavos > d.minimoCentavos
                            ? `Mínimo ${formatearDinero(d.minimoCentavos)} + ${formatearDinero(montoCentavos - d.minimoCentavos)} extra`
                            : 'Solo el mínimo'}
                        </span>
                      </span>
                      <span className="fila-monto">{formatearDinero(montoCentavos)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="tarjeta">
            <h2>Orden en que terminas</h2>
            <ol className="orden-plan">
              {plan.fines.map(({ id, mes }) => {
                const d = nombre(id);
                return (
                  <li key={id}>
                    <span className="fila-texto">
                      <span className="fila-titulo">{d.nombre}</span>
                      <span className="fila-detalle envolver">
                        {formatearDinero(d.saldoCentavos)} · {d.tasaConocida ? `${d.tasaAnual}% anual` : 'tasa sin registrar'}
                      </span>
                    </span>
                    <span className="orden-fecha">{fechaFin(mes)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}

      {(sinTasa.length > 0 || estimados.length > 0) && (
        <section className="tarjeta">
          <h2>Para que el plan sea más exacto</h2>
          <ul className="notas-plan">
            {sinTasa.map((d) => (
              <li key={`t-${d.id}`}>
                <strong>{d.nombre}</strong>: registra su tasa de interés (Editar en su detalle). Sin ella se calcula como si no
                cobrara intereses.
              </li>
            ))}
            {estimados.map((d) => (
              <li key={`m-${d.id}`}>
                <strong>{d.nombre}</strong>: el pago mínimo es un cálculo de la app. Importa su estado de cuenta para usar el del
                banco.
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
