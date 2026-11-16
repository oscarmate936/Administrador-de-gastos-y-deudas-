import { db, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';
import { apartadoPorForma } from '../lib/fondo';
import { Hoja } from './Hoja';

interface Props {
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  movimientos: Movimiento[];
  hoy: string;
  /** Día del próximo sueldo: se aparta lo que vence antes. */
  hasta: string;
  /** Lo que se aparta ahora en total (tarjetas y préstamos). */
  porApartar: number;
  alCerrar: () => void;
}

/** Texto corto de cómo se cuentan las tarjetas, para la tarjeta de Inicio. */
export function textoComoPagas(tarjetas: Tarjeta[]): string {
  const minimo = tarjetas.filter((t) => t.formaPago === 'minimo').length;
  if (minimo === 0) return tarjetas.length === 1 ? 'De tu tarjeta cuento el pago total' : 'De tus tarjetas cuento el pago total';
  if (minimo === tarjetas.length) return tarjetas.length === 1 ? 'De tu tarjeta cuento solo el mínimo' : 'De tus tarjetas cuento solo el mínimo';
  return 'De unas tarjetas cuento el total y de otras el mínimo';
}

/**
 * Elegir, tarjeta por tarjeta, si se paga el total del estado de cuenta o solo
 * el mínimo. Eso es lo que la app aparta de tu dinero para los próximos pagos.
 */
export function ComoPagas({ tarjetas, prestamos, movimientos, hoy, hasta, porApartar, alCerrar }: Props) {
  const antesDe = `antes de tu sueldo del ${fechaCorta(hasta)}`;
  const cambiar = (ids: string[], formaPago: 'total' | 'minimo') =>
    void db.transaction('rw', db.tarjetas, async () => {
      for (const id of ids) await db.tarjetas.update(id, { formaPago });
    });
  const todasMinimo = tarjetas.every((t) => t.formaPago === 'minimo');
  return (
    <Hoja titulo="¿Cuánto pagas de cada tarjeta?" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">
          De tu sueldo, la app aparta lo que vas a pagar {antesDe}. Si no te alcanza para pagar todo, elige «El mínimo»: lo
          demás sigue como deuda de la tarjeta y genera intereses.
        </p>
        {tarjetas.length > 1 && (
          <button type="button" className="boton" onClick={() => cambiar(tarjetas.map((t) => t.id), todasMinimo ? 'total' : 'minimo')}>
            {todasMinimo ? 'Pagar el total de todas' : 'Pagar solo el mínimo de todas'}
          </button>
        )}
        <ul className="lista grupo-borde como-pagas">
          {tarjetas.map((t) => {
            const a = apartadoPorForma(t, movimientos, hoy, hasta);
            const nada = a.totalCentavos === 0 && a.minimoCentavos === 0;
            return (
              <li key={t.id}>
                <span className="fila-titulo">{t.nombre}</span>
                <div className="segmentos" role="group" aria-label={`Cuánto pagas de ${t.nombre}`}>
                  <button type="button" aria-pressed={t.formaPago !== 'minimo'} onClick={() => cambiar([t.id], 'total')}>
                    El total{nada ? '' : ` · ${formatearDinero(a.totalCentavos)}`}
                  </button>
                  <button type="button" aria-pressed={t.formaPago === 'minimo'} onClick={() => cambiar([t.id], 'minimo')}>
                    El mínimo{nada ? '' : ` · ${formatearDinero(a.minimoCentavos)}${a.minimoAprox ? ' aprox.' : ''}`}
                  </button>
                </div>
                {nada && <span className="fila-detalle">No tiene pagos {antesDe}.</span>}
              </li>
            );
          })}
        </ul>
        {prestamos.length > 0 && (
          <p className="ayuda sin-margen">De los préstamos se aparta la cuota completa: es lo mínimo que se paga cada mes.</p>
        )}
        <p className="aviso">Apartas {formatearDinero(porApartar)} para tus deudas {antesDe}.</p>
        <div className="acciones">
          <button type="button" className="boton primario" onClick={alCerrar}>
            Listo
          </button>
        </div>
      </div>
    </Hoja>
  );
}
