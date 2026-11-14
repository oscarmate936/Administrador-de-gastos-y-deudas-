import { useEffect, useRef, useState } from 'react';
import { db, type Categoria } from '../db';
import { FormularioBloqueo } from '../componentes/FormularioBloqueo';
import { FormularioCategoria } from '../componentes/FormularioCategoria';
import { Hoja } from '../componentes/Hoja';
import { Opcion } from '../componentes/Opcion';
import { guardarAjuste, type Ajustes as AjustesApp } from '../lib/ajustes';
import { leerCopia, listarCopias, type InfoCopia } from '../lib/copias';
import { descifrar, type Sobre } from '../lib/cripto';
import { formatearDinero } from '../lib/dinero';
import { aFechaTexto, haceCuanto, hoy } from '../lib/fechas';
import { entregarArchivo, marcarSalidaPropia } from '../lib/nativo';
import {
  crearRespaldo,
  leerRespaldo,
  nombreArchivoRespaldo,
  restaurarRespaldo,
  sobreDeRespaldo,
  textoRespaldo,
  type Respaldo,
} from '../lib/respaldo';

interface Props {
  categorias: Categoria[];
  totalMovimientos: number;
  ajustes: AjustesApp;
  /** Secciones de fases posteriores (recordatorios, recurrentes, exportar). */
  children?: React.ReactNode;
}

type Aviso = { tipo: 'ok' | 'error'; texto: string };
type Hojas = 'bloqueo' | 'respaldo' | 'copias' | null;

const fechaHora = new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function Ajustes({ categorias, totalMovimientos, ajustes, children }: Props) {
  const [categoria, setCategoria] = useState<Categoria | 'nueva' | null>(null);
  const [hoja, setHoja] = useState<Hojas>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pendiente, setPendiente] = useState<Sobre | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  /** Valida, pide confirmación y reemplaza los datos. */
  async function restaurar(respaldo: Respaldo, origen: string) {
    const mensaje =
      `${origen} tiene ${respaldo.movimientos.length} movimientos, ${respaldo.tarjetas.length} tarjetas ` +
      `y ${respaldo.prestamos.length} préstamos. Reemplazará todo lo que hay ahora en este dispositivo ` +
      `(${totalMovimientos} movimientos). ¿Continuar?`;
    if (!window.confirm(mensaje)) return;
    await restaurarRespaldo(db, respaldo);
    setAviso({ tipo: 'ok', texto: `Se restauraron ${respaldo.movimientos.length} movimientos.` });
  }

  async function abrirTexto(texto: string, origen: string) {
    setAviso(null);
    try {
      const sobre = sobreDeRespaldo(texto);
      if (sobre) {
        setPendiente(sobre);
        return;
      }
      await restaurar(leerRespaldo(texto), origen);
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el respaldo.' });
    }
  }

  const ultimo = ajustes.respaldo.ultimoExterno;
  const diasSinRespaldo = ultimo ? Math.floor((Date.now() - Date.parse(ultimo)) / 86_400_000) : null;
  const atrasado = diasSinRespaldo === null || diasSinRespaldo >= ajustes.respaldo.recordarCadaDias;
  const siguienteOrden = Math.max(0, ...categorias.map((c) => c.orden)) + 1;

  return (
    <>
      <section className="tarjeta">
        <h2>Seguridad</h2>
        <ul className="lista">
          <Opcion
            icono="🔒"
            titulo="Bloqueo con PIN"
            detalle={ajustes.bloqueo.activo ? (ajustes.bloqueo.huella ? 'PIN y huella' : 'PIN') : 'Cualquiera con tu celular puede abrir la app'}
            valor={ajustes.bloqueo.activo ? 'Activado' : 'Desactivado'}
            alTocar={() => setHoja('bloqueo')}
          />
        </ul>
      </section>

      <section className="tarjeta">
        <h2>Respaldo</h2>
        <p className={atrasado && totalMovimientos > 0 ? 'aviso error' : 'texto-tenue'}>
          {ultimo
            ? `Último respaldo guardado fuera del celular: ${haceCuanto(aFechaTexto(new Date(ultimo)))}.`
            : 'Aún no guardas un respaldo fuera del celular.'}{' '}
          Tus datos viven solo en este dispositivo: guarda un respaldo en Drive o en otro lugar cada semana.
        </p>
        <ul className="lista">
          <Opcion icono="📤" titulo="Crear respaldo" detalle="Compártelo a Drive, a tu correo o a WhatsApp" alTocar={() => setHoja('respaldo')} />
          <Opcion
            icono="📥"
            titulo="Restaurar desde un archivo"
            detalle="Reemplaza los datos de este dispositivo"
            alTocar={() => {
              marcarSalidaPropia();
              entradaArchivo.current?.click();
            }}
          />
          <Opcion
            icono="🕘"
            titulo="Copias automáticas"
            detalle={
              ajustes.respaldo.ultimaCopia
                ? `La app guarda una copia diaria en el celular. Última: ${fechaHora.format(new Date(ajustes.respaldo.ultimaCopia))}`
                : 'La app guarda una copia diaria en el celular'
            }
            alTocar={() => setHoja('copias')}
          />
        </ul>
        <input
          ref={entradaArchivo}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = '';
            if (archivo) void archivo.text().then((t) => abrirTexto(t, 'El respaldo'));
          }}
        />
        {pendiente && (
          <ClaveRespaldo
            sobre={pendiente}
            alCancelar={() => setPendiente(null)}
            alAbrir={async (texto) => {
              setPendiente(null);
              await abrirTexto(texto, 'El respaldo');
            }}
          />
        )}
        {aviso && (
          <p className={aviso.tipo === 'ok' ? 'aviso' : 'aviso error'} role="status">
            {aviso.texto}
          </p>
        )}
      </section>

      {children}

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Categorías de gasto</h2>
          <button type="button" className="enlace" onClick={() => setCategoria('nueva')}>
            Agregar
          </button>
        </div>
        <ul className="lista">
          {categorias.map((c) => (
            <li key={c.id}>
              <button type="button" className="fila" onClick={() => setCategoria(c)}>
                <span className="fila-emoji" style={{ background: `color-mix(in srgb, ${c.color} 18%, transparent)` }}>
                  {c.emoji}
                </span>
                <span className="fila-texto">
                  <span className="fila-titulo">{c.nombre}</span>
                  {c.limiteCentavos && <span className="fila-detalle">Límite {formatearDinero(c.limiteCentavos)} al mes</span>}
                </span>
                <span className="texto-tenue">Editar</span>
              </button>
            </li>
          ))}
        </ul>
        {categorias.length === 0 && <p className="texto-tenue">No tienes categorías. Agrega una.</p>}
      </section>

      <p className="pie">Mis Finanzas · versión {__VERSION__}</p>

      {categoria && (
        <FormularioCategoria
          categoria={categoria === 'nueva' ? undefined : categoria}
          siguienteOrden={siguienteOrden}
          alCerrar={() => setCategoria(null)}
        />
      )}
      {hoja === 'bloqueo' && <FormularioBloqueo ajustes={ajustes.bloqueo} alCerrar={() => setHoja(null)} />}
      {hoja === 'respaldo' && (
        <CrearRespaldo
          alCerrar={() => setHoja(null)}
          alTerminar={(texto) => {
            setHoja(null);
            setAviso({ tipo: 'ok', texto });
          }}
        />
      )}
      {hoja === 'copias' && (
        <Copias
          alCerrar={() => setHoja(null)}
          alElegir={async (copia) => {
            setHoja(null);
            try {
              await abrirTexto(await leerCopia(copia.id), 'La copia automática');
            } catch {
              setAviso({ tipo: 'error', texto: 'No se pudo leer la copia.' });
            }
          }}
        />
      )}
    </>
  );
}

function CrearRespaldo({ alCerrar, alTerminar }: { alCerrar: () => void; alTerminar: (texto: string) => void }) {
  const [proteger, setProteger] = useState(true);
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function crear() {
    if (proteger && clave.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (proteger && clave !== repetir) return setError('Las contraseñas no coinciden.');
    setError('');
    setTrabajando(true);
    try {
      const texto = await textoRespaldo(await crearRespaldo(db), proteger ? clave : undefined);
      await entregarArchivo(nombreArchivoRespaldo(hoy()), texto, 'application/json');
      await guardarAjuste('respaldo', { ultimoExterno: new Date().toISOString() });
      alTerminar(proteger ? 'Respaldo creado y protegido con tu contraseña.' : 'Respaldo creado.');
    } catch (e) {
      setTrabajando(false);
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('No se pudo crear el respaldo.');
    }
  }

  return (
    <Hoja titulo="Crear respaldo" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">
          Se crea un archivo con todos tus datos. Guárdalo fuera del celular: en Google Drive, en tu correo o en otro
          dispositivo.
        </p>
        <label className="interruptor">
          <span>
            <strong>Proteger con contraseña</strong>
            <span className="texto-tenue">Recomendado: sin ella, cualquiera que vea el archivo puede leer tus finanzas.</span>
          </span>
          <input type="checkbox" role="switch" checked={proteger} onChange={(e) => setProteger(e.target.checked)} />
        </label>
        {proteger && (
          <>
            <label className="campo">
              <span>Contraseña del respaldo</span>
              <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
            <label className="campo">
              <span>Repite la contraseña</span>
              <input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
              <span className="ayuda sin-margen">Anótala en un lugar seguro: sin ella no se puede abrir el respaldo.</span>
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="button" className="boton primario" disabled={trabajando} onClick={() => void crear()}>
            {trabajando ? 'Creando…' : 'Crear y guardar'}
          </button>
        </div>
      </div>
    </Hoja>
  );
}

function ClaveRespaldo({ sobre, alCancelar, alAbrir }: { sobre: Sobre; alCancelar: () => void; alAbrir: (texto: string) => Promise<void> }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  return (
    <Hoja titulo="Respaldo con contraseña" alCerrar={alCancelar}>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          setTrabajando(true);
          try {
            await alAbrir(await descifrar(sobre, clave));
          } catch (err) {
            setTrabajando(false);
            setError(err instanceof Error ? err.message : 'No se pudo abrir.');
          }
        }}
      >
        <label className="campo">
          <span>Contraseña del respaldo</span>
          <input type="password" value={clave} autoFocus onChange={(e) => { setClave(e.target.value); setError(''); }} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="submit" className="boton primario" disabled={trabajando || !clave}>
            {trabajando ? 'Abriendo…' : 'Abrir respaldo'}
          </button>
        </div>
      </form>
    </Hoja>
  );
}

function Copias({ alCerrar, alElegir }: { alCerrar: () => void; alElegir: (c: InfoCopia) => void }) {
  const [copias, setCopias] = useState<InfoCopia[] | null>(null);
  useEffect(() => {
    void listarCopias().then(setCopias);
  }, []);
  return (
    <Hoja titulo="Copias automáticas" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">
          Cada día que abres la app se guarda una copia dentro del celular (se conservan las últimas 7). Sirven si algo sale
          mal en la app, pero no si pierdes el celular: para eso está el respaldo.
        </p>
        {copias === null ? (
          <p className="texto-tenue">Cargando…</p>
        ) : copias.length === 0 ? (
          <p className="texto-tenue">Todavía no hay copias.</p>
        ) : (
          <ul className="lista">
            {copias.map((c) => (
              <Opcion key={c.id} icono="🗂️" titulo={fechaHora.format(new Date(c.creadaEn))} detalle="Toca para restaurar" alTocar={() => alElegir(c)} />
            ))}
          </ul>
        )}
      </div>
    </Hoja>
  );
}
