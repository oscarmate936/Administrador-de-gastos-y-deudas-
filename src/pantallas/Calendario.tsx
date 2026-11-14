import { useState } from 'react';
import type { Datos, Detalle } from '../datos';
import { IconoAnterior, IconoFlecha, IconoSiguiente } from '../componentes/Iconos';
import { Insignia, type NombreSimbolo } from '../componentes/Simbolo';
import { agenda, type Evento } from '../lib/agenda';
import { fechaConDia } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { aDate, hoy, mesDe, moverMes, nombreMes } from '../lib/fechas';

interface Props {
  datos: Datos;
  alVolver: () => void;
  alAbrir: (d: Detalle) => void;
}

const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const fmtDia = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const SIMBOLO: Record<Evento['tipo'], NombreSimbolo> = { pago: 'pago', cuota: 'prestamo', corte: 'tarjeta', repite: 'repetir' };
const TIPO: Record<Evento['tipo'], string> = { pago: 'Pago', cuota: 'Cuota', corte: 'Corte', repite: 'Se repite' };

/** Calendario del mes con los cortes, pagos, cuotas y lo que se repite. */
export function Calendario({ datos, alVolver, alAbrir }: Props) {
  const fechaHoy = hoy();
  const [mes, setMes] = useState(() => mesDe(fechaHoy));
  const [elegido, setElegido] = useState(fechaHoy);

  const [anio, mesNum] = mes.split('-').map(Number);
  const primero = `${mes}-01`;
  const ultimo = fechaConDia(anio, mesNum - 1, 31);
  const eventos = agenda(datos, primero, ultimo, fechaHoy);
  const porDia = new Map<string, Evento[]>();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);

  // Lunes = 0
  const desfase = (aDate(primero).getDay() + 6) % 7;
  const diasMes = Number(ultimo.slice(8));
  const celdas: Array<string | null> = [
    ...Array<null>(desfase).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ];

  const cambiarMes = (delta: number) => {
    const nuevo = moverMes(mes, delta);
    setMes(nuevo);
    setElegido(nuevo === mesDe(fechaHoy) ? fechaHoy : `${nuevo}-01`);
  };

  const delDia = porDia.get(elegido) ?? [];
  const totalMes = eventos.filter((e) => !e.entra && e.montoCentavos !== undefined && e.tipo !== 'corte').reduce((t, e) => t + e.montoCentavos!, 0);

  return (
    <>
      <div className="barra-detalle">
        <button type="button" className="boton-icono" onClick={alVolver} aria-label="Volver a Deudas">
          <IconoAnterior />
        </button>
        <h2>Calendario de pagos</h2>
      </div>

      <section className="tarjeta calendario">
        <div className="selector-mes">
          <button type="button" className="boton-icono" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
            <IconoAnterior />
          </button>
          <h2 aria-live="polite">{nombreMes(mes)}</h2>
          <button type="button" className="boton-icono" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
            <IconoSiguiente />
          </button>
        </div>
        <div className="calendario-rejilla">
          <div className="calendario-fila" aria-hidden="true">
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="calendario-cabecera">
                {d}
              </span>
            ))}
          </div>
          {Array.from({ length: Math.ceil(celdas.length / 7) }, (_, semana) => (
            <div className="calendario-fila" key={semana}>
              {celdas.slice(semana * 7, semana * 7 + 7).map((f, i) =>
                f === null ? (
                  <span key={`v${i}`} className="calendario-dia vacio" />
                ) : (
                  <span key={f}>
                    <button
                      type="button"
                      className={['calendario-dia', f === fechaHoy && 'hoy', f < fechaHoy && 'pasado'].filter(Boolean).join(' ')}
                      aria-pressed={f === elegido}
                      aria-label={`${mayuscula(fmtDia.format(aDate(f)))}${porDia.has(f) ? `: ${porDia.get(f)!.length} ${porDia.get(f)!.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                      onClick={() => setElegido(f)}
                    >
                      <span className="calendario-numero">{Number(f.slice(8))}</span>
                      <span className="calendario-puntos" aria-hidden="true">
                        {(porDia.get(f) ?? []).slice(0, 3).map((e) => (
                          <span key={e.clave} className={`punto-evento ${e.tipo}`} style={{ background: e.color }} />
                        ))}
                      </span>
                    </button>
                  </span>
                ),
              )}
              {semana === Math.ceil(celdas.length / 7) - 1 &&
                Array.from({ length: (7 - (celdas.length % 7)) % 7 }, (_, i) => <span key={`f${i}`} className="calendario-dia vacio" />)}
            </div>
          ))}
        </div>
        <p className="ayuda sin-margen">
          {totalMes > 0
            ? `Pagos con monto conocido este mes: ${formatearDinero(totalMes)}. Los de meses siguientes aparecen sin monto hasta que llega su estado de cuenta.`
            : 'Los pagos de meses siguientes aparecen sin monto hasta que llega su estado de cuenta.'}
        </p>
      </section>

      <section className="grupo">
        <h2 className="cabecera-grupo">{mayuscula(fmtDia.format(aDate(elegido)))}</h2>
        {delDia.length === 0 ? (
          <p className="tarjeta texto-tenue">Nada vence ni corta este día.</p>
        ) : (
          <ul className="lista tarjeta">
            {delDia.map((e) => {
              const contenido = (
                <>
                  <Insignia color={e.color} simbolo={SIMBOLO[e.tipo]} />
                  <span className="fila-texto">
                    <span className="fila-titulo">{e.titulo}</span>
                    <span className="fila-detalle">
                      {TIPO[e.tipo]}
                      {e.estimado ? ' · monto estimado' : ''}
                    </span>
                  </span>
                  {e.montoCentavos !== undefined && (
                    <span className={e.entra ? 'fila-monto positivo' : 'fila-monto'}>
                      {e.entra ? '+' : ''}
                      {formatearDinero(e.montoCentavos)}
                    </span>
                  )}
                  {e.destino && (
                    <span className="opcion-flecha" aria-hidden="true">
                      <IconoFlecha />
                    </span>
                  )}
                </>
              );
              return (
                <li key={e.clave}>
                  {e.destino ? (
                    <button type="button" className="fila" onClick={() => alAbrir(e.destino!)}>
                      {contenido}
                    </button>
                  ) : (
                    <div className="fila">{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
