import type { Datos, Detalle, Formulario } from '../datos';
import { Asistente } from '../componentes/Asistente';
import type { Movimiento } from '../db';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { IconoFlecha } from '../componentes/Iconos';
import { Insignia, InsigniaCategoria } from '../componentes/Simbolo';
import { proximosPagos, totalPorPagar, type ProximoPago } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, mesDe, nombreMes, textoFaltan } from '../lib/fechas';
import { calcularDisponible, ordenarRecientes, resumenDesdeUltimoPago } from '../lib/resumen';
import { estadoLimites } from '../lib/limites';
import { omitirRecurrente, pendientes, registrarRecurrente } from '../lib/recurrentes';
import { db } from '../db';

/** Días hacia adelante que se apartan para pagos al calcular lo "libre". */
const DIAS_A_APARTAR = 15;
/** Pagos que se muestran en "Requiere atención". */
const DIAS_ATENCION = 30;
/** Cada cuántos días se recuerda hacer un respaldo. */
const DIAS_ENTRE_RESPALDOS = 7;

interface Props {
  datos: Datos;
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
}

export function Inicio(props: Props) {
  const { datos, alAgregarIngreso, alAgregarGasto, alEditar, alVerTodos, alVerDeudas, alVerAnalisis, alAbrirDeuda, diasSinRespaldo, alRespaldar, alAbrirFormulario } =
    props;
  const { movimientos, mapaCategorias, tarjetas, prestamos } = datos;
  const fechaHoy = hoy();

  if (movimientos.length === 0 && tarjetas.length === 0 && prestamos.length === 0) {
    return (
      <section className="vacio">
        <Insignia color="var(--primario)" simbolo="dinero" />
        <h2>Empieza con tu último pago</h2>
        <p>Registra cuánto te pagaron y la app irá restando cada gasto que anotes, para que siempre sepas cuánto te queda.</p>
        <button type="button" className="boton primario" onClick={alAgregarIngreso}>
          Registrar mi pago
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

  const disponible = calcularDisponible(movimientos);
  const periodo = resumenDesdeUltimoPago(movimientos, fechaHoy);
  const recientes = ordenarRecientes(movimientos).slice(0, 5);
  const proximos = proximosPagos(tarjetas, prestamos, movimientos, fechaHoy);
  const porApartar = totalPorPagar(proximos, DIAS_A_APARTAR);
  const libre = disponible - porApartar;
  const mes = mesDe(fechaHoy);
  const limites = estadoLimites(movimientos, datos.categorias, mes).filter((l) => l.porcentaje >= 80);
  const porConfirmar = pendientes(datos.recurrentes, fechaHoy);
  const atender = proximos.filter((p) => p.vencido || p.dias <= DIAS_ATENCION).slice(0, 3);
  const pedirRespaldo = diasSinRespaldo === null || diasSinRespaldo >= DIAS_ENTRE_RESPALDOS;

  const recibido = periodo ? periodo.pago.montoCentavos + periodo.otrosIngresosCentavos : 0;
  const porcentaje = recibido > 0 ? Math.min(100, Math.round((periodo!.gastadoCentavos / recibido) * 100)) : 0;

  // Resumen del mes: lo que entró, lo que gastaste (también con tarjeta) y lo que pagaste a deudas.
  const delMes = movimientos.filter((m) => mesDe(m.fecha) === mes);
  const suma = (lista: Movimiento[]) => lista.reduce((t, m) => t + m.montoCentavos, 0);
  const entro = suma(delMes.filter((m) => m.tipo === 'ingreso'));
  const gastado = suma(delMes.filter((m) => m.tipo === 'gasto'));
  const aDeudas = suma(delMes.filter((m) => m.tipo === 'pago'));

  const conLibre = porApartar > 0;
  const cifra = conLibre ? libre : disponible;

  return (
    <>
      <section className={cifra < 0 ? 'tarjeta-principal negativo' : 'tarjeta-principal'}>
        <p className="etiqueta">{conLibre ? 'Libre para gastar' : 'Disponible'}</p>
        <p className="monto-grande">{formatearDinero(cifra)}</p>
        <p className="nota-principal">
          {conLibre
            ? `Tienes ${formatearDinero(disponible)} y ${formatearDinero(porApartar)} ya son de pagos de los próximos ${DIAS_A_APARTAR} días.`
            : disponible < 0
              ? 'Ha salido más dinero del que has registrado como ingreso.'
              : 'Lo que has recibido menos lo que ha salido.'}
        </p>
        {periodo ? (
          <>
            <div
              className="barra barra-clara"
              role="progressbar"
              aria-valuenow={porcentaje}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Porcentaje gastado desde tu último pago"
            >
              <div className="barra-relleno" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className="pie-heroe">
              <span>Desde tu pago del {fechaCorta(periodo.pago.fecha)}</span>
              <span>
                Salió {formatearDinero(periodo.gastadoCentavos)} · {porcentaje}%
              </span>
            </p>
          </>
        ) : (
          <button type="button" className="boton boton-heroe" onClick={alAgregarIngreso}>
            Registrar mi pago
          </button>
        )}
      </section>

      <Asistente
        datos={datos}
        alAbrirFormulario={alAbrirFormulario}
        alAbrir={(d) => (d === 'movimientos' ? alVerTodos() : alAbrirDeuda(d))}
      />

      {(atender.length > 0 || porConfirmar.length > 0 || limites.length > 0 || pedirRespaldo) && (
        <section className="grupo">
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
              <FilaPago key={`${p.tipo}-${p.id}`} pago={p} color={colorDeuda(datos, p)} alTocar={() => alAbrirDeuda({ tipo: p.tipo, id: p.id })} />
            ))}
            {porConfirmar.map((r) => {
              const c = r.categoriaId ? mapaCategorias.get(r.categoriaId) : undefined;
              const titulo = r.nota || (r.tipo === 'ingreso' ? (r.esPago ? 'Mi pago' : 'Otro ingreso') : (c?.nombre ?? 'Gasto'));
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
                      {diasSinRespaldo === null
                        ? 'Tus datos solo están en este celular.'
                        : `Tu último respaldo fue hace ${diasSinRespaldo} días.`}
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
      )}

      <section className="grupo">
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

      {recientes.length > 0 && (
        <section className="grupo">
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
      )}
    </>
  );
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function colorDeuda(datos: Datos, p: { tipo: 'tarjeta' | 'prestamo'; id: string }) {
  return p.tipo === 'tarjeta' ? (datos.tarjetas.find((t) => t.id === p.id)?.color ?? 'var(--tenue)') : 'var(--primario)';
}

/** Fila de un pago por hacer: vencido en rojo, en 5 días o menos en naranja. */
export function FilaPago({ pago: p, color, alTocar }: { pago: ProximoPago; color: string; alTocar: () => void }) {
  const clase = p.vencido ? 'fila-detalle texto-peligro' : p.dias <= 5 ? 'fila-detalle texto-alerta' : 'fila-detalle';
  return (
    <li>
      <button type="button" className="fila" onClick={alTocar}>
        <Insignia color={color} simbolo={p.tipo === 'tarjeta' ? 'tarjeta' : 'prestamo'} />
        <span className="fila-texto">
          <span className="fila-titulo">{p.tipo === 'tarjeta' ? `Pagar ${p.nombre}` : `Cuota ${p.nombre}`}</span>
          <span className={clase}>
            {mayuscula(textoFaltan(p.dias))} · {fechaCorta(p.fecha)}
            {p.estimado && ' · estimado'}
          </span>
        </span>
        <span className="fila-monto">{formatearDinero(p.montoCentavos)}</span>
      </button>
    </li>
  );
}

