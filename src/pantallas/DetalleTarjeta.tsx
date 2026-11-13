import type { Datos } from '../datos';
import type { Movimiento, Tarjeta } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoAnterior } from '../componentes/Iconos';
import { estadoTarjeta } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, textoFaltan } from '../lib/fechas';
import { ordenarRecientes } from '../lib/resumen';

interface Props {
  tarjeta: Tarjeta;
  datos: Datos;
  alVolver: () => void;
  alEditarTarjeta: () => void;
  alPagar: () => void;
  alComprar: () => void;
  alEditarMovimiento: (m: Movimiento) => void;
}

export function DetalleTarjeta({ tarjeta: t, datos, alVolver, alEditarTarjeta, alPagar, alComprar, alEditarMovimiento }: Props) {
  const e = estadoTarjeta(t, datos.movimientos, hoy());
  const movs = ordenarRecientes(datos.movimientos.filter((m) => m.tarjetaId === t.id));

  return (
    <>
      <div className="barra-detalle">
        <button type="button" className="boton-icono" onClick={alVolver} aria-label="Volver a Deudas">
          <IconoAnterior />
        </button>
        <h2>{t.nombre}</h2>
        <button type="button" className="enlace" onClick={alEditarTarjeta}>
          Editar
        </button>
      </div>

      <section className="tarjeta-principal">
        <p className="etiqueta">{t.banco || 'Tarjeta de crédito'} · saldo actual</p>
        <p className="monto-grande">{formatearDinero(e.saldoCentavos)}</p>
        <p className="nota-principal">
          Crédito disponible {formatearDinero(e.creditoDisponibleCentavos)} de {formatearDinero(t.limiteCentavos)}
        </p>
      </section>

      <section className="tarjeta">
        <h2>Estado de cuenta</h2>
        {e.vencido && (
          <p className="aviso error">
            El pago de contado venció el {fechaCorta(e.fechaLimite)}. Págalo cuanto antes para evitar intereses y cargos por mora.
          </p>
        )}
        <dl className="datos-lista">
          <div>
            <dt>Último corte</dt>
            <dd>{fechaCorta(e.corteAnterior)}</dd>
          </div>
          <div>
            <dt>Último día de pago</dt>
            <dd>
              {fechaCorta(e.fechaLimite)}
              {e.pendienteCentavos > 0 && <span className={e.vencido ? 'texto-peligro' : 'texto-tenue'}> · {textoFaltan(e.diasParaLimite)}</span>}
            </dd>
          </div>
          <div>
            <dt>Pago de contado pendiente</dt>
            <dd className={e.pendienteCentavos > 0 ? '' : 'positivo'}>
              {e.pendienteCentavos > 0 ? formatearDinero(e.pendienteCentavos) : 'Pagado ✓'}
            </dd>
          </div>
          <div>
            <dt>Próximo corte</dt>
            <dd>{fechaCorta(e.proximoCorte)}</dd>
          </div>
          <div>
            <dt>Saldría en ese estado de cuenta</dt>
            <dd>
              {formatearDinero(e.proximoEstadoCentavos)} <span className="texto-tenue">· pagar antes del {fechaCorta(e.proximaFechaLimite)}</span>
            </dd>
          </div>
        </dl>
        <p className="ayuda sin-margen">
          Son cálculos con lo que registras aquí. Compáralos con tu estado de cuenta: si no coinciden, puede faltar alguna
          compra, cargo o pago.
        </p>
        <div className="acciones">
          <button type="button" className="boton" onClick={alComprar}>
            Nueva compra
          </button>
          <button type="button" className="boton primario" onClick={alPagar}>
            Registrar pago
          </button>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Compras y pagos</h2>
        {movs.length === 0 ? (
          <p className="texto-tenue">Aún no hay compras ni pagos registrados en esta tarjeta.</p>
        ) : (
          <ul className="lista">
            {movs.map((m) => (
              <FilaMovimiento key={m.id} movimiento={m} datos={datos} mostrarFecha alTocar={alEditarMovimiento} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
