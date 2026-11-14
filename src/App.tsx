import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formularioParaEditar, type Datos, type Detalle, type Formulario } from './datos';
import { db, type Movimiento } from './db';
import { FormularioMovimiento } from './componentes/FormularioMovimiento';
import { FormularioPago } from './componentes/FormularioPago';
import { FormularioPrestamo } from './componentes/FormularioPrestamo';
import { FormularioTarjeta } from './componentes/FormularioTarjeta';
import { Bloqueo } from './componentes/Bloqueo';
import { RevisionEstado } from './componentes/RevisionEstado';
import { IconoAjustes, IconoDeudas, IconoInicio, IconoLista, IconoMas } from './componentes/Iconos';
import { ErrorEstado, leerEstadoTarjeta } from './lib/estados/leer';
import { extraerPaginas } from './lib/estados/pdf';
import { useAjustes } from './lib/ajustes';
import { copiarSiToca } from './lib/copias';
import { hoy } from './lib/fechas';
import { fotoDeHoy, guardarFoto } from './lib/historial';
import {
  consumirSalidaPropia,
  escucharBotonAtras,
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const entradaPdf = useRef<HTMLInputElement>(null);
  const tarjetaParaImportar = useRef<string | undefined>(undefined);

  const movimientos = useLiveQuery(() => db.movimientos.toArray(), []);
  const categorias = useLiveQuery(() => db.categorias.orderBy('orden').toArray(), []);
  const tarjetas = useLiveQuery(() => db.tarjetas.toArray(), []);
  const prestamos = useLiveQuery(() => db.prestamos.toArray(), []);

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
    if (!movimientos || !categorias || !tarjetas || !prestamos) return null;
    return {
      movimientos,
      categorias,
      mapaCategorias: new Map(categorias.map((c) => [c.id, c])),
      tarjetas: [...tarjetas].sort((a, b) => a.creadoEn - b.creadoEn),
      prestamos: [...prestamos].sort((a, b) => a.creadoEn - b.creadoEn),
    };
  }, [movimientos, categorias, tarjetas, prestamos]);

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
      setAviso(e instanceof ErrorEstado ? e.message : 'No pude leer este PDF.');
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
          />
        );
      case 'ajustes':
        return <Ajustes categorias={d.categorias} totalMovimientos={d.movimientos.length} ajustes={ajustes!} />;
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
        <div className={aviso ? 'toast error' : 'toast'} role={aviso ? 'alert' : 'status'}>
          <span>{aviso ?? 'Leyendo el estado de cuenta…'}</span>
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
