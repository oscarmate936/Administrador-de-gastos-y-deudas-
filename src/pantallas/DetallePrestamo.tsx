import { useState } from 'react';
import { ActualizarPrestamo } from '../componentes/ActualizarPrestamo';
import { BotonCapturaPrestamo } from '../componentes/LecturaCaptura';
import type { CapturaPrestamo } from '../lib/ocr/prestamo';
import type { Datos } from '../datos';
import type { Movimiento, Prestamo } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { Simbolo } from '../componentes/Simbolo';
import { Ayuda } from '../componentes/Ayuda';
import { IconoAnterior } from '../componentes/Iconos';
import { ahorroPorAbono, estadoPrestamo, textoDuracion } from '../lib/deudas';
import { formatearDinero, textoACentavos } from '../lib/dinero';
import { fechaCorta, hoy, mesCorto, textoFaltan } from '../lib/fechas';
import { ordenarRecientes } from '../lib/resumen';

interface Props {
  prestamo: Prestamo;
  datos: Datos;
  alVolver: () => void;
  alEditarPrestamo: () => void;
  alPagarCuota: () => void;
  alAbonoExtra: () => void;
  alEditarMovimiento: (m: Movimiento) => void;
}

export function DetallePrestamo({ prestamo: p, datos, alVolver, alEditarPrestamo, alPagarCuota, alAbonoExtra, alEditarMovimiento }: Props) {
  const [simulado, setSimulado] = useState('');
  const [captura, setCaptura] = useState<CapturaPrestamo | null>(null);
  const e = estadoPrestamo(p, datos.movimientos, hoy());
  const pagos = ordenarRecientes(datos.movimientos.filter((m) => m.prestamoId === p.id));
  const abono = textoACentavos(simulado);
  const ahorro = abono ? ahorroPorAbono(e.saldoCentavos, p.tasaAnual, p.cuotaCentavos, Math.min(abono, e.saldoCentavos)) : null;
  const pagado = e.saldoCentavos === 0;

  return (
    <>
      <div className="barra-detalle">
        <button type="button" className="boton-icono" onClick={alVolver} aria-label="Volver a Deudas">
          <IconoAnterior />
        </button>
        <h2>{p.nombre}</h2>
        <button type="button" className="enlace" onClick={alEditarPrestamo}>
          Editar
        </button>
      </div>

      <section className={e.vencido ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">{p.acreedor || 'Préstamo'} · saldo pendiente</p>
        <p className="monto-grande">{formatearDinero(e.saldoCentavos)}</p>
        <div className="barra barra-clara" aria-hidden="true">
          <div className="barra-relleno" style={{ width: `${Math.round(e.avance * 100)}%` }} />
        </div>
        <p className="nota-principal">
          {Math.round(e.avance * 100)}% pagado
          {e.abonadoCentavos > 0 && ` · ${formatearDinero(e.abonadoCentavos)} abonados a capital desde que lo registraste`}
        </p>
      </section>

      <section className="tarjeta">
        {pagado ? (
          <>
            <h2>¡Préstamo pagado!</h2>
            <p className="texto-tenue">Ya no debes nada de este préstamo.</p>
          </>
        ) : (
          <>
            <h2>Próxima cuota</h2>
            {e.vencido && e.proximaFecha && (
              <p className="aviso error">La cuota del {fechaCorta(e.proximaFecha)} está vencida. Págala cuanto antes para evitar cargos por mora.</p>
            )}
            <dl className="datos-lista">
              <div>
                <dt>Fecha</dt>
                <dd>
                  {e.proximaFecha && fechaCorta(e.proximaFecha)}
                  <span className={e.vencido ? 'texto-peligro' : 'texto-tenue'}> · {textoFaltan(e.diasParaPago)}</span>
                </dd>
              </div>
              <div>
                <dt>Monto</dt>
                <dd>{formatearDinero(e.proximaCuotaCentavos)}</dd>
              </div>
              <div>
                <dt>Tiempo restante</dt>
                <dd>
                  {e.proyeccion
                    ? `${textoDuracion(e.proyeccion.meses)} (${e.proyeccion.meses} ${e.proyeccion.meses === 1 ? 'cuota' : 'cuotas'})`
                    : 'La cuota no cubre los intereses'}
                </dd>
              </div>
              {e.fechaFin && (
                <div>
                  <dt>Terminas en</dt>
                  <dd>{mesCorto(e.fechaFin)}</dd>
                </div>
              )}
              {e.proyeccion && e.proyeccion.interesesCentavos > 0 && (
                <div>
                  <dt>Intereses por pagar (aprox.)</dt>
                  <dd>{formatearDinero(e.proyeccion.interesesCentavos)}</dd>
                </div>
              )}
              <div>
                <dt>Cuotas pagadas en la app</dt>
                <dd>{e.cuotasPagadas}</dd>
              </div>
              <div>
                <dt>Tasa anual <Ayuda termino="tasa anual" /></dt>
                <dd>{p.tasaAnual > 0 ? `${p.tasaAnual}%` : 'Sin registrar'}</dd>
              </div>
            </dl>
            <div className="acciones">
              <button type="button" className="boton" onClick={alAbonoExtra}>
                Abono extra
              </button>
              <button type="button" className="boton primario" onClick={alPagarCuota}>
                Pagar cuota
              </button>
            </div>
          </>
        )}
      </section>

      {!pagado && (
        <section className="tarjeta">
          <h2>¿Y si abonas extra? <Ayuda termino="abono extra" /></h2>
          <label className="campo">
            <span>Abono extra a capital</span>
            <input type="text" inputMode="decimal" placeholder="0.00" value={simulado} onChange={(ev) => setSimulado(ev.target.value)} />
          </label>
          {abono && ahorro ? (
            <p className="aviso">
              {ahorro.mesesMenos > 0
                ? `Terminarías ${textoDuracion(ahorro.mesesMenos)} antes`
                : 'Terminarías en el mismo plazo'}
              {ahorro.interesesAhorradosCentavos > 0 && ` y te ahorrarías cerca de ${formatearDinero(ahorro.interesesAhorradosCentavos)} en intereses`}
              , pagando la misma cuota.
            </p>
          ) : (
            <p className="texto-tenue">Escribe un monto para ver cuánto tiempo e intereses te ahorrarías.</p>
          )}
        </section>
      )}

      <section className="tarjeta">
        <h2>Actualizar con el banco</h2>
        <p className="texto-tenue">
          Toma una captura del detalle del préstamo en la app de tu banco y la app ajusta saldo, cuota, tasa y fecha sin
          borrar tus pagos.
        </p>
        <BotonCapturaPrestamo
          texto={
            <>
              <Simbolo nombre="camara" tamano={18} /> Actualizar con una captura
            </>
          }
          alLeer={setCaptura}
        />
      </section>
      {captura && <ActualizarPrestamo prestamo={p} movimientos={datos.movimientos} captura={captura} alCerrar={() => setCaptura(null)} />}

      <section className="tarjeta">
        <h2>Pagos</h2>
        {pagos.length === 0 ? (
          <p className="texto-tenue">Aún no hay pagos registrados en este préstamo.</p>
        ) : (
          <ul className="lista">
            {pagos.map((m) => (
              <FilaMovimiento key={m.id} movimiento={m} datos={datos} mostrarFecha alTocar={alEditarMovimiento} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
