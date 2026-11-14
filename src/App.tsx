import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formularioParaEditar, type Datos, type Detalle, type Formulario } from './datos';
import { db, type Movimiento } from './db';
import { FormularioMovimiento } from './componentes/FormularioMovimiento';
import { FormularioPago } from './componentes/FormularioPago';
import { FormularioPrestamo } from './componentes/FormularioPrestamo';
import { FormularioTarjeta } from './componentes/FormularioTarjeta';
import { Bloqueo } from './componentes/Bloqueo';
import { FormularioRecordatorios } from './componentes/FormularioRecordatorios';
import { FormularioRecurrente } from './componentes/FormularioRecurrente';
import { movimientosACsv } from './lib/csv';
import type { Recurrente } from './db';
import { Opcion } from './componentes/Opcion';
import { RevisionEstado } from './componentes/RevisionEstado';
import { IconoAjustes, IconoDeudas, IconoInicio, IconoLista, IconoMas } from './componentes/Iconos';
import { ErrorEstado, leerEstadoTarjeta } from './lib/estados/leer';
import { extraerPaginas } from './lib/estados/pdf';
import { useAjustes } from './lib/ajustes';
import { copiarSiToca } from './lib/copias';
import { hoy, mesDe } from './lib/fechas';
import { formatearDinero } from './lib/dinero';
import { fotoDeHoy, guardarFoto } from './lib/historial';
import { generarRecordatorios } from './lib/recordatorios';
import { avisoLimite, gastadoEnMes } from './lib/limites';
import {
  agendarNotificaciones,
  entregarArchivo,
  consumirSalidaPropia,
  escucharBotonAtras,
  escucharNotificaciones,
  escucharPrimerPlano,
  marcarSalidaPropia,
  pantallaPrivada,
} from './lib/nativo';
import { Ajustes } from './pantallas/Ajustes';
import { Deudas } from './pantallas/Deudas';
import { DetallePrestamo } from './pantallas/DetallePrestamo';
import { DetalleTarjeta } from './pantallas/DetalleTarjeta';
import { Inicio } from './pantallas/Inicio';
import { Movimientos } from './pantallas/Movimientos';
import { PlanDeudas } from './pantallas/PlanDeudas';

type Pestana = 'inicio' | 'movimientos' | 'deudas' | 'ajustes';

const PESTANAS: Array<{ id: Pestana; nombre: string; Icono: () => React.JSX.Element }> = [
  { id: 'inicio', nombre: 'Inicio', Icono: IconoInicio },
  { id: 'movimientos', nombre: 'Movimientos', Icono: IconoLista },
  { id: 'deudas', nombre: 'Deudas', Icono: IconoDeudas },
  { id: 'ajustes', nombre: 'Ajustes', Icono: IconoAjustes },
];

export function App() {
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info' } | null>(null);
  // Los avisos informativos se cierran solos; los errores esperan a que se lean.
  useEffect(() => {
    if (aviso?.tipo !== 'info') return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);
  const [leyendo, setLeyendo] = useState(false);
  const entradaPdf = useRef<HTMLInputElement>(null);
  const tarjetaParaImportar = useRef<string | undefined>(undefined);

  const movimientos = useLiveQuery(() => db.movimientos.toArray(), []);
  const categorias = useLiveQuery(() => db.categorias.orderBy('orden').toArray(), []);
  const tarjetas = useLiveQuery(() => db.tarjetas.toArray(), []);
  const prestamos = useLiveQuery(() => db.prestamos.toArray(), []);
  const recurrentes = useLiveQuery(() => db.recurrentes.toArray(), []);
  const historial = useLiveQuery(() => db.historial.toArray(), []);

  const ajustes = useAjustes();
  // null hasta saber si hay bloqueo, para no mostrar nada antes de tiempo.
  const [bloqueado, setBloqueado] = useState<boolean | null>(null);
  if (ajustes && bloqueado === null) setBloqueado(ajustes.bloqueo.activo);
  if (ajustes && bloqueado && !ajustes.bloqueo.activo) setBloqueado(false);

  // Volver a pedir el PIN si la app estuvo en segundo plano más del tiempo elegido.
  const ajustesActuales = useRef(ajustes);
  ajustesActuales.current = ajustes;
  useEffect(() => {
    let enFondoDesde = 0;
    return escucharPrimerPlano((activa) => {
      if (!activa) {
        enFondoDesde = Date.now();
        return;
      }
      const b = ajustesActuales.current?.bloqueo;
      if (consumirSalidaPropia() || !b?.activo || enFondoDesde === 0) return;
      if (Date.now() - enFondoDesde >= b.esperaMinutos * 60_000) setBloqueado(true);
    });
  }, []);

  const bloqueoActivo = ajustes?.bloqueo.activo;
  useEffect(() => {
    if (bloqueoActivo !== undefined) void pantallaPrivada(bloqueoActivo);
  }, [bloqueoActivo]);

  const datos = useMemo<Datos | null>(() => {
    if (!movimientos || !categorias || !tarjetas || !prestamos || !recurrentes || !historial) return null;
    return {
      movimientos,
      categorias,
      mapaCategorias: new Map(categorias.map((c) => [c.id, c])),
      tarjetas: [...tarjetas].sort((a, b) => a.creadoEn - b.creadoEn),
      prestamos: [...prestamos].sort((a, b) => a.creadoEn - b.creadoEn),
      recurrentes: [...recurrentes].sort((a, b) => a.creadoEn - b.creadoEn),
      historial,
    };
  }, [movimientos, categorias, tarjetas, prestamos, recurrentes, historial]);

  // Foto mensual de deudas y disponible para las gráficas, y copia diaria.
  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => void guardarFoto(db, fotoDeHoy(datos, hoy())), 800);
    return () => clearTimeout(t);
  }, [datos]);
  const desbloqueada = bloqueado === false;
  const hayDatos = !!datos && datos.movimientos.length + datos.tarjetas.length + datos.prestamos.length > 0;
  useEffect(() => {
    if (desbloqueada && hayDatos) void copiarSiToca().catch(() => undefined);
  }, [desbloqueada, hayDatos]);

  // Reprograma las notificaciones cuando cambian los datos o los ajustes.
  const recordatorios = ajustes?.recordatorios;
  const respaldoAjustes = ajustes?.respaldo;
  useEffect(() => {
    if (!datos || !recordatorios || !respaldoAjustes) return;
    const t = setTimeout(() => {
      const lista = generarRecordatorios({ ...datos, ajustes: { recordatorios, respaldo: respaldoAjustes } }, new Date());
      void agendarNotificaciones(lista).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [datos, recordatorios, respaldoAjustes]);

  // Tocar una notificación abre la deuda; su botón abre el formulario de pago.
  useEffect(
    () =>
      escucharNotificaciones(({ destino, pagar }) => {
        const d = destino as { tipo?: string; id?: string } | null;
        if (d?.tipo === 'ajustes') {
          setPestana('ajustes');
          setDetalle(null);
          return;
        }
        if ((d?.tipo === 'tarjeta' || d?.tipo === 'prestamo') && d.id) {
          setPestana('deudas');
          setDetalle({ tipo: d.tipo, id: d.id });
          if (pagar) {
            setFormulario(d.tipo === 'tarjeta' ? { clase: 'pago', tarjetaId: d.id } : { clase: 'pago', prestamoId: d.id });
          }
        }
      }),
    [],
  );
  const [verRecordatorios, setVerRecordatorios] = useState(false);
  const [recurrenteAbierto, setRecurrenteAbierto] = useState<Recurrente | null>(null);

  async function exportarCsv(d: Datos) {
    try {
      await entregarArchivo(`mis-finanzas-movimientos-${hoy()}.csv`, movimientosACsv(d.movimientos, d), 'text/csv');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setAviso({ texto: 'No se pudo exportar.', tipo: 'error' });
    }
  }

  // Botón Atrás de Android: cierra el formulario abierto, luego el detalle,
  // luego vuelve a Inicio y solo entonces deja que la app se minimice.
  const estado = useRef({ pestana, detalle });
  estado.current = { pestana, detalle };
  useEffect(
    () =>
      escucharBotonAtras(() => {
        if (document.querySelector('dialog.pantalla-bloqueo[open]')) return false;
        const hoja = document.querySelector('dialog[open]');
        if (hoja) {
          hoja.dispatchEvent(new Event('cancel', { cancelable: true }));
          return true;
        }
        if (estado.current.detalle) {
          setDetalle(null);
          return true;
        }
        if (estado.current.pestana !== 'inicio') {
          setPestana('inicio');
          return true;
        }
        return false;
      }),
    [],
  );

  const irA = (id: Pestana) => {
    setPestana(id);
    setDetalle(null);
    window.scrollTo(0, 0);
  };
  const abrirDeuda = (d: Detalle) => {
    setPestana('deudas');
    setDetalle(d);
    window.scrollTo(0, 0);
  };
  const editar = (m: Movimiento) => {
    const f = formularioParaEditar(m);
    if (f.clase === 'pago') {
      const existe = datos?.tarjetas.some((t) => t.id === f.tarjetaId) || datos?.prestamos.some((p) => p.id === f.prestamoId);
      if (!existe) {
        // La tarjeta o el préstamo ya no existe: solo se puede borrar el pago.
        if (window.confirm('La deuda de este pago fue eliminada. ¿Eliminar también el pago?')) void db.movimientos.delete(m.id);
        return;
      }
    }
    setFormulario(f);
  };

  const importarEstado = (tarjetaId?: string) => {
    tarjetaParaImportar.current = tarjetaId;
    setAviso(null);
    marcarSalidaPropia();
    entradaPdf.current?.click();
  };
  async function leerPdf(archivo: File) {
    setLeyendo(true);
    try {
      const estado = leerEstadoTarjeta(await extraerPaginas(archivo));
      setFormulario({ clase: 'estado', estado, tarjetaId: tarjetaParaImportar.current });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setAviso({ texto: e instanceof ErrorEstado ? e.message : 'No pude leer este PDF.', tipo: 'error' });
    } finally {
      setLeyendo(false);
    }
  }

  // Días desde el último respaldo externo (null = nunca), para el aviso de Inicio.
  const ultimoRespaldo = ajustes?.respaldo.ultimoExterno;
  const diasSinRespaldo = ultimoRespaldo ? Math.floor((Date.now() - Date.parse(ultimoRespaldo)) / 86_400_000) : null;

  const tarjetaAbierta = detalle?.tipo === 'tarjeta' ? datos?.tarjetas.find((t) => t.id === detalle.id) : undefined;
  const prestamoAbierto = detalle?.tipo === 'prestamo' ? datos?.prestamos.find((p) => p.id === detalle.id) : undefined;

  function contenido(d: Datos) {
    switch (pestana) {
      case 'inicio':
        return (
          <Inicio
            datos={d}
            alAgregarIngreso={() => setFormulario({ clase: 'movimiento', tipo: 'ingreso' })}
            alAgregarGasto={() => setFormulario({ clase: 'movimiento', tipo: 'gasto' })}
            alEditar={editar}
            alVerTodos={() => irA('movimientos')}
            alVerDeudas={() => irA('deudas')}
            alAbrirDeuda={abrirDeuda}
            diasSinRespaldo={diasSinRespaldo}
            alRespaldar={() => irA('ajustes')}
          />
        );
      case 'movimientos':
        return <Movimientos datos={d} alEditar={editar} />;
      case 'deudas':
        if (detalle?.tipo === 'plan') {
          return <PlanDeudas datos={d} ajustes={ajustes!.plan} alVolver={() => setDetalle(null)} alAbrir={abrirDeuda} />;
        }
        if (tarjetaAbierta) {
          return (
            <DetalleTarjeta
              tarjeta={tarjetaAbierta}
              datos={d}
              alVolver={() => setDetalle(null)}
              alEditarTarjeta={() => setFormulario({ clase: 'tarjeta', tarjeta: tarjetaAbierta })}
              alPagar={() => setFormulario({ clase: 'pago', tarjetaId: tarjetaAbierta.id })}
              alComprar={() => setFormulario({ clase: 'movimiento', tipo: 'gasto', tarjetaId: tarjetaAbierta.id })}
              alImportar={() => importarEstado(tarjetaAbierta.id)}
              alEditarMovimiento={editar}
            />
          );
        }
        if (prestamoAbierto) {
          return (
            <DetallePrestamo
              prestamo={prestamoAbierto}
              datos={d}
              alVolver={() => setDetalle(null)}
              alEditarPrestamo={() => setFormulario({ clase: 'prestamo', prestamo: prestamoAbierto })}
              alPagarCuota={() => setFormulario({ clase: 'pago', prestamoId: prestamoAbierto.id })}
              alAbonoExtra={() => setFormulario({ clase: 'pago', prestamoId: prestamoAbierto.id, extra: true })}
              alEditarMovimiento={editar}
            />
          );
        }
        return (
          <Deudas
            datos={d}
            alAbrir={abrirDeuda}
            alNuevaTarjeta={() => setFormulario({ clase: 'tarjeta' })}
            alNuevoPrestamo={() => setFormulario({ clase: 'prestamo' })}
            alImportar={() => importarEstado()}
            plan={ajustes!.plan}
          />
        );
      case 'ajustes':
        return (
          <Ajustes categorias={d.categorias} totalMovimientos={d.movimientos.length} ajustes={ajustes!}>
            <section className="tarjeta">
              <h2>Recordatorios</h2>
              <ul className="lista">
                <Opcion
                  icono="🔔"
                  titulo="Avisos de pago y corte"
                  detalle={
                    ajustes!.recordatorios.activo
                      ? `Activados a las ${ajustes!.recordatorios.hora}`
                      : 'Te avisa antes de cada fecha de pago y corte'
                  }
                  valor={ajustes!.recordatorios.activo ? 'Activados' : 'Desactivados'}
                  alTocar={() => setVerRecordatorios(true)}
                />
              </ul>
            </section>
            <section className="tarjeta">
              <h2>Se repiten cada mes</h2>
              {d.recurrentes.length === 0 ? (
                <p className="texto-tenue">
                  Al registrar un gasto o ingreso, activa “Se repite cada mes” y la app te lo propondrá cada mes.
                </p>
              ) : (
                <ul className="lista">
                  {d.recurrentes.map((r) => {
                    const c = r.categoriaId ? d.mapaCategorias.get(r.categoriaId) : undefined;
                    return (
                      <Opcion
                        key={r.id}
                        icono={r.tipo === 'ingreso' ? '💵' : (c?.emoji ?? '🔁')}
                        titulo={r.nota || c?.nombre || (r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto')}
                        detalle={r.activo ? `El día ${r.dia} de cada mes` : 'En pausa'}
                        valor={formatearDinero(r.montoCentavos)}
                        alTocar={() => setRecurrenteAbierto(r)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="tarjeta">
              <h2>Exportar</h2>
              <ul className="lista">
                <Opcion
                  icono="📊"
                  titulo="Movimientos a Excel (CSV)"
                  detalle={`${d.movimientos.length} movimientos, para abrir en Excel o Google Sheets`}
                  alTocar={() => void exportarCsv(d)}
                />
              </ul>
            </section>
          </Ajustes>
        );
    }
  }

  function hoja(f: Formulario, d: Datos) {
    const cerrar = () => setFormulario(null);
    switch (f.clase) {
      case 'movimiento':
        return (
          <FormularioMovimiento
            movimiento={f.movimiento}
            tipoInicial={f.tipo}
            categorias={d.categorias}
            tarjetas={d.tarjetas}
            tarjetaInicial={f.tarjetaId}
            alCerrar={cerrar}
            alGuardar={(m) => {
              const c = m.tipo === 'gasto' && m.categoriaId ? d.mapaCategorias.get(m.categoriaId) : undefined;
              if (!c?.limiteCentavos) return;
              const antes = gastadoEnMes(d.movimientos, c.id, mesDe(m.fecha), m.id);
              const texto = avisoLimite(c, antes, antes + m.montoCentavos);
              if (texto) setAviso({ texto, tipo: 'info' });
            }}
          />
        );
      case 'pago': {
        const tarjeta = d.tarjetas.find((t) => t.id === f.tarjetaId);
        const prestamo = d.prestamos.find((p) => p.id === f.prestamoId);
        if (!tarjeta && !prestamo) return null;
        return (
          <FormularioPago
            tarjeta={tarjeta}
            prestamo={prestamo}
            movimientos={d.movimientos}
            movimiento={f.movimiento}
            extraInicial={f.extra}
            alCerrar={cerrar}
          />
        );
      }
      case 'tarjeta':
        return <FormularioTarjeta tarjeta={f.tarjeta} cantidad={d.tarjetas.length} alCerrar={cerrar} />;
      case 'prestamo':
        return <FormularioPrestamo prestamo={f.prestamo} alCerrar={cerrar} />;
      case 'estado':
        return (
          <RevisionEstado
            estado={f.estado}
            datos={d}
            tarjetaPreferida={f.tarjetaId}
            alCerrar={cerrar}
            alGuardar={(id) => {
              cerrar();
              abrirDeuda({ tipo: 'tarjeta', id });
            }}
          />
        );
    }
  }

  const titulo = pestana === 'inicio' ? 'Mis Finanzas' : PESTANAS.find((p) => p.id === pestana)!.nombre;

  if (!ajustes || bloqueado === null) return <div className="app" />;

  return (
    <div className={bloqueado ? 'app oculta' : 'app'}>
      {bloqueado && <Bloqueo ajustes={ajustes.bloqueo} alDesbloquear={() => setBloqueado(false)} />}
      <header className="cabecera">
        <h1>{titulo}</h1>
      </header>

      <main className="contenido">{datos && contenido(datos)}</main>

      {(pestana === 'inicio' || pestana === 'movimientos') && (
        <button
          type="button"
          className="boton-flotante"
          onClick={() => setFormulario({ clase: 'movimiento', tipo: 'gasto' })}
          aria-label="Agregar movimiento"
        >
          <IconoMas />
        </button>
      )}

      <nav className="navegacion" aria-label="Secciones">
        {PESTANAS.map(({ id, nombre, Icono }) => (
          <button key={id} type="button" aria-current={pestana === id ? 'page' : undefined} onClick={() => irA(id)}>
            <Icono />
            <span>{nombre}</span>
          </button>
        ))}
      </nav>

      {formulario && datos && hoja(formulario, datos)}
      {recurrenteAbierto && datos && (
        <FormularioRecurrente
          recurrente={recurrenteAbierto}
          categorias={datos.categorias}
          tarjetas={datos.tarjetas}
          alCerrar={() => setRecurrenteAbierto(null)}
        />
      )}
      {verRecordatorios && datos && (
        <FormularioRecordatorios ajustes={ajustes} datos={datos} alCerrar={() => setVerRecordatorios(false)} />
      )}

      <input
        ref={entradaPdf}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) void leerPdf(archivo);
        }}
      />
      {(leyendo || aviso) && (
        <div className={aviso?.tipo === 'error' ? 'toast error' : aviso ? 'toast info' : 'toast'} role={aviso ? 'alert' : 'status'}>
          <span>{aviso?.texto ?? 'Leyendo el estado de cuenta…'}</span>
          {aviso && (
            <button type="button" className="enlace" onClick={() => setAviso(null)}>
              Cerrar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
