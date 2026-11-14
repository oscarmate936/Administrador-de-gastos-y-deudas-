import type { Datos } from '../datos';
import type { Movimiento, Tarjeta } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoAnterior } from '../componentes/Iconos';
import { estadoTarjeta, sumarMeses } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, mesCorto, textoFaltan } from '../lib/fechas';
import { ordenarRecientes } from '../lib/resumen';

interface Props {
  tarjeta: Tarjeta;
  datos: Datos;
  alVolver: () => void;
  alEditarTarjeta: () => void;
  alPagar: () => void;
  alComprar: () => void;
  alImportar: () => void;
  alEditarMovimiento: (m: Movimiento) => void;
}

export function DetalleTarjeta({ tarjeta: t, datos, alVolver, alEditarTarjeta, alPagar, alComprar, alImportar, alEditarMovimiento }: Props) {
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
        {e.planesCentavos > 0 && (
          <dl className="cifras-heroe">
            <div>
              <dt>Plazos y extrafinanciamiento</dt>
              <dd>{formatearDinero(e.planesCentavos)}</dd>
            </div>
            <div>
              <dt>Deuda total</dt>
              <dd>{formatearDinero(e.deudaTotalCentavos)}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Estado de cuenta</h2>
          <button type="button" className="enlace" onClick={alImportar}>
            Importar PDF
          </button>
        </div>
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
          {e.pagoMinimoCentavos !== null && (
            <div>
              <dt>Pago mínimo pendiente</dt>
              <dd>{e.pagoMinimoCentavos > 0 ? formatearDinero(e.pagoMinimoCentavos) : 'Cubierto ✓'}</dd>
            </div>
          )}
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
          {e.segunEstado
            ? `Cifras de tu estado de cuenta del ${fechaCorta(e.corteAnterior)}, menos los pagos que registraste después. Lo del próximo corte es un cálculo con lo que registras aquí.`
            : 'Son cálculos con lo que registras aquí. Compáralos con tu estado de cuenta, o importa el PDF para usar las cifras del banco.'}
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

      {e.planes.length > 0 && (
        <section className="tarjeta">
          <h2>Compras a plazos y extrafinanciamiento</h2>
          <ul className="lista-planes">
            {e.planes.map((p, i) => {
              const fin = sumarMeses(e.corteAnterior, p.restantes);
              return (
                <li key={i}>
                  <div className="item-cabecera">
                    <span className="item-nombre">
                      <strong>{p.descripcion}</strong>
                    </span>
                    <span className="item-monto">{formatearDinero(p.saldoCentavos)}</span>
                  </div>
                  <span className="barra" aria-hidden="true">
                    <span className="barra-relleno" style={{ width: `${Math.round((p.cuotaActual / p.cuotasTotales) * 100)}%` }} />
                  </span>
                  <span className="item-pie">
                    Cuota {p.cuotaActual} de {p.cuotasTotales} · {formatearDinero(p.cuotaCentavos)} al mes
                    {p.tasaMensual > 0 ? ` · ${p.tasaMensual}% mensual` : ' · sin intereses'} · última en {mesCorto(fin)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ayuda sin-margen">
            Lo que falta no está en el saldo de la tarjeta: cada corte se cobra una cuota. Cifras proyectadas desde tu último
            estado de cuenta.
          </p>
        </section>
      )}

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
