import { useRef, useState } from 'react';
import { db, type Categoria } from '../db';
import { FormularioCategoria } from '../componentes/FormularioCategoria';
import { hoy } from '../lib/fechas';
import { entregarArchivo } from '../lib/nativo';
import { crearRespaldo, leerRespaldo, nombreArchivoRespaldo, restaurarRespaldo } from '../lib/respaldo';

interface Props {
  categorias: Categoria[];
  totalMovimientos: number;
}

type Aviso = { tipo: 'ok' | 'error'; texto: string };

export function Ajustes({ categorias, totalMovimientos }: Props) {
  const [editando, setEditando] = useState<Categoria | 'nueva' | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  async function exportar() {
    setAviso(null);
    try {
      const respaldo = await crearRespaldo(db);
      await entregarArchivo(nombreArchivoRespaldo(hoy()), JSON.stringify(respaldo, null, 2), 'application/json');
      setAviso({ tipo: 'ok', texto: 'Respaldo creado. Guárdalo fuera de este celular.' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setAviso({ tipo: 'error', texto: 'No se pudo crear el respaldo.' });
    }
  }

  async function importar(archivo: File) {
    setAviso(null);
    try {
      const respaldo = leerRespaldo(await archivo.text());
      const mensaje =
        `El respaldo tiene ${respaldo.movimientos.length} movimientos. ` +
        `Se reemplazarán los ${totalMovimientos} que hay ahora en este dispositivo. ¿Continuar?`;
      if (!window.confirm(mensaje)) return;
      await restaurarRespaldo(db, respaldo);
      setAviso({ tipo: 'ok', texto: `Se restauraron ${respaldo.movimientos.length} movimientos.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    }
  }

  const siguienteOrden = Math.max(0, ...categorias.map((c) => c.orden)) + 1;

  return (
    <>
      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Categorías de gasto</h2>
          <button type="button" className="enlace" onClick={() => setEditando('nueva')}>
            Agregar
          </button>
        </div>
        <ul className="lista">
          {categorias.map((c) => (
            <li key={c.id}>
              <button type="button" className="fila" onClick={() => setEditando(c)}>
                <span className="fila-emoji" style={{ background: `color-mix(in srgb, ${c.color} 18%, transparent)` }}>
                  {c.emoji}
                </span>
                <span className="fila-texto">
                  <span className="fila-titulo">{c.nombre}</span>
                </span>
                <span className="texto-tenue">Editar</span>
              </button>
            </li>
          ))}
        </ul>
        {categorias.length === 0 && <p className="texto-tenue">No tienes categorías. Agrega una.</p>}
      </section>

      <section className="tarjeta">
        <h2>Respaldo</h2>
        <p className="texto-tenue">
          Tus datos se guardan solo en este dispositivo. Si borras los datos del navegador o cambias de
          celular, se pierden. Crea un respaldo cada cierto tiempo y guárdalo en otro lugar.
        </p>
        <div className="acciones-columna">
          <button type="button" className="boton primario" onClick={exportar}>
            Crear respaldo
          </button>
          <button type="button" className="boton" onClick={() => entradaArchivo.current?.click()}>
            Restaurar desde un respaldo
          </button>
        </div>
        <input
          ref={entradaArchivo}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = '';
            if (archivo) void importar(archivo);
          }}
        />
        {aviso && (
          <p className={aviso.tipo === 'ok' ? 'aviso' : 'aviso error'} role="status">
            {aviso.texto}
          </p>
        )}
      </section>

      <p className="pie">Mis Finanzas · versión {__VERSION__}</p>

      {editando && (
        <FormularioCategoria
          categoria={editando === 'nueva' ? undefined : editando}
          siguienteOrden={siguienteOrden}
          alCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
