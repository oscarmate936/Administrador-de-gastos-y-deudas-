import { useMemo, useRef, useState } from 'react';
import { COLORES, type Datos } from '../datos';
import { db } from '../db';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';
import {
  buscarTarjeta,
  esEstadoViejo,
  movimientosDesdeFilas,
  nombreSugerido,
  prepararFilas,
  tarjetaDesdeEstado,
  type FilaImportar,
} from '../lib/estados/importar';
import type { EstadoCuentaTarjeta } from '../lib/estados/tipos';
import { Hoja } from './Hoja';
import { Simbolo } from './Simbolo';

interface Props {
  estado: EstadoCuentaTarjeta;
  datos: Datos;
  /** Tarjeta desde la que se abrió la importación, si fue desde su detalle. */
  tarjetaPreferida?: string;
  alCerrar: () => void;
  alGuardar: (tarjetaId: string) => void;
}

const NUEVA = 'nueva';

export function RevisionEstado({ estado, datos, tarjetaPreferida, alCerrar, alGuardar }: Props) {
  const [destino, setDestino] = useState(
    () => buscarTarjeta(estado, datos.tarjetas)?.id ?? (tarjetaPreferida && datos.tarjetas.some((t) => t.id === tarjetaPreferida) ? tarjetaPreferida : NUEVA),
  );
  const [nombre, setNombre] = useState(nombreSugerido(estado));
  const tarjeta = datos.tarjetas.find((t) => t.id === destino);
  const categoriasExistentes = useMemo(() => new Set(datos.categorias.map((c) => c.id)), [datos.categorias]);
  const filasIniciales = useMemo(
    () => prepararFilas(estado, datos.movimientos, tarjeta?.id, categoriasExistentes),
    // Se recalculan solo al cambiar de tarjeta, para no perder lo que la persona marcó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estado, tarjeta?.id],
  );
  const [cambios, setCambios] = useState<{ para: string; filas: FilaImportar[] }>({ para: destino, filas: filasIniciales });
  const filas = cambios.para === destino ? cambios.filas : filasIniciales;
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cambiarFila = (i: number, cambio: Partial<FilaImportar>) =>
    setCambios({ para: destino, filas: filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)) });
  const marcarCargos = (incluir: boolean) =>
    setCambios({ para: destino, filas: filas.map((f) => (f.mov.tipo === 'cargo' && !f.duplicado ? { ...f, incluir } : f)) });

  const viejo = esEstadoViejo(estado, tarjeta);
  const otrosDigitos = tarjeta?.ultimos4 && estado.ultimos4 && tarjeta.ultimos4 !== estado.ultimos4;
  const marcados = filas.filter((f) => f.incluir).length;

  const enviando = useRef(false);

  async function guardar() {
    // Un segundo toque antes de que la pantalla se actualice no debe importar dos veces.
    if (enviando.current) return;
    enviando.current = true;
    setError('');
    setGuardando(true);
    try {
      const nueva = tarjetaDesdeEstado(estado, tarjeta, {
        nombre,
        color: COLORES[(2 + datos.tarjetas.length * 3) % COLORES.length],
      });
      const movimientos = movimientosDesdeFilas(filas, nueva.id);
      await db.transaction('rw', db.tarjetas, db.movimientos, async () => {
        await db.tarjetas.put(nueva);
        await db.movimientos.bulkAdd(movimientos);
      });
      alGuardar(nueva.id);
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
      setGuardando(false);
      enviando.current = false;
    }
  }

  return (
    <Hoja titulo="Revisar estado de cuenta" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">
          {estado.banco} · {estado.producto}
          {estado.ultimos4 && ` terminada en ${estado.ultimos4}`}
        </p>

        <dl className="datos-lista">
          <div>
            <dt>Fecha de corte</dt>
            <dd>{fechaCorta(estado.fechaCorte)}</dd>
          </div>
          <div>
            <dt>Último día de pago</dt>
            <dd>{fechaCorta(estado.fechaLimite)}</dd>
          </div>
          <div>
            <dt>Pago de contado</dt>
            <dd>{formatearDinero(estado.pagoContadoCentavos)}</dd>
          </div>
          {estado.pagoMinimoCentavos !== null && (
            <div>
              <dt>Pago mínimo</dt>
              <dd>{formatearDinero(estado.pagoMinimoCentavos)}</dd>
            </div>
          )}
          <div>
            <dt>Saldo de la tarjeta al corte</dt>
            <dd>{formatearDinero(estado.saldoCentavos)}</dd>
          </div>
          {estado.planes.map((p, i) => (
            <div key={i}>
              <dt>
                {p.descripcion} · cuota {p.cuotaActual} de {p.cuotasTotales}
              </dt>
              <dd>{formatearDinero(p.saldoCentavos)}</dd>
            </div>
          ))}
          {estado.planes.length > 0 && (
            <div>
              <dt>Deuda total con plazos</dt>
              <dd>{formatearDinero(estado.saldoCentavos + estado.planes.reduce((t, p) => t + p.saldoCentavos, 0))}</dd>
            </div>
          )}
          {estado.limiteCentavos !== null && (
            <div>
              <dt>Límite de crédito</dt>
              <dd>{formatearDinero(estado.limiteCentavos)}</dd>
            </div>
          )}
          {estado.tasaAnual !== null && (
            <div>
              <dt>Tasa de interés anual</dt>
              <dd>{estado.tasaAnual}%</dd>
            </div>
          )}
        </dl>

        <fieldset className="campo">
          <legend>¿A qué tarjeta corresponde?</legend>
          <div className="chips">
            {datos.tarjetas.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={destino === t.id} onClick={() => setDestino(t.id)}>
                <span className="marca-categoria" style={{ color: t.color }}><Simbolo nombre="tarjeta" tamano={16} /></span> {t.nombre}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={destino === NUEVA} onClick={() => setDestino(NUEVA)}>
              Tarjeta nueva
            </button>
          </div>
        </fieldset>

        {destino === NUEVA && (
          <label className="campo">
            <span>Nombre de la tarjeta</span>
            <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
          </label>
        )}

        {otrosDigitos && (
          <p className="aviso error">
            Esta tarjeta termina en {tarjeta!.ultimos4} y el estado de cuenta en {estado.ultimos4}. Revisa que sea la correcta.
          </p>
        )}
        {viejo ? (
          <p className="aviso error">
            Esta tarjeta ya tiene datos de un corte más reciente. No se cambiarán su saldo ni sus fechas: solo se agregarán
            los movimientos que marques.
          </p>
        ) : (
          tarjeta && (
            <p className="ayuda sin-margen">
              Se actualizarán el saldo, el pago de contado, el pago mínimo, el límite y las fechas de la tarjeta con este
              estado de cuenta.
            </p>
          )
        )}

        <section className="campo">
          <div className="cabecera-seccion">
            <h3 className="subtitulo">
              Movimientos · {marcados} de {filas.length} marcados
            </h3>
          </div>
          {estado.totalesCuadran === false && (
            <p className="aviso error">
              Los movimientos que pude leer no suman lo mismo que los totales del estado de cuenta: puede faltar alguno.
            </p>
          )}
          {estado.totalesCuadran === true && <p className="ayuda sin-margen positivo">Suman lo mismo que los totales del banco.</p>}
          <p className="ayuda sin-margen">
            Las compras se guardan como historial para ver en qué gastas; no cambian la deuda, que ya viene en el saldo. Los
            pagos a la tarjeta van sin marcar: márcalos solo si no los registraste y quieres que se resten de tu disponible.
          </p>
          {filas.some((f) => f.mov.tipo === 'cargo' && !f.duplicado) && (
            <div className="chips">
              <button type="button" className="chip" onClick={() => marcarCargos(true)}>
                Marcar todas las compras
              </button>
              <button type="button" className="chip" onClick={() => marcarCargos(false)}>
                Desmarcar todas
              </button>
            </div>
          )}
          <ul className="lista-importar">
            {filas.map((f, i) => (
              <li key={i} className={f.incluir ? 'fila-importar marcada' : 'fila-importar'}>
                <label className="fila-importar-principal">
                  <input type="checkbox" checked={f.incluir} onChange={(e) => cambiarFila(i, { incluir: e.target.checked })} />
                  <span className="fila-texto">
                    <span className="fila-titulo">{f.mov.concepto || (f.mov.tipo === 'cargo' ? 'Cargo' : 'Abono')}</span>
                    <span className="fila-detalle">
                      {fechaCorta(f.mov.fecha)}
                      {f.mov.tipo === 'abono' && ' · pago a la tarjeta'}
                      {f.duplicado && (f.registradoEl ? ` · ya registrado el ${fechaCorta(f.registradoEl)}` : ' · ya registrado')}
                    </span>
                  </span>
                  <span className={f.mov.tipo === 'abono' ? 'fila-monto positivo' : 'fila-monto'}>
                    {f.mov.tipo === 'abono' ? '−' : ''}
                    {formatearDinero(f.mov.montoCentavos)}
                  </span>
                </label>
                {f.mov.tipo === 'cargo' && f.incluir && (
                  <select
                    className="selector-categoria"
                    aria-label={`Categoría de ${f.mov.concepto}`}
                    value={f.categoriaId ?? ''}
                    onChange={(e) => cambiarFila(i, { categoriaId: e.target.value || undefined })}
                  >
                    <option value="">Sin categoría</option>
                    {datos.categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </section>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="button" className="boton primario" onClick={guardar} disabled={guardando}>
            {destino === NUEVA ? 'Crear tarjeta' : 'Guardar'}
            {marcados > 0 && ` y ${marcados} ${marcados === 1 ? 'movimiento' : 'movimientos'}`}
          </button>
        </div>
      </div>
    </Hoja>
  );
}
