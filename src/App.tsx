import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Movimiento, type TipoMovimiento } from './db';
import { FormularioMovimiento } from './componentes/FormularioMovimiento';
import { IconoAjustes, IconoInicio, IconoLista, IconoMas } from './componentes/Iconos';
import { Ajustes } from './pantallas/Ajustes';
import { Inicio } from './pantallas/Inicio';
import { Movimientos } from './pantallas/Movimientos';

type Pestana = 'inicio' | 'movimientos' | 'ajustes';
type Formulario = { movimiento?: Movimiento; tipo: TipoMovimiento };

const PESTANAS: Array<{ id: Pestana; nombre: string; Icono: () => React.JSX.Element }> = [
  { id: 'inicio', nombre: 'Inicio', Icono: IconoInicio },
  { id: 'movimientos', nombre: 'Movimientos', Icono: IconoLista },
  { id: 'ajustes', nombre: 'Ajustes', Icono: IconoAjustes },
];

export function App() {
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [formulario, setFormulario] = useState<Formulario | null>(null);

  const movimientos = useLiveQuery(() => db.movimientos.toArray(), []);
  const categorias = useLiveQuery(() => db.categorias.orderBy('orden').toArray(), []);
  const mapaCategorias = useMemo(() => new Map((categorias ?? []).map((c) => [c.id, c])), [categorias]);

  const cargando = movimientos === undefined || categorias === undefined;
  const editar = (movimiento: Movimiento) => setFormulario({ movimiento, tipo: movimiento.tipo });

  return (
    <div className="app">
      <header className="cabecera">
        <h1>{pestana === 'inicio' ? 'Mis Finanzas' : PESTANAS.find((p) => p.id === pestana)!.nombre}</h1>
      </header>

      <main className="contenido">
        {cargando ? null : pestana === 'inicio' ? (
          <Inicio
            movimientos={movimientos}
            categorias={mapaCategorias}
            alAgregarIngreso={() => setFormulario({ tipo: 'ingreso' })}
            alAgregarGasto={() => setFormulario({ tipo: 'gasto' })}
            alEditar={editar}
            alVerTodos={() => setPestana('movimientos')}
          />
        ) : pestana === 'movimientos' ? (
          <Movimientos movimientos={movimientos} categorias={mapaCategorias} alEditar={editar} />
        ) : (
          <Ajustes categorias={categorias} totalMovimientos={movimientos.length} />
        )}
      </main>

      {pestana !== 'ajustes' && (
        <button
          type="button"
          className="boton-flotante"
          onClick={() => setFormulario({ tipo: 'gasto' })}
          aria-label="Agregar movimiento"
        >
          <IconoMas />
        </button>
      )}

      <nav className="navegacion" aria-label="Secciones">
        {PESTANAS.map(({ id, nombre, Icono }) => (
          <button
            key={id}
            type="button"
            aria-current={pestana === id ? 'page' : undefined}
            onClick={() => {
              setPestana(id);
              window.scrollTo(0, 0);
            }}
          >
            <Icono />
            <span>{nombre}</span>
          </button>
        ))}
      </nav>

      {formulario && (
        <FormularioMovimiento
          movimiento={formulario.movimiento}
          tipoInicial={formulario.tipo}
          categorias={categorias ?? []}
          alCerrar={() => setFormulario(null)}
        />
      )}
    </div>
  );
}
