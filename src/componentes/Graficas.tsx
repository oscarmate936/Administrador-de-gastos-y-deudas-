import { useState } from 'react';
import { formatearDinero } from '../lib/dinero';
import { aDate } from '../lib/fechas';
import { topeEje, type MesFlujo } from '../lib/graficas';

const fmtMes = new Intl.DateTimeFormat('es-SV', { month: 'short' });
const fmtMesLargo = new Intl.DateTimeFormat('es-SV', { month: 'long', year: 'numeric' });
const mesCortoDe = (mes: string) => fmtMes.format(aDate(`${mes}-01`)).replace('.', '');
/** "agosto de 2026" (para usar dentro de una frase). */
const mesEnFrase = (mes: string) => fmtMesLargo.format(aDate(`${mes}-01`));
/** "Agosto de 2026" (como título o etiqueta). */
const mesLargoDe = (mes: string) => {
  const t = mesEnFrase(mes);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "$1.2 mil", "$850", "$12 mil" para las marcas del eje. */
function compacto(centavos: number): string {
  const d = centavos / 100;
  if (d >= 1000) return `$${(d / 1000).toLocaleString('es-SV', { maximumFractionDigits: 1 })} mil`;
  return `$${Math.round(d)}`;
}

/** Barra vertical con la punta redondeada (4px) y la base recta. */
function barra(x: number, base: number, ancho: number, alto: number): string {
  if (alto <= 0) return '';
  const r = Math.min(4, ancho / 2, alto);
  const y = base - alto;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${base}Z`;
}

const ANCHO = 340;
const ALTO = 190;
const IZQ = 46;
const ABAJO = 24;
const ARRIBA = 10;

function Tabla({ filas, columnas }: { filas: string[][]; columnas: string[] }) {
  return (
    <table className="tabla-grafica">
      <thead>
        <tr>
          {columnas.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f[0]}>
            {f.map((v, i) => (i === 0 ? <th key={i} scope="row">{v}</th> : <td key={i}>{v}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ingresos y salidas por mes: barras agrupadas con leyenda, toque para ver valores y vista de tabla. */
export function GraficaFlujo({ meses }: { meses: MesFlujo[] }) {
  const [elegido, setElegido] = useState(meses.length - 1);
  const [tabla, setTabla] = useState(false);
  const tope = topeEje(Math.max(...meses.flatMap((m) => [m.ingresosCentavos, m.salidasCentavos])));
  const area = ALTO - ABAJO - ARRIBA;
  const banda = (ANCHO - IZQ) / meses.length;
  const ancho = Math.min(18, (banda - 10) / 2);
  const y = (v: number) => ALTO - ABAJO - (v / tope) * area;
  const sel = meses[elegido];

  return (
    <figure className="grafica">
      <div className="grafica-cabecera">
        <div className="leyenda" aria-hidden="true">
          <span><i className="muestra serie-1" /> Ingresos</span>
          <span><i className="muestra serie-2" /> Salidas</span>
        </div>
        <button type="button" className="enlace" onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
      {tabla ? (
        <Tabla
          columnas={['Mes', 'Ingresos', 'Salidas', 'Diferencia']}
          filas={meses.map((m) => [
            mesLargoDe(m.mes),
            formatearDinero(m.ingresosCentavos),
            formatearDinero(m.salidasCentavos),
            formatearDinero(m.ingresosCentavos - m.salidasCentavos),
          ])}
        />
      ) : (
        <>
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica-svg" role="img" aria-label="Ingresos y salidas de los últimos meses">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={IZQ} x2={ANCHO} y1={y(tope * f)} y2={y(tope * f)} className={f === 0 ? 'eje' : 'rejilla'} />
                <text x={IZQ - 6} y={y(tope * f) + 4} className="marca-eje" textAnchor="end">
                  {compacto(tope * f)}
                </text>
              </g>
            ))}
            {meses.map((m, i) => {
              const x0 = IZQ + i * banda + (banda - ancho * 2 - 2) / 2;
              const base = y(0);
              return (
                <g key={m.mes} className={i === elegido ? 'grupo elegido' : 'grupo'}>
                  {i === elegido && <rect x={IZQ + i * banda + 2} y={ARRIBA} width={banda - 4} height={area} rx="6" className="banda-elegida" />}
                  <path d={barra(x0, base, ancho, base - y(m.ingresosCentavos))} className="serie-1" />
                  <path d={barra(x0 + ancho + 2, base, ancho, base - y(m.salidasCentavos))} className="serie-2" />
                  <text x={IZQ + i * banda + banda / 2} y={ALTO - 6} className="marca-eje" textAnchor="middle">
                    {mesCortoDe(m.mes)}
                  </text>
                  <rect
                    x={IZQ + i * banda}
                    y={0}
                    width={banda}
                    height={ALTO}
                    className="zona-toque"
                    onClick={() => setElegido(i)}
                    onMouseEnter={() => setElegido(i)}
                  >
                    <title>{mesLargoDe(m.mes)}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
          <dl className="cifras grafica-detalle" aria-live="polite">
            <div>
              <dt>{mesLargoDe(sel.mes)}</dt>
              <dd className="sr-sin-titulo" />
            </div>
            <div>
              <dt><i className="muestra serie-1" /> Ingresos</dt>
              <dd>{formatearDinero(sel.ingresosCentavos)}</dd>
            </div>
            <div>
              <dt><i className="muestra serie-2" /> Salidas</dt>
              <dd>{formatearDinero(sel.salidasCentavos)}</dd>
            </div>
          </dl>
        </>
      )}
    </figure>
  );
}

/** Deuda total por mes: línea de 2px con área suave y punto final; toque para ver el valor. */
export function GraficaDeuda({ puntos }: { puntos: Array<{ mes: string; deudaCentavos: number }> }) {
  const [elegido, setElegido] = useState(puntos.length - 1);
  const [tabla, setTabla] = useState(false);
  if (puntos.length < 2) {
    return (
      <p className="texto-tenue">
        La app guarda tu deuda total cada mes. Desde el próximo mes verás aquí cómo va bajando.
      </p>
    );
  }
  const tope = topeEje(Math.max(...puntos.map((p) => p.deudaCentavos)));
  const area = ALTO - ABAJO - ARRIBA;
  const paso = (ANCHO - IZQ - 16) / (puntos.length - 1);
  const x = (i: number) => IZQ + 8 + i * paso;
  const y = (v: number) => ALTO - ABAJO - (v / tope) * area;
  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.deudaCentavos)}`).join('');
  const relleno = `${linea}L${x(puntos.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const sel = puntos[elegido];
  const primero = puntos[0].deudaCentavos;
  const cambio = sel.deudaCentavos - primero;

  return (
    <figure className="grafica">
      <div className="grafica-cabecera">
        <span className="texto-tenue">
          {elegido > 0 && cambio !== 0
            ? `${cambio < 0 ? 'Bajó' : 'Subió'} ${formatearDinero(Math.abs(cambio))} desde ${mesEnFrase(puntos[0].mes)}`
            : ' '}
        </span>
        <button type="button" className="enlace" onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
      {tabla ? (
        <Tabla columnas={['Mes', 'Deuda total']} filas={puntos.map((p) => [mesLargoDe(p.mes), formatearDinero(p.deudaCentavos)])} />
      ) : (
        <>
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica-svg" role="img" aria-label="Deuda total por mes">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={IZQ} x2={ANCHO} y1={y(tope * f)} y2={y(tope * f)} className={f === 0 ? 'eje' : 'rejilla'} />
                <text x={IZQ - 6} y={y(tope * f) + 4} className="marca-eje" textAnchor="end">
                  {compacto(tope * f)}
                </text>
              </g>
            ))}
            <path d={relleno} className="area-deuda" />
            <path d={linea} className="linea-deuda" />
            {puntos.map((p, i) => (
              <g key={p.mes}>
                {(puntos.length <= 8 || i % Math.ceil(puntos.length / 6) === 0 || i === puntos.length - 1) && (
                  <text x={x(i)} y={ALTO - 6} className="marca-eje" textAnchor="middle">
                    {mesCortoDe(p.mes)}
                  </text>
                )}
                {i === elegido && <line x1={x(i)} x2={x(i)} y1={ARRIBA} y2={y(0)} className="cruz" />}
                {(i === elegido || i === puntos.length - 1) && <circle cx={x(i)} cy={y(p.deudaCentavos)} r="5" className="punto-deuda" />}
                <rect
                  x={x(i) - paso / 2}
                  y={0}
                  width={paso}
                  height={ALTO}
                  className="zona-toque"
                  onClick={() => setElegido(i)}
                  onMouseEnter={() => setElegido(i)}
                >
                  <title>{mesLargoDe(p.mes)}</title>
                </rect>
              </g>
            ))}
          </svg>
          <p className="grafica-valor" aria-live="polite">
            <span className="texto-tenue">{mesLargoDe(sel.mes)}</span> <strong>{formatearDinero(sel.deudaCentavos)}</strong>
          </p>
        </>
      )}
    </figure>
  );
}
