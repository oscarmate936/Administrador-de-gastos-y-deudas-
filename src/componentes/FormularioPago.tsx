import { useState, type FormEvent } from 'react';
import { db, nuevoId, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { ahorroPorAbono, capitalSugerido, estadoPrestamo, estadoTarjeta, textoDuracion } from '../lib/deudas';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { esFechaValida, hoy } from '../lib/fechas';
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
  alCerrar: () => void;
}

export function FormularioPago({ tarjeta, prestamo, movimientos, movimiento, extraInicial, alCerrar }: Props) {
  const fechaHoy = hoy();
  // Al editar, los cálculos parten de cómo estaba la deuda sin este pago.
  const otros = movimiento ? movimientos.filter((m) => m.id !== movimiento.id) : movimientos;
  const eTarjeta = tarjeta ? estadoTarjeta(tarjeta, otros, fechaHoy) : null;
  const ePrestamo = prestamo ? estadoPrestamo(prestamo, otros, fechaHoy) : null;
  const saldoPrestamo = ePrestamo?.saldoCentavos ?? 0;

  const [esExtra, setEsExtra] = useState(movimiento?.esExtra ?? extraInicial ?? false);
  const [monto, setMonto] = useState(() => {
    if (movimiento) return centavosATexto(movimiento.montoCentavos);
    if (ePrestamo && !extraInicial && ePrestamo.proximaCuotaCentavos > 0) return centavosATexto(ePrestamo.proximaCuotaCentavos);
    if (eTarjeta && eTarjeta.pendienteCentavos > 0) return centavosATexto(eTarjeta.pendienteCentavos);
    return '';
  });
  // Vacío = usar el cálculo de la app; con texto = lo que escribió la persona.
  const [capital, setCapital] = useState(
    movimiento?.capitalCentavos !== undefined ? centavosATexto(movimiento.capitalCentavos) : '',
  );
  const [capitalEditado, setCapitalEditado] = useState(movimiento !== undefined);
  const [fecha, setFecha] = useState(movimiento?.fecha ?? fechaHoy);
  const [nota, setNota] = useState(movimiento?.nota ?? '');
  const [error, setError] = useState('');

  const montoCentavos = textoACentavos(monto);
  const capitalCalculado =
    prestamo && montoCentavos ? capitalSugerido(saldoPrestamo, prestamo.tasaAnual, montoCentavos, esExtra) : 0;
  const capitalCentavos = capitalEditado ? textoACentavos(capital) : capitalCalculado;
  const ahorro =
    prestamo && esExtra && montoCentavos
      ? ahorroPorAbono(saldoPrestamo, prestamo.tasaAnual, prestamo.cuotaCentavos, Math.min(montoCentavos, saldoPrestamo))
      : null;

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
    await db.movimientos.put({
      id: movimiento?.id ?? nuevoId(),
      tipo: 'pago',
      montoCentavos,
      fecha,
      tarjetaId: tarjeta?.id,
      prestamoId: prestamo?.id,
      capitalCentavos: prestamo ? (capitalCentavos ?? 0) : undefined,
      esExtra: prestamo ? esExtra : undefined,
      nota: nota.trim(),
      creadoEn: movimiento?.creadoEn ?? Date.now(),
    });
    alCerrar();
  }

  async function eliminar() {
    if (!movimiento) return;
    if (!window.confirm('¿Eliminar este pago? La deuda vuelve a subir por ese monto.')) return;
    await db.movimientos.delete(movimiento.id);
    alCerrar();
  }

  const nombre = tarjeta?.nombre ?? prestamo?.nombre ?? '';
  const cambiarMonto = (texto: string) => {
    setMonto(texto);
    setError('');
  };

  return (
    <Hoja titulo={`${movimiento ? 'Editar pago' : 'Pago'} · ${nombre}`} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        {prestamo && (
          <div className="segmentos" role="group" aria-label="Tipo de pago">
            <button type="button" aria-pressed={!esExtra} onClick={() => setEsExtra(false)}>
              Cuota del mes
            </button>
            <button type="button" aria-pressed={esExtra} onClick={() => setEsExtra(true)}>
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

        {prestamo && (
          <label className="campo">
            <span>Abono a capital (lo que baja tu saldo)</span>
            <input
              type="text"
              inputMode="decimal"
              value={capitalEditado ? capital : centavosATexto(capitalCalculado)}
              onChange={(e) => {
                setCapital(e.target.value);
                setCapitalEditado(true);
                setError('');
              }}
            />
            <span className="ayuda sin-margen">
              {montoCentavos && capitalCentavos !== null && capitalCentavos <= montoCentavos
                ? `Intereses y otros cargos: ${formatearDinero(montoCentavos - capitalCentavos)}. `
                : ''}
              Es un cálculo aproximado; si tu comprobante dice otra cantidad, cámbiala.
            </span>
          </label>
        )}

        {ahorro && ahorro.mesesMenos + ahorro.interesesAhorradosCentavos > 0 && (
          <p className="aviso">
            Con este abono terminas {ahorro.mesesMenos > 0 ? `${textoDuracion(ahorro.mesesMenos)} antes` : 'en el mismo plazo'} y
            ahorras cerca de {formatearDinero(ahorro.interesesAhorradosCentavos)} en intereses.
          </p>
        )}

        <label className="campo">
          <span>Fecha</span>
          <input type="date" value={fecha} max="2099-12-31" onChange={(e) => setFecha(e.target.value)} />
        </label>

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
