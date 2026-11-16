import { db, type Movimiento, type Prestamo, type Tarjeta } from '../db';
import { formatearDinero } from '../lib/dinero';
import { apartadoPorForma } from '../lib/fondo';
import type { FormaPago } from '../lib/deudas';
import { AYUDA_FORMA, SegmentosForma } from './FormaDePago';
import { Hoja } from './Hoja';

interface Props {
  tarjetas: Tarjeta[];
  prestamos: Prestamo[];
  movimientos: Movimiento[];
  hoy: string;
  /** Día del próximo sueldo: se aparta lo que vence antes. */
  hasta: string;
  /** «tu sueldo del 18 dic», para los textos. */
  proximo: string;
  /** Lo que se aparta ahora en total (tarjetas y préstamos). */
  porApartar: number;
  alCerrar: () => void;
}

/** Texto corto de cómo se cuentan las tarjetas, para la tarjeta de Inicio. */
export function textoComoPagas(tarjetas: Tarjeta[]): string {
  const formas = new Set(tarjetas.map((t) => t.formaPago ?? 'total'));
  const tu = tarjetas.length === 1 ? 'De tu tarjeta' : 'De tus tarjetas';
  if (formas.size > 1) return 'Cada tarjeta con su forma de pago';
  if (formas.has('minimo')) return `${tu} cuento solo el mínimo`;
  if (formas.has('recomendado')) return `${tu} cuento lo recomendado`;
  return `${tu} cuento el pago total`;
}

/**
 * Elegir, tarjeta por tarjeta, si se paga el total del estado de cuenta, lo
 * recomendado o solo el mínimo. Eso es lo que la app aparta de tu sueldo.
 */
export function ComoPagas({ tarjetas, prestamos, movimientos, hoy, hasta, proximo, porApartar, alCerrar }: Props) {
  const antesDe = `antes de ${proximo}`;
  const cambiar = (ids: string[], formaPago: FormaPago) =>
    void db.transaction('rw', db.tarjetas, async () => {
      for (const id of ids) await db.tarjetas.update(id, { formaPago });
    });
  const todasRecomendado = tarjetas.every((t) => t.formaPago === 'recomendado');
  return (
    <Hoja titulo="¿Cuánto pagas de cada tarjeta?" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">
          De tu sueldo, la app aparta lo que vas a pagar {antesDe}. Si no te alcanza para el total, elige «Recomendado»: es lo
          mínimo para que la deuda baje. «El mínimo» del banco a veces ni cubre los intereses.
        </p>
        {tarjetas.length > 1 && (
          <button type="button" className="boton" onClick={() => cambiar(tarjetas.map((t) => t.id), todasRecomendado ? 'total' : 'recomendado')}>
            {todasRecomendado ? 'Pagar el total de todas' : 'Pagar lo recomendado de todas'}
          </button>
        )}
        <ul className="lista grupo-borde como-pagas">
          {tarjetas.map((t) => {
            const a = apartadoPorForma(t, movimientos, hoy, hasta);
            const nada = a.totalCentavos === 0 && a.minimoCentavos === 0;
            const forma = t.formaPago ?? 'total';
            return (
              <li key={t.id}>
                <span className="fila-titulo">{t.nombre}</span>
                <SegmentosForma
                  valor={forma}
                  alCambiar={(f) => cambiar([t.id], f)}
                  etiqueta={`Cuánto pagas de ${t.nombre}`}
                  montos={
                    nada
                      ? undefined
                      : {
                          total: formatearDinero(a.totalCentavos),
                          recomendado: formatearDinero(a.recomendadoCentavos),
                          minimo: `${formatearDinero(a.minimoCentavos)}${a.minimoAprox ? ' aprox.' : ''}`,
                        }
                  }
                />
                <span className="fila-detalle envolver">{nada ? `No tiene pagos ${antesDe}.` : AYUDA_FORMA[forma]}</span>
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
