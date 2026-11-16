import { useState, type ReactNode } from 'react';
import type { Datos, Detalle, Formulario } from '../datos';
import { Asistente } from '../componentes/Asistente';
import { Ayuda } from '../componentes/Ayuda';
import { ComoPagas, textoComoPagas } from '../componentes/ComoPagas';
import { db, type Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { Hoja } from '../componentes/Hoja';
import { IconoAnterior, IconoFlecha, IconoSiguiente } from '../componentes/Iconos';
import { Insignia, InsigniaCategoria, Simbolo } from '../componentes/Simbolo';
import { pagosDelMes, type PagoDelMes } from '../lib/pagosDelMes';
import { guardarAjuste, ordenInicio, type Ajustes, type AjustesFondo, type SeccionInicio } from '../lib/ajustes';
import { moverFondo, sugerirMeta } from '../lib/fondo';
import { cuandoLlega, planDelSueldo, textoProximoSueldo, type PlanSueldo } from '../lib/sueldo';
import { cierreDelMes, mesParaResumen, type CierreMes } from '../lib/cierreMes';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { diasEntre, fechaCorta, hoy, mesDe, moverMes as moverMesInicio, nombreMes } from '../lib/fechas';
import { esPagoDeDeuda, ordenarRecientes } from '../lib/resumen';
import { FormularioSueldo } from '../componentes/FormularioSueldo';
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
  const [verComoPagas, setVerComoPagas] = useState(false);
  const [verSueldo, setVerSueldo] = useState(false);

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
  const opcionesSueldo = { sueldo: ajustes.sueldo, fondoCentavos: ajustes.fondo.apartadoCentavos, ajusteSaldoCentavos: ajustes.saldo.ajusteCentavos };
  const plan = planDelSueldo(datos, fechaHoy, opcionesSueldo);
  const disponible = plan.disponibleCentavos;
  const cifra = plan.libreCentavos;
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

  // Con más salidas que ingresos anotados falta un dato: cuánto dinero hay de verdad.
  const sinSaldo = disponible < 0;
  const hayIngresos = movimientos.some((m) => m.tipo === 'ingreso');

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
        opciones={opcionesSueldo}
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
      <TarjetaFondo key="fondo" fondo={ajustes.fondo} sugerida={sugerirMeta(movimientos, fechaHoy)} cifra={Math.max(0, cifra)} />
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
      <Heroe
        plan={plan}
        sinSaldo={sinSaldo}
        hayIngresos={hayIngresos}
        alCorregirSaldo={props.alCorregirSaldo}
        alAgregarIngreso={alAgregarIngreso}
      />

      {!sinSaldo && (
        <TuSueldo
          plan={plan}
          hayTarjetas={tarjetas.length > 0}
          textoTarjetas={textoComoPagas(tarjetas)}
          alAgregarIngreso={alAgregarIngreso}
          alAjustar={() => setVerSueldo(true)}
          alCambiarTarjetas={() => setVerComoPagas(true)}
        />
      )}

      {cierre && <ResumenCierre cierre={cierre} alVerAnalisis={alVerAnalisis} />}

      {mostrarPasos && <PrimerosPasos pasos={pasos} />}

      {orden.map((s) => secciones[s])}

      <button type="button" className="boton boton-editar-inicio" onClick={() => setEditando(true)}>
        <Simbolo nombre="lapiz" tamano={18} /> Editar Inicio
      </button>
      {editando && <EditarInicio ajustes={ajustes} alCerrar={() => setEditando(false)} />}
      {verSueldo && <FormularioSueldo sueldo={ajustes.sueldo} categorias={datos.categorias} alCerrar={() => setVerSueldo(false)} />}
      {verComoPagas && (
        <ComoPagas
          tarjetas={tarjetas}
          prestamos={prestamos}
          movimientos={movimientos}
          hoy={fechaHoy}
          hasta={plan.periodo.hasta}
          proximo={textoProximoSueldo(plan.periodo)}
          porApartar={plan.deudas.faltaCentavos}
          alCerrar={() => setVerComoPagas(false)}
        />
      )}
    </>
  );
}

// ---------- Próximos pagos ----------

/** Un pago pendiente: el mínimo (o lo que falta del total) de una tarjeta o la cuota de un préstamo. Al tocarlo se registra. */
function FilaPagoDelMes({ pago: p, color, hoy: fechaHoy, alTocar }: { pago: PagoDelMes; color: string; hoy: string; alTocar: () => void }) {
  const dias = diasEntre(fechaHoy, p.fecha);
  const clase = p.vencido ? 'fila-detalle envolver texto-peligro' : dias <= 5 ? 'fila-detalle envolver texto-alerta' : 'fila-detalle envolver';
  const que =
    p.clase === 'minimo' ? (p.estimado ? 'Mínimo aprox.' : 'Mínimo') : p.clase === 'recomendado' ? 'Recomendado' : p.clase === 'total' ? 'Resto del total' : 'Cuota';
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
          {p.totalCentavos !== undefined && (
            <span className="fila-detalle envolver">
              {/* Pasada la fecha, los intereses ya se generaron: solo queda decir cuánto falta en total. */}
              {p.vencido ? 'Total pendiente' : 'Para no pagar intereses'}: {formatearDinero(p.totalCentavos)}
            </span>
          )}
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
        <p className="texto-tenue">Elige qué ver y en qué orden. Lo que te queda para gastar y tu sueldo siempre van arriba.</p>
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
            ? '¡Meta cumplida! Ese dinero ya no cuenta en lo que te queda para gastar.'
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
            ? 'El dinero sigue en tu cuenta, pero deja de contar en lo que te queda para gastar.'
            : 'El dinero vuelve a lo que te queda para gastar. Después registra el gasto como siempre.'}
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
              : `Te quedarían ${formatearDinero(quedaLibre)} para gastar.`}
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

// ---------- Tarjeta de arriba ----------

/** Una sola cifra: lo que te queda para tus demás gastos hasta el próximo sueldo. */
function Heroe({
  plan,
  sinSaldo,
  hayIngresos,
  alCorregirSaldo,
  alAgregarIngreso,
}: {
  plan: PlanSueldo;
  sinSaldo: boolean;
  hayIngresos: boolean;
  alCorregirSaldo: () => void;
  alAgregarIngreso: () => void;
}) {
  const proximo = textoProximoSueldo(plan.periodo);
  if (sinSaldo) {
    // Más salidas que ingresos anotados: en vez de una cifra en negativo, se pide el dato que falta.
    return (
      <section className="tarjeta-principal">
        <p className="etiqueta">Falta un dato</p>
        <p className="titulo-heroe">¿Cuánto dinero tienes hoy?</p>
        <p className="nota-principal">
          {hayIngresos ? 'Has anotado más gastos que ingresos.' : 'Has anotado gastos, pero ningún ingreso.'} Dime cuánto tienes y te
          digo cuánto puedes gastar.
        </p>
        <div className="acciones-heroe">
          <button type="button" className="boton boton-heroe solido" onClick={alCorregirSaldo}>
            Decir cuánto tengo hoy
          </button>
          <button type="button" className="boton boton-heroe" onClick={alAgregarIngreso}>
            Registrar mi sueldo
          </button>
        </div>
      </section>
    );
  }
  const falta = plan.libreCentavos < 0;
  return (
    <section className={falta ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
      <p className="etiqueta">{falta ? 'Te faltan' : 'Te quedan'}</p>
      <p className="monto-grande">{formatearDinero(Math.abs(plan.libreCentavos))}</p>
      <p className="nota-principal">
        {falta
          ? `para tus deudas y tu comida antes de ${proximo}.`
          : plan.periodo.esperando
            ? `para tus demás gastos mientras llega tu sueldo (${cuandoLlega(plan.periodo)}).`
            : `para tus demás gastos hasta ${proximo}.`}
      </p>
      {!falta && plan.porDiaCentavos !== null && (
        <p className="pie-heroe">Unos {formatearDinero(plan.porDiaCentavos)} por día durante {plan.diasRestantes === 1 ? '1 día' : `${plan.diasRestantes} días`}.</p>
      )}
    </section>
  );
}

// ---------- Tu sueldo ----------

/** En qué se va el sueldo: deudas, comida y lo demás, cada uno con lo que llevas y lo que queda. */
function TuSueldo({
  plan,
  hayTarjetas,
  textoTarjetas,
  alAgregarIngreso,
  alAjustar,
  alCambiarTarjetas,
}: {
  plan: PlanSueldo;
  hayTarjetas: boolean;
  textoTarjetas: string;
  alAgregarIngreso: () => void;
  alAjustar: () => void;
  alCambiarTarjetas: () => void;
}) {
  const { periodo, deudas, comida } = plan;
  const totalDeudas = deudas.pagadoCentavos + deudas.faltaCentavos;
  const libre = Math.max(0, plan.libreCentavos);
  // Lo que traías de antes del sueldo, para que las cuentas cuadren.
  const deAntes =
    Math.abs(plan.teniasCentavos) < 100
      ? ''
      : plan.teniasCentavos > 0
        ? ` Además tenías ${formatearDinero(plan.teniasCentavos)} de antes.`
        : ` Antes de este sueldo te faltaban ${formatearDinero(-plan.teniasCentavos)}.`;
  return (
    <section className="grupo" aria-label="Tu sueldo">
      <div className="cabecera-grupo">
        <h2>Tu sueldo</h2>
        <button type="button" className="enlace" onClick={alAjustar}>
          Ajustar
        </button>
      </div>
      <div className="tarjeta sueldo">
        {periodo.esperando && (
          <div className="sueldo-falta">
            <p>Tu sueldo de este mes llega {cuandoLlega(periodo)}. Regístralo cuando te paguen.</p>
            <button type="button" className="boton chico primario" onClick={alAgregarIngreso}>
              Registrar mi sueldo
            </button>
          </div>
        )}
        {periodo.sueldo ? (
          <p className="sueldo-recibido">
            Recibiste <strong>{formatearDinero(periodo.sueldo.montoCentavos)}</strong> el {fechaCorta(periodo.sueldo.fecha)}
            {plan.ingresosCentavos > periodo.sueldo.montoCentavos &&
              ` y ${formatearDinero(plan.ingresosCentavos - periodo.sueldo.montoCentavos)} de otros ingresos`}
            .{deAntes}
          </p>
        ) : (
          <div className="sueldo-falta">
            <p>Aún no registras tu sueldo de este periodo.{deAntes}</p>
            <button type="button" className="boton chico primario" onClick={alAgregarIngreso}>
              Registrar mi sueldo
            </button>
          </div>
        )}

        <Apartado
          titulo="Deudas"
          monto={totalDeudas}
          usado={deudas.pagadoCentavos}
          detalle={
            totalDeudas === 0
              ? 'Nada que pagar antes de tu próximo sueldo.'
              : deudas.faltaCentavos === 0
                ? 'Ya pagaste todo lo de este periodo.'
                : `Pagaste ${formatearDinero(deudas.pagadoCentavos)} · faltan ${formatearDinero(deudas.faltaCentavos)}`
          }
        >
          {hayTarjetas && (
            <button type="button" className="enlace enlace-chico" onClick={alCambiarTarjetas}>
              {textoTarjetas} · Cambiar
            </button>
          )}
        </Apartado>

        {comida ? (
          <Apartado
            titulo="Comida"
            monto={comida.presupuestoCentavos}
            usado={comida.gastadoCentavos}
            detalle={
              (comida.gastadoCentavos > comida.presupuestoCentavos
                ? `Gastaste ${formatearDinero(comida.gastadoCentavos)} · te pasaste ${formatearDinero(comida.gastadoCentavos - comida.presupuestoCentavos)}`
                : `Gastaste ${formatearDinero(comida.gastadoCentavos)} · quedan ${formatearDinero(comida.quedaCentavos)}`) +
              (comida.conTarjetaCentavos > 0 ? `. ${formatearDinero(comida.conTarjetaCentavos)} fueron con tarjeta: ese dinero queda apartado para pagarla.` : '')
            }
          />
        ) : (
          <button type="button" className="fila apartado-agregar" onClick={alAjustar}>
            <span className="fila-texto">
              <span className="fila-titulo">¿Te dan bono de comida?</span>
              <span className="fila-detalle envolver">Agrégalo y la app lo aparta de tu sueldo y lleva la cuenta de lo que gastas en comida.</span>
            </span>
            <span className="opcion-flecha" aria-hidden="true">
              <IconoFlecha />
            </span>
          </button>
        )}

        <Apartado
          titulo="Lo demás"
          monto={plan.otrosCentavos + libre}
          usado={plan.otrosCentavos}
          detalle={
            plan.libreCentavos < 0
              ? `Gastaste ${formatearDinero(plan.otrosCentavos)} · te faltan ${formatearDinero(-plan.libreCentavos)} para cubrir deudas y comida`
              : `Gastaste ${formatearDinero(plan.otrosCentavos)} · te quedan ${formatearDinero(libre)}`
          }
        />

        {plan.fondoCentavos > 0 && (
          <p className="ayuda sin-margen">Además, {formatearDinero(plan.fondoCentavos)} están apartados en tu fondo de emergencia.</p>
        )}
      </div>
    </section>
  );
}

/** Un apartado del sueldo con su barra: cuánto llevas de cuánto. */
function Apartado({
  titulo,
  monto,
  usado,
  detalle,
  children,
}: {
  titulo: string;
  monto: number;
  /** Lo que ya se usó; sin él no hay barra. */
  usado?: number;
  detalle: string;
  children?: ReactNode;
}) {
  const pasado = usado !== undefined && usado > monto;
  const porcentaje = usado === undefined || monto <= 0 ? 0 : Math.min(100, Math.round((usado / monto) * 100));
  return (
    <div className="apartado">
      <div className="apartado-cabecera">
        <span className="fila-titulo">{titulo}</span>
        <span className="apartado-monto">{formatearDinero(monto)}</span>
      </div>
      {usado !== undefined && monto > 0 && (
        <div className="barra" role="progressbar" aria-label={titulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje}>
          <div className={pasado ? 'barra-relleno peligro' : 'barra-relleno'} style={{ width: `${Math.max(2, porcentaje)}%` }} />
        </div>
      )}
      <span className={pasado ? 'fila-detalle envolver texto-peligro' : 'fila-detalle envolver'}>{detalle}</span>
      {children}
    </div>
  );
}
