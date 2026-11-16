import { useRef, useState, type FormEvent } from 'react';
import { db, nuevoId, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { ahorroDelAbono, capitalDeCuota, capitalDelPago, estadoPrestamo, repartirPago, estadoTarjeta, interesMensual, textoDuracion } from '../lib/deudas';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { esFechaValida, fechaCorta, hoy } from '../lib/fechas';
import { Hoja } from './Hoja';

interface Props {
  /** Exactamente uno de los dos. */
  tarjeta?: Tarjeta;
  prestamo?: Prestamo;
  movimientos: Movimiento[];
  /** Si viene, se edita ese pago. */
  movimiento?: Movimiento;
  /** Al crear un pago de préstamo: empezar en "Abono extra". */
  extraInicial?: boolean;
  montoInicial?: number;
  fechaInicial?: string;
  alCerrar: () => void;
  /** Se llama con el pago guardado y, al editar, cómo estaba antes (para Deshacer). */
  alGuardar?: (m: Movimiento, anterior?: Movimiento) => void;
  /** Se llama con el pago eliminado (para Deshacer). */
  alEliminar?: (m: Movimiento) => void;
}

export function FormularioPago(props: Props) {
  const { tarjeta, prestamo, movimientos, movimiento, extraInicial, montoInicial, fechaInicial, alCerrar, alGuardar, alEliminar } = props;
  const fechaHoy = hoy();
  // Al editar, los cálculos parten de cómo estaba la deuda sin este pago.
  const otros = movimiento ? movimientos.filter((m) => m.id !== movimiento.id) : movimientos;
  const eTarjeta = tarjeta ? estadoTarjeta(tarjeta, otros, fechaHoy) : null;
  // Al editar una cuota, su reparto se calcula con el préstamo como estaba justo
  // antes de ese pago (sin los pagos posteriores).
  const previos =
    movimiento && prestamo
      ? otros.filter(
          (m) => m.prestamoId !== prestamo.id || m.fecha < movimiento.fecha || (m.fecha === movimiento.fecha && m.creadoEn < movimiento.creadoEn),
        )
      : otros;
  const ePrestamo = prestamo ? estadoPrestamo(prestamo, previos, fechaHoy) : null;
  // Lo más que puede ir a capital: lo que se debe sin contar este pago.
  const saldoPrestamo = prestamo ? estadoPrestamo(prestamo, otros, fechaHoy).saldoCentavos : 0;

  const [esExtra, setEsExtra] = useState(movimiento?.esExtra ?? extraInicial ?? false);
  const [monto, setMonto] = useState(() => {
    if (movimiento) return centavosATexto(movimiento.montoCentavos);
    if (montoInicial) return centavosATexto(montoInicial);
    if (ePrestamo && !extraInicial && ePrestamo.proximaCuotaCentavos > 0) return centavosATexto(ePrestamo.proximaCuotaCentavos);
    // La tarjeta que se paga con el mínimo propone el mínimo; las demás, el pago de contado.
    if (eTarjeta && tarjeta?.formaPago === 'minimo' && eTarjeta.minimoPendienteCentavos > 0) return centavosATexto(eTarjeta.minimoPendienteCentavos);
    if (eTarjeta && tarjeta?.formaPago === 'recomendado' && eTarjeta.recomendadoPendienteCentavos > 0) return centavosATexto(eTarjeta.recomendadoPendienteCentavos);
    if (eTarjeta && eTarjeta.pendienteCentavos > 0) return centavosATexto(eTarjeta.pendienteCentavos);
    return '';
  });
  // Vacío = usar el cálculo de la app; con texto = lo que escribió la persona.
  const [capital, setCapital] = useState(
    movimiento?.capitalCentavos !== undefined ? centavosATexto(movimiento.capitalCentavos) : '',
  );
  // Al editar se muestra el capital guardado; si cambia el monto o el tipo de
  // pago sin haber escrito otro capital, se vuelve a calcular.
  const [capitalEditado, setCapitalEditado] = useState(movimiento !== undefined);
  const capitalEscrito = useRef(false);
  const recalcularCapital = () => {
    if (!capitalEscrito.current) setCapitalEditado(false);
  };
  const [fecha, setFecha] = useState(movimiento?.fecha ?? fechaInicial ?? fechaHoy);
  const [nota, setNota] = useState(movimiento?.nota ?? '');
  const [error, setError] = useState('');
  // Fijo mientras el formulario está abierto: guardar dos veces seguidas no crea un duplicado.
  const [idNuevo] = useState(nuevoId);

  const montoCentavos = textoACentavos(monto);
  const fechaPago = esFechaValida(fecha) ? fecha : fechaHoy;
  // Si el banco dio el desglose de esta cuota (captura), su capital es exacto.
  const desglose =
    prestamo?.desgloseCuota && !movimiento && !esExtra && ePrestamo?.proximaFecha === prestamo.desgloseCuota.fecha && montoCentavos === prestamo.cuotaCentavos
      ? capitalDeCuota(prestamo, ePrestamo, montoCentavos, fechaPago)
      : null;
  const capitalCalculado =
    prestamo && montoCentavos ? Math.min(saldoPrestamo, desglose ?? capitalDelPago(prestamo, ePrestamo!, montoCentavos, esExtra, fechaPago)) : 0;
  const capitalCentavos = capitalEditado ? textoACentavos(capital) : capitalCalculado;
  const ahorro =
    prestamo && esExtra && montoCentavos
      ? ahorroDelAbono(prestamo, ePrestamo!, montoCentavos)
      : null;

  // Pagos parciales: se suman hasta completar la cuota (lib/deudas.ts, contarCuotas).
  let avisoCuota = '';
  if (prestamo && ePrestamo?.proximaFecha && !esExtra && !movimiento && montoCentavos) {
    const llevas = ePrestamo.parcialCentavos;
    const total = llevas + montoCentavos;
    const cuota = prestamo.cuotaCentavos;
    const completa = (llevas === 0 && montoCentavos >= cuota * 0.9) || total >= cuota - 100;
    if (!completa) {
      avisoCuota = `Pago parcial: ${llevas > 0 ? `con lo que ya pagaste (${formatearDinero(llevas)}) ` : ''}faltan ${formatearDinero(cuota - total)} para completar la cuota del ${fechaCorta(ePrestamo.proximaFecha)}.`;
    } else if (llevas > 0) {
      avisoCuota = `Con lo que ya pagaste (${formatearDinero(llevas)}) completas la cuota del ${fechaCorta(ePrestamo.proximaFecha)}.`;
    } else if (montoCentavos > cuota) {
      avisoCuota = `Pagas ${formatearDinero(montoCentavos - cuota)} más que la cuota: esa parte va a capital.`;
    }
  }

  /** Seguros de este pago: los ya guardados si no cambió nada; si no, el cálculo. */
  function cargosDelPago(capitalFinal: number): number {
    if (movimiento?.cargosCentavos !== undefined && movimiento.montoCentavos === montoCentavos && movimiento.capitalCentavos === capitalFinal) {
      return movimiento.cargosCentavos;
    }
    return repartirPago(prestamo!, ePrestamo!, montoCentavos!, false, fechaPago, capitalFinal).cargosCentavos;
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!montoCentavos) {
      setError('Escribe un monto mayor que cero, por ejemplo 50.00');
      return;
    }
    if (!esFechaValida(fecha)) {
      setError('Elige una fecha válida.');
      return;
    }
    if (fecha > hoy()) {
      setError('Registra el pago cuando lo hagas: la fecha no puede ser futura.');
      return;
    }
    if (prestamo) {
      if (capitalCentavos === null) {
        setError('El abono a capital no es un monto válido.');
        return;
      }
      if (capitalCentavos > montoCentavos) {
        setError('El abono a capital no puede ser mayor que el pago.');
        return;
      }
      if (capitalCentavos > saldoPrestamo) {
        setError(`El abono a capital no puede pasar del saldo (${formatearDinero(saldoPrestamo)}).`);
        return;
      }
    }
    const pago: Movimiento = {
      id: movimiento?.id ?? idNuevo,
      tipo: 'pago',
      montoCentavos,
      fecha,
      tarjetaId: tarjeta?.id,
      prestamoId: prestamo?.id,
      capitalCentavos: prestamo ? (capitalCentavos ?? 0) : undefined,
      esExtra: prestamo ? esExtra : undefined,
      cargosCentavos: prestamo && !esExtra ? cargosDelPago(capitalCentavos ?? 0) : undefined,
      cuotaCentavos: prestamo && !esExtra ? (movimiento?.cuotaCentavos ?? prestamo.cuotaCentavos) : undefined,
      esDevolucion: tarjeta && movimiento?.esDevolucion ? true : undefined,
      nota: nota.trim(),
      creadoEn: movimiento?.creadoEn ?? Date.now(),
    };
    await db.movimientos.put(pago);
    alGuardar?.(pago, movimiento);
    alCerrar();
  }

  // Sin pregunta de confirmación: el aviso que aparece ofrece Deshacer.
  async function eliminar() {
    if (!movimiento) return;
    await db.movimientos.delete(movimiento.id);
    alEliminar?.(movimiento);
    alCerrar();
  }

  const nombre = tarjeta?.nombre ?? prestamo?.nombre ?? '';
  const cambiarMonto = (texto: string) => {
    setMonto(texto);
    setError('');
    recalcularCapital();
  };
  const cambiarTipo = (extra: boolean) => {
    setEsExtra(extra);
    setError('');
    recalcularCapital();
  };

  return (
    <Hoja titulo={`${movimiento ? 'Editar pago' : 'Pago'} · ${nombre}`} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        {prestamo && (
          <div className="segmentos" role="group" aria-label="Tipo de pago">
            <button type="button" aria-pressed={!esExtra} onClick={() => cambiarTipo(false)}>
              Cuota del mes
            </button>
            <button type="button" aria-pressed={esExtra} onClick={() => cambiarTipo(true)}>
              Abono extra
            </button>
          </div>
        )}

        <label className="campo-monto">
          <span className="solo-lectores">Monto del pago</span>
          <span aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={monto}
            aria-invalid={error !== ''}
            onChange={(e) => cambiarMonto(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {eTarjeta && (
          <div className="chips">
            {eTarjeta.minimoPendienteCentavos > 0 && eTarjeta.minimoPendienteCentavos < eTarjeta.pendienteCentavos && (
              <button type="button" className="chip" onClick={() => cambiarMonto(centavosATexto(eTarjeta.minimoPendienteCentavos))}>
                {eTarjeta.minimoEsEstimado ? 'Mínimo aprox.' : 'Pago mínimo'} {formatearDinero(eTarjeta.minimoPendienteCentavos)}
              </button>
            )}
            {eTarjeta.recomendadoAparte &&
              eTarjeta.recomendadoPendienteCentavos > eTarjeta.minimoPendienteCentavos &&
              eTarjeta.recomendadoPendienteCentavos < eTarjeta.pendienteCentavos && (
                <button type="button" className="chip" onClick={() => cambiarMonto(centavosATexto(eTarjeta.recomendadoPendienteCentavos))}>
                  Recomendado {formatearDinero(eTarjeta.recomendadoPendienteCentavos)}
                </button>
              )}
            {eTarjeta.pendienteCentavos > 0 && (
              <button type="button" className="chip" onClick={() => cambiarMonto(centavosATexto(eTarjeta.pendienteCentavos))}>
                Pago de contado {formatearDinero(eTarjeta.pendienteCentavos)}
              </button>
            )}
            {eTarjeta.pendienteCentavos === 0 &&
              eTarjeta.proximoEstadoCentavos > 0 &&
              eTarjeta.proximoEstadoCentavos !== eTarjeta.saldoCentavos && (
                <button type="button" className="chip" onClick={() => cambiarMonto(centavosATexto(eTarjeta.proximoEstadoCentavos))}>
                  Próximo estado {formatearDinero(eTarjeta.proximoEstadoCentavos)}
                </button>
              )}
            {eTarjeta.saldoCentavos > 0 && eTarjeta.saldoCentavos !== eTarjeta.pendienteCentavos && (
              <button type="button" className="chip" onClick={() => cambiarMonto(centavosATexto(eTarjeta.saldoCentavos))}>
                Saldo total {formatearDinero(eTarjeta.saldoCentavos)}
              </button>
            )}
          </div>
        )}

        {eTarjeta && tarjeta && eTarjeta.pendienteCentavos > 0 && montoCentavos !== null && montoCentavos > 0 && (
          <ConsecuenciaPago
            pendienteCentavos={eTarjeta.pendienteCentavos}
            minimoCentavos={eTarjeta.minimoPendienteCentavos}
            minimoEsEstimado={eTarjeta.minimoEsEstimado}
            pagoCentavos={montoCentavos}
            tasaAnual={tarjeta.tasaAnual}
          />
        )}

        {prestamo && (
          <label className="campo">
            <span>Abono a capital (lo que baja tu saldo)</span>
            <input
              type="text"
              inputMode="decimal"
              value={capitalEditado ? capital : centavosATexto(capitalCalculado)}
              onChange={(e) => {
                capitalEscrito.current = true;
                setCapital(e.target.value);
                setCapitalEditado(true);
                setError('');
              }}
            />
            <span className="ayuda sin-margen">
              {montoCentavos && capitalCentavos !== null && capitalCentavos <= montoCentavos
                ? `Intereses y otros cargos: ${formatearDinero(montoCentavos - capitalCentavos)}. `
                : ''}
              {desglose !== null && !capitalEditado
                ? 'Es el capital del desglose del banco para esta cuota.'
                : 'Es un cálculo aproximado; si tu comprobante dice otra cantidad, cámbiala.'}
            </span>
          </label>
        )}

        {avisoCuota && <p className="aviso">{avisoCuota}</p>}

        {ahorro && ahorro.mesesMenos + ahorro.interesesAhorradosCentavos > 0 && (
          <p className="aviso">
            Con este abono terminas {ahorro.mesesMenos > 0 ? `${textoDuracion(ahorro.mesesMenos)} antes` : 'en el mismo plazo'} y
            ahorras cerca de {formatearDinero(ahorro.interesesAhorradosCentavos)} en intereses.
          </p>
        )}

        <label className="campo">
          <span>Fecha</span>
          <input type="date" value={fecha} max={fechaHoy} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {tarjeta && esFechaValida(fecha) && fecha <= tarjeta.fechaSaldo && (
          <p className="aviso alerta">
            La deuda de {tarjeta.nombre} que tiene la app es la del {fechaCorta(tarjeta.fechaSaldo)}: un pago de ese día o de antes
            ya está descontado, así que no la baja. Sí se resta de tu disponible.
          </p>
        )}

        <label className="campo">
          <span>Nota (opcional)</span>
          <input type="text" value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} />
        </label>

        <p className="ayuda sin-margen">Este pago se resta de tu disponible.</p>

        <div className="acciones">
          {movimiento && (
            <button type="button" className="boton peligro" onClick={eliminar}>
              Eliminar
            </button>
          )}
          <button type="submit" className="boton primario">
            Guardar pago
          </button>
        </div>
      </form>
    </Hoja>
  );
}

/** Qué pasa con lo que queda sin pagar del estado de cuenta. */
function ConsecuenciaPago({
  pendienteCentavos,
  minimoCentavos,
  pagoCentavos,
  tasaAnual,
  minimoEsEstimado,
}: {
  pendienteCentavos: number;
  minimoCentavos: number;
  minimoEsEstimado: boolean;
  pagoCentavos: number;
  tasaAnual?: number;
}) {
  if (pagoCentavos >= pendienteCentavos) {
    return <p className="aviso">Pagas el estado de cuenta completo: no te cobran intereses por él.</p>;
  }
  const queda = pendienteCentavos - pagoCentavos;
  // Con un mínimo aproximado solo se avisa si el pago queda claramente por debajo.
  const noCubreMinimo = minimoCentavos > 0 && pagoCentavos < minimoCentavos * (minimoEsEstimado ? 0.8 : 1);
  const intereses = tasaAnual ? interesMensual(queda, tasaAnual) : null;
  return (
    <p className={noCubreMinimo ? 'aviso error' : 'aviso alerta'}>
      Quedan {formatearDinero(queda)} sin pagar del estado de cuenta.{' '}
      {intereses !== null
        ? `Te cobrarían al menos ${formatearDinero(intereses)} de intereses en el próximo corte.`
        : 'Generan intereses; agrega la tasa de la tarjeta para calcular cuánto.'}
      {noCubreMinimo &&
        ` No cubre el pago mínimo (${formatearDinero(minimoCentavos)}${minimoEsEstimado ? ' aprox.' : ''}): también te cobrarían mora.`}
    </p>
  );
}
