import { useState, type ReactNode } from 'react';
import type { Datos, Detalle, Formulario } from '../datos';
import { Asistente } from '../componentes/Asistente';
import { Ayuda } from '../componentes/Ayuda';
import { db, type Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { Hoja } from '../componentes/Hoja';
import { IconoAnterior, IconoFlecha, IconoSiguiente } from '../componentes/Iconos';
import { Insignia, InsigniaCategoria, Simbolo } from '../componentes/Simbolo';
import { pagosDelMes, type PagoDelMes } from '../lib/pagosDelMes';
import { guardarAjuste, ordenInicio, type Ajustes, type AjustesFondo, type SeccionInicio } from '../lib/ajustes';
import { DIAS_A_APARTAR, calcularLibre, moverFondo, sugerirMeta } from '../lib/fondo';
import { cierreDelMes, mesParaResumen, type CierreMes } from '../lib/cierreMes';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { diasEntre, fechaCorta, hoy, mesDe, moverMes as moverMesInicio, nombreMes, textoFaltan } from '../lib/fechas';
import { esPagoDeDeuda, ordenarRecientes } from '../lib/resumen';
import { calcularRitmo, type Ritmo } from '../lib/ritmo';
import { estadoLimites } from '../lib/limites';
import { omitirRecurrente, pendientes, registrarRecurrente } from '../lib/recurrentes';

/** Cada cuántos días se recuerda hacer un respaldo. */
const DIAS_ENTRE_RESPALDOS = 7;

const NOMBRES_SECCION: Record<SeccionInicio, string> = {
  asistente: 'Asistente',
  atencion: 'Requiere atención',
  semana: 'Próximos pagos',
  fondo: 'Fondo de emergencia',
  mes: 'Resumen del mes',
  ultimos: 'Últimos movimientos',
};

interface Props {
  datos: Datos;
  ajustes: Ajustes;
  alAgregarIngreso: () => void;
  alAgregarGasto: () => void;
  alEditar: (m: Movimiento) => void;
  alVerTodos: () => void;
  alVerDeudas: () => void;
  alVerAnalisis: () => void;
  alAbrirDeuda: (d: Detalle) => void;
  /** Días desde el último respaldo externo; null si nunca se hizo. */
  diasSinRespaldo: number | null;
  alRespaldar: () => void;
  alAbrirFormulario: (f: Formulario) => void;
  alImportar: () => void;
  alRecordatorios: () => void;
  /** Abre «¿Cuánto dinero tienes hoy?». */
  alCorregirSaldo: () => void;
}


export function Inicio(props: Props) {
  const { datos, ajustes, alAgregarIngreso, alAgregarGasto, alEditar, alVerTodos, alVerDeudas, alVerAnalisis, alAbrirDeuda } = props;
  const { diasSinRespaldo, alRespaldar, alAbrirFormulario } = props;
  const { movimientos, mapaCategorias, tarjetas, prestamos } = datos;
  const fechaHoy = hoy();
  const [editando, setEditando] = useState(false);

  if (movimientos.length === 0 && tarjetas.length === 0 && prestamos.length === 0) {
    return (
      <section className="vacio">
        <Insignia color="var(--primario)" simbolo="dinero" />
        <h2>Empieza con tu último sueldo</h2>
        <p>Registra cuánto te pagaron y la app irá restando cada gasto que anotes, para que siempre sepas cuánto te queda.</p>
        <button type="button" className="boton primario" onClick={alAgregarIngreso}>
          Registrar mi sueldo
        </button>
        <button type="button" className="boton" onClick={alAgregarGasto}>
          Registrar un gasto
        </button>
        <button type="button" className="boton" onClick={alVerDeudas}>
          Agregar tarjetas y préstamos
        </button>
      </section>
    );
  }

  const recientes = ordenarRecientes(movimientos).slice(0, 5);
  const { disponible, porApartar, fondo, cifra, conLibre } = calcularLibre(datos, fechaHoy, ajustes.fondo.apartadoCentavos, ajustes.saldo.ajusteCentavos);
  const mes = mesDe(fechaHoy);
  const limites = estadoLimites(movimientos, datos.categorias, mes).filter((l) => l.porcentaje >= 80);
  const porConfirmar = pendientes(datos.recurrentes, fechaHoy);
  const pasos = primerosPasos(props);
  const mesCierre = mesParaResumen(fechaHoy, ajustes.inicio.resumenVisto);
  const cierre = mesCierre ? cierreDelMes(datos, mesCierre) : null;
  const mostrarPasos = !ajustes.inicio.primerosPasosOculto && pasos.some((p) => !p.hecho);
  // El primer respaldo no se pide dos veces: si es el paso que «Primeros pasos» está mostrando, basta con ese.
  const pasoVisible = mostrarPasos ? pasos.find((p) => !p.hecho)?.id : undefined;
  const pedirRespaldo = (diasSinRespaldo === null || diasSinRespaldo >= DIAS_ENTRE_RESPALDOS) && pasoVisible !== 'respaldo';

  const ritmo = calcularRitmo(movimientos, fechaHoy, cifra);

  // Resumen del mes: lo que entró, lo que gastaste (también con tarjeta) y lo que pagaste a deudas.
  const delMes = movimientos.filter((m) => mesDe(m.fecha) === mes);
  const suma = (lista: Movimiento[]) => lista.reduce((t, m) => t + m.montoCentavos, 0);
  const entro = suma(delMes.filter((m) => m.tipo === 'ingreso'));
  const gastado = suma(delMes.filter((m) => m.tipo === 'gasto'));
  const aDeudas = suma(delMes.filter(esPagoDeDeuda));

  // Una fila por deuda: lo vencido va en «Requiere atención» y lo demás en
  // «Próximos pagos» (todo junto si esa sección está oculta).
  const pagosPendientes = pagosDelMes(datos, fechaHoy);
  const atencionVisible = !ajustes.inicio.ocultas.includes('atencion');
  const atender = atencionVisible ? pagosPendientes.filter((p) => p.vencido) : [];
  const pagosMes = atencionVisible ? pagosPendientes.filter((p) => !p.vencido) : pagosPendientes;
  const totalMes = pagosMes.reduce((t, p) => t + p.montoCentavos, 0);
  const hayAtencion = atender.length > 0 || porConfirmar.length > 0 || limites.length > 0 || pedirRespaldo;
  /** Abre el pago de esa deuda con el monto ya puesto. */
  const pagar = (p: PagoDelMes) =>
    alAbrirFormulario(p.tipo === 'tarjeta' ? { clase: 'pago', tarjetaId: p.id, monto: p.montoCentavos } : { clase: 'pago', prestamoId: p.id, monto: p.montoCentavos });

  const secciones: Record<SeccionInicio, ReactNode> = {
    asistente: (
      <Asistente
        key="asistente"
        datos={datos}
        fondoCentavos={ajustes.fondo.apartadoCentavos}
        ajusteSaldoCentavos={ajustes.saldo.ajusteCentavos}
        alAbrirFormulario={alAbrirFormulario}
        alAbrir={(d) => (d === 'movimientos' ? alVerTodos() : alAbrirDeuda(d))}
      />
    ),
    atencion: hayAtencion && (
      <section className="grupo" key="atencion">
        <div className="cabecera-grupo">
          <h2>Requiere atención</h2>
          {atender.length > 0 && (
            <button type="button" className="enlace" onClick={alVerDeudas}>
              Ver deudas
            </button>
          )}
        </div>
        <ul className="lista tarjeta">
          {atender.map((p) => (
            <FilaPagoDelMes key={`${p.tipo}-${p.id}`} pago={p} color={colorDeuda(datos, p)} hoy={fechaHoy} alTocar={() => pagar(p)} />
          ))}
          {porConfirmar.map((r) => {
            const c = r.categoriaId ? mapaCategorias.get(r.categoriaId) : undefined;
            const titulo = r.nota || (r.tipo === 'ingreso' ? (r.esPago ? 'Mi sueldo' : 'Otro ingreso') : (c?.nombre ?? 'Gasto'));
            return (
              <li key={r.id} className="fila-confirmar">
                {r.tipo === 'ingreso' ? <Insignia color="var(--positivo)" simbolo="ingreso" /> : <InsigniaCategoria categoria={c} />}
                <span className="fila-texto">
                  <span className="fila-titulo">{titulo}</span>
                  <span className="fila-detalle envolver">
                    {r.tipo === 'ingreso' ? '+' : '−'}
                    {formatearDinero(r.montoCentavos)} · se repite, tocaba el {fechaCorta(r.proxima)}
                  </span>
                </span>
                <span className="botones-confirmar">
                  <button type="button" className="boton chico" onClick={() => void omitirRecurrente(db, r)}>
                    Omitir
                  </button>
                  <button type="button" className="boton chico primario" onClick={() => void registrarRecurrente(db, r)}>
                    Registrar
                  </button>
                </span>
              </li>
            );
          })}
          {limites.map((l) => (
            <li key={l.categoria.id}>
              <button type="button" className="fila" onClick={alVerAnalisis}>
                <InsigniaCategoria categoria={l.categoria} />
                <span className="fila-texto">
                  <span className="fila-titulo">{l.categoria.nombre}</span>
                  <span className={l.porcentaje >= 100 ? 'fila-detalle texto-peligro' : 'fila-detalle texto-alerta'}>
                    {l.porcentaje >= 100 ? 'Pasaste el límite del mes' : `Llevas el ${l.porcentaje}% del límite`}
                  </span>
                </span>
                <span className="fila-monto">
                  {formatearDinero(l.gastadoCentavos)}
                  <span className="fila-monto-sub">de {formatearDinero(l.limiteCentavos)}</span>
                </span>
              </button>
            </li>
          ))}
          {pedirRespaldo && (
            <li>
              <button type="button" className="fila" onClick={alRespaldar}>
                <Insignia color="var(--info)" simbolo="subir" />
                <span className="fila-texto">
                  <span className="fila-titulo">Haz un respaldo</span>
                  <span className="fila-detalle envolver">
                    {diasSinRespaldo === null ? 'Aún no tienes una copia fuera del celular.' : `Tu último respaldo fue hace ${diasSinRespaldo} días.`}
                  </span>
                </span>
                <span className="opcion-flecha" aria-hidden="true">
                  <IconoFlecha />
                </span>
              </button>
            </li>
          )}
        </ul>
      </section>
    ),
    semana: (tarjetas.length > 0 || prestamos.length > 0) && (
      <section className="grupo" key="semana">
        <div className="cabecera-grupo">
          <h2>Próximos pagos</h2>
          {pagosMes.length > 0 && <span className="texto-tenue">Total {formatearDinero(totalMes)}</span>}
        </div>
        {pagosMes.length === 0 ? (
          <p className="tarjeta texto-tenue">No te queda ningún pago pendiente en {nombreMes(mes).split(' ')[0].toLowerCase()}.</p>
        ) : (
          <ul className="lista tarjeta" aria-label="Lo que falta pagar a cada deuda; toca una para registrar el pago">
            {pagosMes.map((p) => (
              <FilaPagoDelMes key={`${p.tipo}-${p.id}`} pago={p} color={colorDeuda(datos, p)} hoy={fechaHoy} alTocar={() => pagar(p)} />
            ))}
          </ul>
        )}
      </section>
    ),
    fondo: (
      <TarjetaFondo key="fondo" fondo={ajustes.fondo} sugerida={sugerirMeta(movimientos, fechaHoy)} cifra={cifra} />
    ),
    mes: (
      <section className="grupo" key="mes">
        <div className="cabecera-grupo">
          <h2>{nombreMes(mes).split(' ')[0]}</h2>
          <button type="button" className="enlace" onClick={alVerAnalisis}>
            Ver análisis
          </button>
        </div>
        <dl className="mosaico">
          <div>
            <dt>Entró</dt>
            <dd className="positivo">{formatearDinero(entro)}</dd>
          </div>
          <div>
            <dt>Gastaste</dt>
            <dd>{formatearDinero(gastado)}</dd>
          </div>
          <div>
            <dt>A deudas</dt>
            <dd>{formatearDinero(aDeudas)}</dd>
          </div>
        </dl>
      </section>
    ),
    ultimos: recientes.length > 0 && (
      <section className="grupo" key="ultimos">
        <div className="cabecera-grupo">
          <h2>Últimos movimientos</h2>
          <button type="button" className="enlace" onClick={alVerTodos}>
            Ver todos
          </button>
        </div>
        <ul className="lista tarjeta">
          {recientes.map((m) => (
            <FilaMovimiento key={m.id} movimiento={m} datos={datos} mostrarFecha alTocar={alEditar} />
          ))}
        </ul>
      </section>
    ),
  };

  const orden = ordenInicio(ajustes.inicio).filter((s) => !ajustes.inicio.ocultas.includes(s));

  return (
    <>
      <section className={cifra < 0 ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">
          {conLibre ? 'Libre para gastar' : 'Disponible'}
          {conLibre && <Ayuda termino="libre para gastar" clara />}
        </p>
        <p className="monto-grande">{formatearDinero(cifra)}</p>
        <p className="nota-principal">
          {conLibre
            ? textoApartado(disponible, porApartar, fondo)
            : disponible < 0
              ? 'Ha salido más dinero del que has registrado como ingreso.'
              : ajustes.saldo.ajusteCentavos !== 0
                ? `Lo que dijiste tener${ajustes.saldo.fecha ? ` el ${fechaCorta(ajustes.saldo.fecha)}` : ''}, con lo que has anotado desde entonces.`
                : 'Lo que has recibido menos lo que ha salido.'}
        </p>
        {ritmo && <HeroeRitmo ritmo={ritmo} hoy={fechaHoy} />}
        {/* Sin sueldo registrado o con la cifra en negativo: dos formas de ponerla al día. */}
        {(!ritmo || disponible < 0) && (
          <div className="acciones-heroe">
            {!ritmo && (
              <button type="button" className="boton boton-heroe" onClick={alAgregarIngreso}>
                Registrar mi sueldo
              </button>
            )}
            <button type="button" className="boton boton-heroe" onClick={props.alCorregirSaldo}>
              Decir cuánto tengo hoy
            </button>
          </div>
        )}
      </section>

      {cierre && <ResumenCierre cierre={cierre} alVerAnalisis={alVerAnalisis} />}

      {mostrarPasos && <PrimerosPasos pasos={pasos} />}

      {orden.map((s) => secciones[s])}

      <button type="button" className="boton boton-editar-inicio" onClick={() => setEditando(true)}>
        <Simbolo nombre="lapiz" tamano={18} /> Editar Inicio
      </button>
      {editando && <EditarInicio ajustes={ajustes} alCerrar={() => setEditando(false)} />}
    </>
  );
}

// ---------- Ritmo en el héroe ----------

function HeroeRitmo({ ritmo: r, hoy: fechaHoy }: { ritmo: Ritmo; hoy: string }) {
  const estimado = r.intervalo.supuesto ? ' (estimado)' : '';
  let alcance: string;
  if (r.porDiaCentavos === null) alcance = 'No queda libre';
  else if (!r.alcanzaHasta || r.alcanzaHasta >= r.proximoPago) alcance = 'Tu próximo sueldo';
  else alcance = fechaCorta(r.alcanzaHasta);

  return (
    <>
      <dl className="cifras-heroe">
        <div>
          <dt>Puedes gastar por día</dt>
          <dd>{r.porDiaCentavos === null ? formatearDinero(0) : formatearDinero(r.porDiaCentavos)}</dd>
        </div>
        <div>
          <dt>A este ritmo te alcanza hasta</dt>
          <dd className={r.alcanzaHasta && r.alcanzaHasta < r.proximoPago ? 'heroe-alerta' : ''}>{alcance}</dd>
        </div>
      </dl>
      <GraficaRitmo ritmo={r} />
      <p className="pie-heroe">
        <span>
          {r.pagoAtrasado
            ? 'Tu sueldo suele llegar antes de hoy'
            : `Próximo sueldo ${fechaCorta(r.proximoPago)}${estimado} · ${textoFaltan(diasEntre(fechaHoy, r.proximoPago))}`}
        </span>
      </p>
    </>
  );
}

/** Línea de lo gastado desde el pago contra el ritmo parejo hasta el próximo pago. */
function GraficaRitmo({ ritmo: r }: { ritmo: Ritmo }) {
  const ANCHO = 300;
  const ALTO = 56;
  const real = r.acumulado[r.acumulado.length - 1] ?? 0;
  const tope = Math.max(r.totalPeriodoCentavos, real, 1) * 1.08;
  const x = (d: number) => (Math.min(d, r.diasPeriodo) / r.diasPeriodo) * ANCHO;
  const y = (c: number) => ALTO - 4 - (c / tope) * (ALTO - 8);
  const puntos = r.acumulado.map((c, d) => `${x(d).toFixed(1)},${y(c).toFixed(1)}`);
  const hoyX = x(r.acumulado.length - 1);
  const area = `0,${ALTO} ${puntos.join(' ')} ${hoyX.toFixed(1)},${ALTO}`;
  return (
    <svg
      className="grafica-ritmo"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Ritmo de gasto: llevas ${formatearDinero(real)} desde tu sueldo; a ritmo parejo serían ${formatearDinero(r.idealHoyCentavos)}.`}
    >
      <line className="ideal" x1="0" y1={y(0)} x2={ANCHO} y2={y(r.totalPeriodoCentavos)} />
      <polygon className="area" points={area} />
      <polyline className="real" points={puntos.join(' ')} />
      <circle className="hoy" cx={hoyX} cy={y(real)} r="3.5" />
    </svg>
  );
}

// ---------- Próximos pagos ----------

/** Un pago pendiente: el mínimo (o lo que falta del total) de una tarjeta o la cuota de un préstamo. Al tocarlo se registra. */
function FilaPagoDelMes({ pago: p, color, hoy: fechaHoy, alTocar }: { pago: PagoDelMes; color: string; hoy: string; alTocar: () => void }) {
  const dias = diasEntre(fechaHoy, p.fecha);
  const clase = p.vencido ? 'fila-detalle envolver texto-peligro' : dias <= 5 ? 'fila-detalle envolver texto-alerta' : 'fila-detalle envolver';
  const que = p.clase === 'minimo' ? (p.estimado ? 'Mínimo aprox.' : 'Mínimo') : p.clase === 'total' ? 'Resto del total' : 'Cuota';
  const cuando = p.vencido ? `venció ${fechaCorta(p.fecha)}` : dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence ${fechaCorta(p.fecha)}`;
  return (
    <li>
      <button type="button" className="fila" onClick={alTocar}>
        <Insignia color={color} simbolo={p.tipo === 'tarjeta' ? 'tarjeta' : 'prestamo'} />
        <span className="fila-texto">
          <span className="fila-titulo">{p.nombre}</span>
          <span className={clase}>
            {que} · {cuando}
          </span>
          {p.totalCentavos !== undefined && <span className="fila-detalle envolver">Para no pagar intereses: {formatearDinero(p.totalCentavos)}</span>}
          {p.clase === 'total' && <span className="fila-detalle envolver">El mínimo ya está cubierto</span>}
        </span>
        <span className="fila-monto">{formatearDinero(p.montoCentavos)}</span>
      </button>
    </li>
  );
}

// ---------- Primeros pasos ----------

interface Paso {
  id: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  alTocar: () => void;
}

function primerosPasos(p: Props): Paso[] {
  const { datos, ajustes } = p;
  return [
    {
      id: 'pago',
      titulo: 'Registra tu sueldo',
      detalle: 'Desde ahí se cuenta lo que gastas.',
      hecho: datos.movimientos.some((m) => m.tipo === 'ingreso' && m.esPago),
      alTocar: p.alAgregarIngreso,
    },
    {
      id: 'deudas',
      titulo: 'Agrega tus tarjetas o préstamos',
      detalle: 'Para saber cuánto debes y cuándo pagar.',
      hecho: datos.tarjetas.length + datos.prestamos.length > 0,
      alTocar: () => p.alAbrirFormulario({ clase: 'tarjeta' }),
    },
    {
      id: 'estado',
      titulo: 'Importa un estado de cuenta',
      detalle: 'El PDF de tu tarjeta llena los saldos y las compras.',
      hecho: datos.tarjetas.some((t) => t.ultimoEstado),
      alTocar: p.alImportar,
    },
    {
      id: 'avisos',
      titulo: 'Activa los recordatorios',
      detalle: 'Te avisa antes de cada pago y corte.',
      hecho: ajustes.recordatorios.activo,
      alTocar: p.alRecordatorios,
    },
    {
      id: 'respaldo',
      titulo: 'Haz tu primer respaldo',
      detalle: 'Una copia fuera del celular, por si lo pierdes.',
      hecho: p.diasSinRespaldo !== null,
      alTocar: p.alRespaldar,
    },
  ];
}

function PrimerosPasos({ pasos }: { pasos: Paso[] }) {
  const hechos = pasos.filter((p) => p.hecho).length;
  // Cerrado muestra solo el paso que sigue, para no ocupar toda la pantalla.
  const [abierto, setAbierto] = useState(false);
  const siguiente = pasos.findIndex((p) => !p.hecho);
  const visibles = abierto ? pasos.map((p, i) => ({ p, i })) : [{ p: pasos[siguiente], i: siguiente }];
  return (
    <section className="grupo">
      <div className="cabecera-grupo">
        <h2>
          Primeros pasos · {hechos} de {pasos.length}
        </h2>
        <button type="button" className="enlace" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          {abierto ? 'Ver menos' : 'Ver los pasos'}
        </button>
      </div>
      <div className="tarjeta pasos">
        <div
          className="barra"
          role="progressbar"
          aria-label="Primeros pasos completados"
          aria-valuemin={0}
          aria-valuemax={pasos.length}
          aria-valuenow={hechos}
        >
          <div className="barra-relleno" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
        </div>
        <ul className="lista">
          {visibles.map(({ p, i }) => (
            <li key={p.id}>
              <button type="button" className={p.hecho ? 'fila paso hecho' : 'fila paso'} onClick={p.alTocar} disabled={p.hecho}>
                <span className="paso-marca" aria-hidden="true">
                  {p.hecho ? <Simbolo nombre="listo" tamano={18} /> : i + 1}
                </span>
                <span className="fila-texto">
                  <span className="fila-titulo">
                    {p.titulo}
                    {p.hecho && <span className="solo-lectores"> (hecho)</span>}
                  </span>
                  <span className="fila-detalle envolver">{p.detalle}</span>
                </span>
                {!p.hecho && (
                  <span className="opcion-flecha" aria-hidden="true">
                    <IconoFlecha />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {abierto && (
          <button type="button" className="enlace" onClick={() => void guardarAjuste('inicio', { primerosPasosOculto: true })}>
            No mostrar más
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- Editar Inicio ----------

function EditarInicio({ ajustes, alCerrar }: { ajustes: Ajustes; alCerrar: () => void }) {
  const orden = ordenInicio(ajustes.inicio);
  const ocultas = ajustes.inicio.ocultas;
  const mover = (i: number, delta: number) => {
    const nuevo = [...orden];
    [nuevo[i], nuevo[i + delta]] = [nuevo[i + delta], nuevo[i]];
    void guardarAjuste('inicio', { orden: nuevo });
  };
  const alternar = (s: SeccionInicio, ver: boolean) =>
    void guardarAjuste('inicio', { ocultas: ver ? ocultas.filter((x) => x !== s) : [...ocultas, s] });

  return (
    <Hoja titulo="Editar Inicio" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">Elige qué ver y en qué orden. Lo libre para gastar siempre va arriba.</p>
        <ul className="lista grupo-borde editar-inicio">
          {orden.map((s, i) => (
            <li key={s}>
              <label className="interruptor">
                <span>
                  <strong>{NOMBRES_SECCION[s]}</strong>
                </span>
                <input type="checkbox" role="switch" checked={!ocultas.includes(s)} onChange={(e) => alternar(s, e.target.checked)} />
              </label>
              <span className="mover">
                <button type="button" className="boton-icono" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${NOMBRES_SECCION[s]}`}>
                  <span className="girar-arriba">
                    <IconoAnterior />
                  </span>
                </button>
                <button
                  type="button"
                  className="boton-icono"
                  disabled={i === orden.length - 1}
                  onClick={() => mover(i, 1)}
                  aria-label={`Bajar ${NOMBRES_SECCION[s]}`}
                >
                  <span className="girar-abajo">
                    <IconoSiguiente />
                  </span>
                </button>
              </span>
            </li>
          ))}
        </ul>
        {ajustes.inicio.primerosPasosOculto && (
          <button type="button" className="boton" onClick={() => void guardarAjuste('inicio', { primerosPasosOculto: false })}>
            Volver a mostrar los primeros pasos
          </button>
        )}
        <div className="acciones">
          <button type="button" className="boton primario" onClick={alCerrar}>
            Listo
          </button>
        </div>
      </div>
    </Hoja>
  );
}

// ---------- Compartidos ----------

export function colorDeuda(datos: Datos, p: { tipo: 'tarjeta' | 'prestamo'; id: string }) {
  return p.tipo === 'tarjeta' ? (datos.tarjetas.find((t) => t.id === p.id)?.color ?? 'var(--tenue)') : 'var(--primario)';
}

// ---------- Fondo de emergencia ----------

/** «Tienes $X; $Y son de pagos de los próximos 15 días y $Z están en tu fondo.» */
function textoApartado(disponible: number, porApartar: number, fondo: number): string {
  const partes = [
    porApartar > 0 && `${formatearDinero(porApartar)} son de pagos de los próximos ${DIAS_A_APARTAR} días`,
    fondo > 0 && `${formatearDinero(fondo)} están en tu fondo de emergencia`,
  ].filter(Boolean);
  return `Tienes ${formatearDinero(disponible)}; ${partes.join(' y ')}.`;
}

function TarjetaFondo({ fondo, sugerida, cifra }: { fondo: AjustesFondo; sugerida: number; cifra: number }) {
  const [hoja, setHoja] = useState<'crear' | 'apartar' | 'usar' | null>(null);
  const meta = fondo.metaCentavos;
  const porcentaje = meta ? Math.min(100, Math.round((fondo.apartadoCentavos / meta) * 100)) : 0;
  // Sin fondo todavía: una sola fila, para no alargar Inicio.
  if (meta === undefined) {
    return (
      <section className="grupo" aria-label="Fondo de emergencia">
        <ul className="lista tarjeta">
          <li>
            <button type="button" className="fila" onClick={() => setHoja('crear')}>
              <Insignia color="var(--positivo)" simbolo="objetivo" />
              <span className="fila-texto">
                <span className="fila-titulo">Crear fondo de emergencia</span>
                <span className="fila-detalle envolver">Para que un imprevisto no termine en la tarjeta. Sugerido: {formatearDinero(sugerida)}</span>
              </span>
              <span className="opcion-flecha" aria-hidden="true">
                <IconoFlecha />
              </span>
            </button>
          </li>
        </ul>
        {hoja === 'crear' && <MetaFondo fondo={fondo} sugerida={sugerida} alCerrar={() => setHoja(null)} />}
      </section>
    );
  }
  return (
    <section className="grupo">
      <div className="cabecera-grupo">
        <h2>
          Fondo de emergencia <Ayuda termino="fondo de emergencia" />
        </h2>
        <button type="button" className="enlace" onClick={() => setHoja('crear')}>
          Cambiar meta
        </button>
      </div>
      <div className="tarjeta fondo">
        <div className="fondo-cifras">
          <strong className="monto-medio">{formatearDinero(fondo.apartadoCentavos)}</strong>
          <span className="texto-tenue">de {formatearDinero(meta)}</span>
        </div>
        <div
          className="barra"
          role="progressbar"
          aria-label="Avance del fondo de emergencia"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje}
        >
          <div className="barra-relleno" style={{ width: `${Math.max(2, porcentaje)}%` }} />
        </div>
        <p className="ayuda sin-margen">
          {porcentaje >= 100
            ? '¡Meta cumplida! Ese dinero ya no cuenta como libre para gastar.'
            : `Te faltan ${formatearDinero(meta - fondo.apartadoCentavos)} para tu meta.`}
        </p>
        <div className="acciones">
          <button type="button" className="boton" disabled={fondo.apartadoCentavos === 0} onClick={() => setHoja('usar')}>
            Usar
          </button>
          <button type="button" className="boton primario" onClick={() => setHoja('apartar')}>
            Apartar
          </button>
        </div>
      </div>
      {hoja === 'crear' && <MetaFondo fondo={fondo} sugerida={sugerida} alCerrar={() => setHoja(null)} />}
      {(hoja === 'apartar' || hoja === 'usar') && <MoverFondo accion={hoja} fondo={fondo} cifra={cifra} alCerrar={() => setHoja(null)} />}
    </section>
  );
}

function MetaFondo({ fondo, sugerida, alCerrar }: { fondo: AjustesFondo; sugerida: number; alCerrar: () => void }) {
  const [texto, setTexto] = useState(centavosATexto(fondo.metaCentavos ?? sugerida));
  const [error, setError] = useState('');
  const meta = textoACentavos(texto);
  return (
    <Hoja titulo={fondo.metaCentavos === undefined ? 'Crear fondo de emergencia' : 'Meta del fondo'} alCerrar={alCerrar}>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!meta) return setError('Escribe una meta mayor que cero, por ejemplo 300.00');
          await guardarAjuste('fondo', { metaCentavos: meta });
          alCerrar();
        }}
      >
        <label className="campo">
          <span>Meta</span>
          <input type="text" inputMode="decimal" value={texto} onChange={(e) => { setTexto(e.target.value); setError(''); }} />
          <span className="ayuda sin-margen">
            Sugerida: {formatearDinero(sugerida)}, más o menos un mes de tus gastos. Con el tiempo, lo ideal son tres meses.
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="submit" className="boton primario">
            Guardar
          </button>
        </div>
      </form>
    </Hoja>
  );
}

const MONTOS_RAPIDOS = [500, 1000, 2000, 5000];

function MoverFondo({ accion, fondo, cifra, alCerrar }: { accion: 'apartar' | 'usar'; fondo: AjustesFondo; cifra: number; alCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const monto = textoACentavos(texto);
  const apartar = accion === 'apartar';
  const quedaLibre = monto ? cifra + (apartar ? -monto : monto) : null;
  return (
    <Hoja titulo={apartar ? 'Apartar al fondo' : 'Usar del fondo'} alCerrar={alCerrar}>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          const nuevo = monto ? moverFondo(fondo.apartadoCentavos, accion, monto) : null;
          if (nuevo === null) {
            return setError(
              !monto ? 'Escribe un monto mayor que cero.' : `En el fondo hay ${formatearDinero(fondo.apartadoCentavos)}; no puedes usar más.`,
            );
          }
          await guardarAjuste('fondo', { apartadoCentavos: nuevo });
          alCerrar();
        }}
      >
        <p className="texto-tenue">
          {apartar
            ? 'El dinero sigue en tu cuenta, pero deja de contar como libre para gastar.'
            : 'El dinero vuelve a lo libre para gastar. Después registra el gasto como siempre.'}
        </p>
        <label className="campo">
          <span>Monto</span>
          <input type="text" inputMode="decimal" placeholder="0.00" value={texto} autoFocus onChange={(e) => { setTexto(e.target.value); setError(''); }} />
        </label>
        <div className="chips">
          {(apartar ? MONTOS_RAPIDOS : [...MONTOS_RAPIDOS.filter((m) => m < fondo.apartadoCentavos), fondo.apartadoCentavos]).map((m) => (
            <button key={m} type="button" className="chip" onClick={() => { setTexto(centavosATexto(m)); setError(''); }}>
              {m === fondo.apartadoCentavos && !apartar ? `Todo (${formatearDinero(m)})` : formatearDinero(m)}
            </button>
          ))}
        </div>
        {quedaLibre !== null && (
          <p className={quedaLibre < 0 ? 'aviso alerta' : 'aviso'}>
            {quedaLibre < 0
              ? `Te quedarían ${formatearDinero(quedaLibre)} libres: apartarías dinero que ya es de tus pagos.`
              : `Libre para gastar: ${formatearDinero(quedaLibre)}.`}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="submit" className="boton primario">
            {apartar ? 'Apartar' : 'Usar'}
          </button>
        </div>
      </form>
    </Hoja>
  );
}

// ---------- Resumen del mes que terminó ----------

function ResumenCierre({ cierre: c, alVerAnalisis }: { cierre: CierreMes; alVerAnalisis: () => void }) {
  const mes = nombreMes(c.mes).split(' ')[0];
  const lineas: string[] = [];
  lineas.push(
    c.sobroCentavos >= 0
      ? `Te sobraron ${formatearDinero(c.sobroCentavos)} de lo que entró.`
      : `Salió ${formatearDinero(-c.sobroCentavos)} más de lo que entró.`,
  );
  if (c.bajoDeudaCentavos !== null && c.bajoDeudaCentavos !== 0) {
    lineas.push(
      c.bajoDeudaCentavos > 0
        ? `Tus deudas bajaron ${formatearDinero(c.bajoDeudaCentavos)}.`
        : `Tus deudas subieron ${formatearDinero(-c.bajoDeudaCentavos)}.`,
    );
  }
  if (c.nuevas.length > 0) {
    lineas.push(`Agregaste ${c.nuevas.map((d) => `${d.nombre} (${formatearDinero(d.saldoCentavos)})`).join(' y ')}; no cuenta como deuda nueva.`);
  }
  if (c.mayor) lineas.push(`En lo que más gastaste: ${c.mayor.nombre}, ${formatearDinero(c.mayor.totalCentavos)} (${c.mayor.porcentaje}%).`);
  if (c.contraAnteriorCentavos !== null && Math.abs(c.contraAnteriorCentavos) >= 500) {
    const anterior = nombreMes(moverMesInicio(c.mes, -1)).split(' ')[0].toLowerCase();
    lineas.push(
      c.contraAnteriorCentavos < 0
        ? `Gastaste ${formatearDinero(-c.contraAnteriorCentavos)} menos que en ${anterior}.`
        : `Gastaste ${formatearDinero(c.contraAnteriorCentavos)} más que en ${anterior}.`,
    );
  }
  return (
    <section className="grupo" aria-label={`Así te fue en ${mes.toLowerCase()}`}>
      <div className="cabecera-grupo">
        <h2>Así te fue en {mes.toLowerCase()}</h2>
        <button type="button" className="enlace" onClick={() => void guardarAjuste('inicio', { resumenVisto: c.mes })}>
          Cerrar
        </button>
      </div>
      <dl className="mosaico">
          <div>
            <dt>Entró</dt>
            <dd className="positivo">{formatearDinero(c.entroCentavos)}</dd>
          </div>
          <div>
            <dt>Gastaste</dt>
            <dd>{formatearDinero(c.gastadoCentavos)}</dd>
          </div>
          <div>
            <dt>A deudas</dt>
            <dd>{formatearDinero(c.aDeudasCentavos)}</dd>
          </div>
      </dl>
      <div className="tarjeta cierre-mes">
        <ul className="cierre-lineas">
          {lineas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <button type="button" className="enlace" onClick={alVerAnalisis}>
          Ver análisis
        </button>
      </div>
    </section>
  );
}
