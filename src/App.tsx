import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formularioParaEditar, type Datos, type Detalle, type Formulario } from './datos';
import { db, type Movimiento } from './db';
import { FormularioMovimiento } from './componentes/FormularioMovimiento';
import { FormularioPago } from './componentes/FormularioPago';
import { FormularioPrestamo } from './componentes/FormularioPrestamo';
import { FormularioSaldo } from './componentes/FormularioSaldo';
import { FormularioSueldo } from './componentes/FormularioSueldo';
import { planDelSueldo } from './lib/sueldo';
import { FormularioTarjeta } from './componentes/FormularioTarjeta';
import { Bloqueo } from './componentes/Bloqueo';
import { FormularioRecordatorios } from './componentes/FormularioRecordatorios';
import { FormularioRecurrente } from './componentes/FormularioRecurrente';
import { movimientosACsv } from './lib/csv';
import type { Recurrente } from './db';
import { Opcion } from './componentes/Opcion';
import { RevisionEstado } from './componentes/RevisionEstado';
import { IconoAnalisis, IconoAnterior, IconoDeudas, IconoInicio, IconoLista, IconoMas } from './componentes/Iconos';
import { Agregar } from './componentes/Agregar';
import { Hoja } from './componentes/Hoja';
import { deudaTotalActual, hitosNuevos, prestamosSaldados, progresoDeudas } from './lib/progreso';
import { resumenWidget } from './lib/widget';
import { Insignia, InsigniaCategoria, Simbolo } from './componentes/Simbolo';
import { ErrorEstado, leerEstadoTarjeta } from './lib/estados/leer';
import { extraerPaginas } from './lib/estados/pdf';
import { guardarAjuste, useAjustes } from './lib/ajustes';
import { copiarSiToca } from './lib/copias';
import { hoy, mesDe } from './lib/fechas';
import { formatearDinero } from './lib/dinero';
import { calcularDisponible } from './lib/resumen';
import { esClavePago, pagoRapido, type ClavePago } from './lib/pagoRapido';
import { compartirRespaldo, leerClave, respaldarSiToca } from './lib/respaldoAuto';
import { fotoDeHoy, guardarFoto } from './lib/historial';
import { generarRecordatorios } from './lib/recordatorios';
import { avisoLimite, gastadoEnMes } from './lib/limites';
import {
  agendarNotificaciones,
  entregarArchivo,
  consumirSalidaPropia,
  escucharBotonAtras,
  escucharNotificaciones,
  actualizarWidget,
  escucharAtajos,
  escucharPrimerPlano,
  marcarSalidaPropia,
  pantallaPrivada,
  vibrar,
  type Atajo,
} from './lib/nativo';
import { Ajustes } from './pantallas/Ajustes';
import { Analisis } from './pantallas/Analisis';
import { Calendario } from './pantallas/Calendario';
import { Deudas } from './pantallas/Deudas';
import { DetallePrestamo } from './pantallas/DetallePrestamo';
import { DetalleTarjeta } from './pantallas/DetalleTarjeta';
import { Inicio } from './pantallas/Inicio';
import { Movimientos } from './pantallas/Movimientos';
import { PlanDeudas } from './pantallas/PlanDeudas';

type Pestana = 'inicio' | 'movimientos' | 'deudas' | 'analisis' | 'ajustes';

const NOMBRES: Record<Pestana, string> = {
  inicio: 'Inicio',
  movimientos: 'Movimientos',
  deudas: 'Deudas',
  analisis: 'Análisis',
  ajustes: 'Ajustes',
};

/** La barra: dos secciones, el botón + en el centro y dos secciones más. Ajustes se abre desde Inicio. */
const IZQUIERDA: Array<{ id: Pestana; Icono: () => React.JSX.Element }> = [
  { id: 'inicio', Icono: IconoInicio },
  { id: 'movimientos', Icono: IconoLista },
];
const DERECHA: Array<{ id: Pestana; Icono: () => React.JSX.Element }> = [
  { id: 'deudas', Icono: IconoDeudas },
  { id: 'analisis', Icono: IconoAnalisis },
];

const fmtHoy = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaDeHoy = () => {
  const t = fmtHoy.format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

export function App() {
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  // La hoja del botón +; 'pago' abre directo la lista de deudas (atajo del ícono).
  const [agregando, setAgregando] = useState<false | 'inicio' | 'pago'>(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info'; deshacer?: () => Promise<void> } | null>(null);
  // Los avisos informativos se cierran solos; los errores esperan a que se lean.
  useEffect(() => {
    if (aviso?.tipo !== 'info') return;
    const t = setTimeout(() => setAviso(null), aviso.deshacer ? 8000 : 7000);
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

  // Tema claro u oscuro elegido en Ajustes; sin elegir, sigue al celular.
  const tema = ajustes?.apariencia.tema;
  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === 'claro') raiz.dataset.theme = 'light';
    else if (tema === 'oscuro') raiz.dataset.theme = 'dark';
    else delete raiz.dataset.theme;
  }, [tema]);
  const letra = ajustes?.apariencia.letra;
  useEffect(() => {
    if (letra === 'grande') document.documentElement.dataset.letra = 'grande';
    else delete document.documentElement.dataset.letra;
  }, [letra]);

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

  // La fecha de hoy. Cambia al volver a la app o a medianoche aunque siga abierta,
  // y con ella se recalculan las pantallas, la copia diaria, el respaldo
  // automático, los avisos y el widget.
  const [dia, setDia] = useState(hoy);
  useEffect(() => {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const programar = () => {
      clearTimeout(reloj);
      const ahora = new Date();
      const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 5);
      reloj = setTimeout(() => {
        setDia(hoy());
        programar();
      }, medianoche.getTime() - ahora.getTime());
    };
    programar();
    const quitar = escucharPrimerPlano((activa) => {
      if (!activa) return;
      setDia(hoy());
      programar();
    });
    return () => {
      clearTimeout(reloj);
      quitar();
    };
  }, []);

  const ajusteSaldo = ajustes?.saldo.ajusteCentavos ?? 0;
  // Foto mensual de deudas y disponible para las gráficas, y copia diaria.
  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => void guardarFoto(db, fotoDeHoy(datos, dia, ajusteSaldo)), 800);
    return () => clearTimeout(t);
  }, [datos, dia, ajusteSaldo]);
  const desbloqueada = bloqueado === false;
  const hayDatos = !!datos && datos.movimientos.length + datos.tarjetas.length + datos.prestamos.length > 0;
  useEffect(() => {
    if (!desbloqueada || !hayDatos) return;
    void copiarSiToca().catch(() => undefined);
    void respaldarSiToca();
  }, [desbloqueada, hayDatos, dia]);

  /**
   * Respaldo fuera del celular: con el automático activo abre directo el menú de
   * compartir (un toque para Drive); si no, lleva a Ajustes.
   */
  async function respaldarAhora() {
    const auto = ajustesActuales.current?.respaldoAuto;
    const clave = auto?.activo ? await leerClave() : undefined;
    if (!clave) {
      setPestana('ajustes');
      setDetalle(null);
      return;
    }
    try {
      await compartirRespaldo(clave);
      setAviso({ texto: 'Respaldo enviado. Ábrelo con la contraseña del respaldo automático.', tipo: 'info' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setAviso({ texto: 'No se pudo crear el respaldo.', tipo: 'error' });
    }
  }

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
  }, [datos, recordatorios, respaldoAjustes, dia]);

  // Tocar una notificación abre la deuda; «Registrar pago» u «Otro monto» abre el
  // formulario; «Ya pagué» registra el pago exacto (al desbloquear, si hay PIN).
  const [pagoAviso, setPagoAviso] = useState<ClavePago | null>(null);
  // El aviso semanal de respaldo; espera al desbloqueo y a que carguen los ajustes.
  const [respaldoPedido, setRespaldoPedido] = useState(false);
  useEffect(() => {
    if (!respaldoPedido || bloqueado !== false || !ajustes) return;
    setRespaldoPedido(false);
    void respaldarAhora();
    // respaldarAhora lee los ajustes de una ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respaldoPedido, bloqueado, ajustes]);
  useEffect(
    () =>
      escucharNotificaciones(({ destino, pagar, yaPague, minimo, pago, prueba }) => {
        if (prueba) {
          setAviso({
            texto: yaPague
              ? 'Funciona: el botón «Ya pagué» abrió la app. Era una prueba, no se registró nada.'
              : 'Funciona: el aviso de prueba abrió la app.',
            tipo: 'info',
          });
          return;
        }
        if (yaPague && esClavePago(pago)) {
          setPagoAviso({ ...pago, modo: minimo ? 'minimo' : 'total' });
          return;
        }
        const d = destino as { tipo?: string; id?: string } | null;
        if (d?.tipo === 'ajustes') {
          setRespaldoPedido(true);
          return;
        }
        if (d?.tipo === 'resumen') {
          setPestana('inicio');
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
  const [verSaldo, setVerSaldo] = useState(false);
  const [verSueldo, setVerSueldo] = useState(false);
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

  /** Aviso tras guardar o borrar, con Deshacer y una vibración corta. */
  const avisarCambio = (texto: string, deshacer: () => Promise<void>) => {
    setAviso({ texto, tipo: 'info', deshacer });
    if (ajustesActuales.current?.apariencia.vibracion !== false) void vibrar();
  };

  // El widget de Android muestra la misma cifra que Inicio (oculta si hay bloqueo).
  const conBloqueo = ajustes?.bloqueo.activo;
  const enFondo = ajustes?.fondo.apartadoCentavos ?? 0;
  const sueldoAjustes = ajustes?.sueldo;
  useEffect(() => {
    if (!datos || conBloqueo === undefined || !sueldoAjustes) return;
    const t = setTimeout(() => void actualizarWidget({ ...resumenWidget(datos, dia, new Date(), { sueldo: sueldoAjustes!, fondoCentavos: enFondo, ajusteSaldoCentavos: ajusteSaldo }), oculto: conBloqueo }), 1000);
    return () => clearTimeout(t);
  }, [datos, conBloqueo, enFondo, ajusteSaldo, dia, sueldoAjustes]);

  // Metas del camino a «libre de deudas»: se celebran una sola vez.
  const [celebracion, setCelebracion] = useState<{ titulo: string; texto: string } | null>(null);
  const metas = ajustes?.metas;
  useEffect(() => {
    if (!datos || !metas || bloqueado !== false) return;
    const fecha = hoy();
    const saldado = prestamosSaldados(datos.prestamos, datos.movimientos, fecha).find((p) => !metas.prestamos.includes(p.id));
    if (saldado) {
      void guardarAjuste('metas', { prestamos: [...metas.prestamos, saldado.id] });
      setCelebracion({ titulo: `¡Terminaste de pagar ${saldado.nombre}!`, texto: 'Un préstamo menos. Lo que pagabas de cuota ahora puede ir a tu siguiente deuda.' });
      void vibrar('exito');
      return;
    }
    if (datos.tarjetas.length + datos.prestamos.length === 0) return;
    const progreso = progresoDeudas(datos.historial, deudaTotalActual(datos.tarjetas, datos.prestamos, datos.movimientos, fecha));
    if (!progreso) return;
    const nuevos = hitosNuevos(progreso.porcentaje, metas.hitos);
    if (nuevos.length === 0) return;
    const hito = nuevos[nuevos.length - 1];
    void guardarAjuste('metas', { hitos: [...metas.hitos, ...nuevos] });
    setCelebracion(
      hito === 100
        ? { titulo: '¡Libre de deudas!', texto: 'Hoy no debes nada en tus tarjetas ni en tus préstamos. Lo lograste.' }
        : {
            titulo: `¡Llevas el ${hito}% pagado!`,
            texto: `Bajaste ${formatearDinero(progreso.pagadoCentavos)} desde lo más alto que debiste. Sigue así.`,
          },
    );
    void vibrar('exito');
  }, [datos, metas, bloqueado]);

  useEffect(() => {
    if (!pagoAviso || bloqueado !== false || !datos) return;
    setPagoAviso(null);
    const r = pagoRapido(datos, pagoAviso, hoy());
    setPestana('deudas');
    setDetalle({ tipo: pagoAviso.tipo, id: pagoAviso.id });
    if (!r.ok) {
      setAviso({ texto: r.motivo, tipo: 'info' });
      if (r.abrirPago) {
        setFormulario(pagoAviso.tipo === 'tarjeta' ? { clase: 'pago', tarjetaId: pagoAviso.id } : { clase: 'pago', prestamoId: pagoAviso.id });
      }
      return;
    }
    const m = r.movimiento;
    void db.movimientos
      .add(m)
      .then(() => {
        avisarCambio(`Pago de ${formatearDinero(m.montoCentavos)} a ${r.nombre} registrado.`, async () => {
          await db.movimientos.delete(m.id);
        });
      })
      // El mismo aviso tocado dos veces: el id fijo ya existe.
      .catch(() => setAviso({ texto: 'Ese pago ya está registrado.', tipo: 'info' }));
    // avisarCambio usa refs; no hace falta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagoAviso, bloqueado, datos]);

  // Atajos del ícono de la app. Con bloqueo, esperan a que se desbloquee.
  const [atajo, setAtajo] = useState<Atajo | null>(null);
  useEffect(() => escucharAtajos(setAtajo), []);
  useEffect(() => {
    if (!atajo || bloqueado !== false || !datos) return;
    setAtajo(null);
    setDetalle(null);
    if (atajo === 'pago') {
      setFormulario(null);
      setAgregando('pago');
    } else {
      setAgregando(false);
      setFormulario({ clase: 'movimiento', tipo: 'gasto', leer: atajo === 'ticket' });
    }
  }, [atajo, bloqueado, datos]);

  const irA = (id: Pestana) => {
    setPestana(id);
    setDetalle(null);
    window.scrollTo(0, 0);
  };
  const abrirDeuda = (d: Detalle) => {
    // El plan se abre encima de la sección actual; tarjetas y préstamos, dentro de Deudas.
    if (d.tipo === 'tarjeta' || d.tipo === 'prestamo') setPestana('deudas');
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
    if (detalle?.tipo === 'plan') {
      return <PlanDeudas datos={d} ajustes={ajustes!.plan} alVolver={() => setDetalle(null)} alAbrir={abrirDeuda} />;
    }
    if (detalle?.tipo === 'calendario') {
      return <Calendario datos={d} alVolver={() => setDetalle(null)} alAbrir={abrirDeuda} />;
    }
    switch (pestana) {
      case 'inicio':
        return (
          <Inicio
            datos={d}
            ajustes={ajustes!}
            alImportar={() => importarEstado()}
            alRecordatorios={() => setVerRecordatorios(true)}
            alAgregarIngreso={() => setFormulario({ clase: 'movimiento', tipo: 'ingreso' })}
            alAgregarGasto={() => setFormulario({ clase: 'movimiento', tipo: 'gasto' })}
            alEditar={editar}
            alVerTodos={() => irA('movimientos')}
            alVerDeudas={() => irA('deudas')}
            alVerAnalisis={() => irA('analisis')}
            alAbrirDeuda={abrirDeuda}
            diasSinRespaldo={diasSinRespaldo}
            alRespaldar={() => void respaldarAhora()}
            alAbrirFormulario={setFormulario}
            alCorregirSaldo={() => setVerSaldo(true)}
          />
        );
      case 'movimientos':
        return (
          <Movimientos
            datos={d}
            alEditar={editar}
            alBorrar={(m) => {
              void db.movimientos.delete(m.id).then(() =>
                avisarCambio(m.tipo === 'pago' ? 'Pago eliminado.' : 'Movimiento eliminado.', async () => void (await db.movimientos.put(m))),
              );
            }}
          />
        );
      case 'analisis':
        return <Analisis datos={d} alEditar={editar} />;
      case 'deudas':
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
          <Ajustes
            categorias={d.categorias}
            totalMovimientos={d.movimientos.length}
            ajustes={ajustes!}
            avisos={
              <Opcion
                icono={<Insignia color="var(--alerta)" simbolo="campana" cuadrada />}
                titulo="Recordatorios de pago y corte"
                detalle={
                  ajustes!.recordatorios.activo
                    ? `Activados a las ${ajustes!.recordatorios.hora}`
                    : 'Te avisa antes de cada fecha de pago y corte'
                }
                valor={ajustes!.recordatorios.activo ? 'Activados' : 'Desactivados'}
                alTocar={() => setVerRecordatorios(true)}
              />
            }
            sueldo={
              <Opcion
                icono={<Insignia color="var(--positivo)" simbolo="ingreso" cuadrada />}
                titulo="Tu sueldo"
                detalle={`${ajustes!.sueldo.frecuencia === 'quincenal' ? 'Cada quincena' : 'Cada mes'}${ajustes!.sueldo.dia ? `, el día ${ajustes!.sueldo.dia}` : ''}${ajustes!.sueldo.comidaCentavos > 0 ? ` · bono de comida ${formatearDinero(ajustes!.sueldo.comidaCentavos)}` : ''}`}
                alTocar={() => setVerSueldo(true)}
              />
            }
            saldo={
              <Opcion
                icono={<Insignia color="var(--positivo)" simbolo="dinero" cuadrada />}
                titulo="Mi dinero de hoy"
                detalle="Corrígelo si no coincide con lo que tienes"
                valor={formatearDinero(calcularDisponible(d.movimientos) + ajustes!.saldo.ajusteCentavos)}
                alTocar={() => setVerSaldo(true)}
              />
            }
            exportar={
              <Opcion
                icono={<Insignia color="var(--info)" simbolo="tabla" cuadrada />}
                titulo="Exportar a Excel (CSV)"
                detalle={`${d.movimientos.length} movimientos, para Excel o Google Sheets`}
                alTocar={() => void exportarCsv(d)}
              />
            }
            recurrentes={
              <section className="grupo">
                <h2 className="cabecera-grupo">Se repiten cada mes</h2>
                {d.recurrentes.length === 0 ? (
                  <p className="tarjeta texto-tenue">
                    Al registrar un gasto o ingreso, activa “Se repite cada mes” y la app te lo propondrá cada mes.
                  </p>
                ) : (
                  <ul className="lista tarjeta">
                    {d.recurrentes.map((r) => {
                      const c = r.categoriaId ? d.mapaCategorias.get(r.categoriaId) : undefined;
                      return (
                        <Opcion
                          key={r.id}
                          icono={r.tipo === 'ingreso' ? <Insignia color="var(--positivo)" simbolo="ingreso" /> : <InsigniaCategoria categoria={c} />}
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
            }
          />
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
            borrador={f.borrador}
            movimientos={d.movimientos}
            alCerrar={cerrar}
            leerAlAbrir={f.leer}
            alGuardar={(m, { anterior, recurrenteId }) => {
              const c = m.tipo === 'gasto' && m.categoriaId ? d.mapaCategorias.get(m.categoriaId) : undefined;
              let limite = '';
              if (c?.limiteCentavos) {
                const antes = gastadoEnMes(d.movimientos, c.id, mesDe(m.fecha), m.id);
                limite = avisoLimite(c, antes, antes + m.montoCentavos) ?? '';
              }
              const que = m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto';
              let texto = anterior ? 'Cambios guardados.' : `${que} de ${formatearDinero(m.montoCentavos)} guardado.`;
              // Al registrar el sueldo, en qué se va: deudas del periodo, comida y lo que queda.
              if (!anterior && m.tipo === 'ingreso' && m.esPago && ajustes) {
                const plan = planDelSueldo({ ...d, movimientos: [...d.movimientos.filter((x) => x.id !== m.id), m] }, hoy(), {
                  sueldo: ajustes.sueldo,
                  fondoCentavos: ajustes.fondo.apartadoCentavos,
                  ajusteSaldoCentavos: ajustes.saldo.ajusteCentavos,
                });
                const partes = [
                  plan.deudas.faltaCentavos > 0 && `${formatearDinero(plan.deudas.faltaCentavos)} para deudas`,
                  plan.comida && plan.comida.quedaCentavos > 0 && `${formatearDinero(plan.comida.quedaCentavos)} para comida`,
                ].filter(Boolean);
                const queda = `${formatearDinero(Math.max(0, plan.libreCentavos))} para lo demás`;
                const final =
                  plan.libreCentavos < 0
                    ? `te faltan ${formatearDinero(-plan.libreCentavos)} para cubrirlo todo`
                    : `te quedan ${queda}`;
                texto = `Sueldo de ${formatearDinero(m.montoCentavos)} guardado. ${partes.length ? `Aparté ${partes.join(' y ')}: ${final}.` : `${final.charAt(0).toUpperCase()}${final.slice(1)}.`}`;
              }
              avisarCambio(limite ? `${texto} ${limite}` : texto, async () => {
                if (anterior) await db.movimientos.put(anterior);
                else await db.movimientos.delete(m.id);
                if (recurrenteId) await db.recurrentes.delete(recurrenteId);
              });
            }}
            alEliminar={(m) => avisarCambio('Movimiento eliminado.', async () => void (await db.movimientos.put(m)))}
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
            montoInicial={f.monto}
            fechaInicial={f.fecha}
            alCerrar={cerrar}
            alGuardar={(m, anterior) =>
              avisarCambio(
                anterior ? 'Pago actualizado.' : `Pago de ${formatearDinero(m.montoCentavos)} a ${tarjeta?.nombre ?? prestamo?.nombre} guardado.`,
                async () => {
                  if (anterior) await db.movimientos.put(anterior);
                  else await db.movimientos.delete(m.id);
                },
              )
            }
            alEliminar={(m) => avisarCambio('Pago eliminado.', async () => void (await db.movimientos.put(m)))}
          />
        );
      }
      case 'tarjeta':
        return <FormularioTarjeta tarjeta={f.tarjeta} cantidad={d.tarjetas.length} alCerrar={cerrar} />;
      case 'prestamo':
        return <FormularioPrestamo prestamo={f.prestamo} movimientos={d.movimientos} alCerrar={cerrar} leerAlAbrir={f.leer} />;
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

  if (!ajustes || bloqueado === null) return <div className="app" />;

  const boton = (id: Pestana, Icono: () => React.JSX.Element) => (
    <button key={id} type="button" aria-current={pestana === id ? 'page' : undefined} onClick={() => irA(id)}>
      <Icono />
      <span>{NOMBRES[id]}</span>
    </button>
  );

  return (
    <div className={bloqueado ? 'app oculta' : 'app'}>
      {bloqueado && <Bloqueo ajustes={ajustes.bloqueo} alDesbloquear={() => setBloqueado(false)} />}
      {!detalle && (
        <header className="cabecera">
          {pestana === 'inicio' ? (
            <>
              <div className="cabecera-texto">
                <p className="fecha-cabecera">{fechaDeHoy()}</p>
                <h1>{saludo()}</h1>
              </div>
              <button type="button" className="boton-redondo" onClick={() => irA('ajustes')} aria-label="Ajustes">
                <Simbolo nombre="engranaje" tamano={22} />
              </button>
            </>
          ) : pestana === 'ajustes' ? (
            <div className="cabecera-volver">
              <button type="button" className="boton-icono" onClick={() => irA('inicio')} aria-label="Volver a Inicio">
                <IconoAnterior />
              </button>
              <h1>Ajustes</h1>
            </div>
          ) : (
            <h1>{NOMBRES[pestana]}</h1>
          )}
        </header>
      )}

      <main className="contenido">{datos && contenido(datos)}</main>

      <nav className="navegacion" aria-label="Secciones">
        {IZQUIERDA.map(({ id, Icono }) => boton(id, Icono))}
        <span className="hueco-agregar">
          <button type="button" className="boton-agregar" onClick={() => setAgregando('inicio')} aria-label="Agregar">
            <IconoMas />
          </button>
        </span>
        {DERECHA.map(({ id, Icono }) => boton(id, Icono))}
      </nav>

      {agregando && datos && (
        <Agregar
          datos={datos}
          empezarEnPago={agregando === 'pago'}
          alCerrar={() => setAgregando(false)}
          alAbrir={(f) => {
            setAgregando(false);
            setFormulario(f);
          }}
          alImportarPdf={() => {
            setAgregando(false);
            importarEstado();
          }}
        />
      )}
      {formulario && datos && hoja(formulario, datos)}
      {celebracion && !formulario && (
        <Hoja titulo="Meta cumplida" alCerrar={() => setCelebracion(null)}>
          <div className="formulario celebracion">
            <span className="celebracion-icono" aria-hidden="true">
              <Simbolo nombre="objetivo" tamano={40} />
            </span>
            <p className="celebracion-titulo">{celebracion.titulo}</p>
            <p className="texto-tenue">{celebracion.texto}</p>
            <div className="acciones">
              <button type="button" className="boton primario" onClick={() => setCelebracion(null)}>
                ¡Bien!
              </button>
            </div>
          </div>
        </Hoja>
      )}
      {recurrenteAbierto && datos && (
        <FormularioRecurrente
          recurrente={recurrenteAbierto}
          categorias={datos.categorias}
          tarjetas={datos.tarjetas}
          alCerrar={() => setRecurrenteAbierto(null)}
        />
      )}
      {verSaldo && datos && ajustes && (
        <FormularioSaldo
          movimientos={datos.movimientos}
          saldo={ajustes.saldo}
          alCerrar={() => setVerSaldo(false)}
          alGuardar={(texto) => setAviso({ texto, tipo: 'info' })}
        />
      )}
      {verSueldo && datos && (
        <FormularioSueldo sueldo={ajustes.sueldo} categorias={datos.categorias} alCerrar={() => setVerSueldo(false)} />
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
        <div className={aviso?.tipo === 'error' ? 'toast error' : aviso ? 'toast info' : 'toast'} role={aviso?.tipo === 'error' ? 'alert' : 'status'}>
          <span>{aviso?.texto ?? 'Leyendo el estado de cuenta…'}</span>
          {aviso?.deshacer && (
            <button
              type="button"
              className="enlace toast-accion"
              onClick={() => {
                const deshacer = aviso.deshacer!;
                setAviso(null);
                void deshacer().then(
                  () => setAviso({ texto: 'Listo, se deshizo.', tipo: 'info' }),
                  () => setAviso({ texto: 'No se pudo deshacer.', tipo: 'error' }),
                );
              }}
            >
              Deshacer
            </button>
          )}
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
