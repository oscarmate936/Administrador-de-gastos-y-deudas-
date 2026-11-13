import { useState, type FormEvent } from 'react';
import { db, nuevoId, type Categoria } from '../db';
import { Hoja } from './Hoja';

const COLORES = ['#e07a3f', '#3f9b6b', '#3f7fd0', '#8a63c9', '#c9a227', '#d0527a', '#2f9aa8', '#7c8791'];

interface Props {
  categoria?: Categoria;
  siguienteOrden: number;
  alCerrar: () => void;
}

export function FormularioCategoria({ categoria, siguienteOrden, alCerrar }: Props) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [emoji, setEmoji] = useState(categoria?.emoji ?? '🏷️');
  const [color, setColor] = useState(categoria?.color ?? COLORES[0]);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('Escribe un nombre para la categoría.');
      return;
    }
    await db.categorias.put({
      id: categoria?.id ?? nuevoId(),
      nombre: nombre.trim(),
      emoji: emoji.trim() || '🏷️',
      color,
      orden: categoria?.orden ?? siguienteOrden,
    });
    alCerrar();
  }

  async function eliminar() {
    if (!categoria) return;
    const mensaje = `¿Eliminar "${categoria.nombre}"? Sus gastos no se borran: quedan como "Sin categoría".`;
    if (!window.confirm(mensaje)) return;
    await db.categorias.delete(categoria.id);
    alCerrar();
  }

  return (
    <Hoja titulo={categoria ? 'Editar categoría' : 'Nueva categoría'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        <div className="fila-campos">
          <label className="campo campo-emoji">
            <span>Ícono</span>
            <input type="text" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} />
          </label>
          <label className="campo campo-crece">
            <span>Nombre</span>
            <input
              type="text"
              value={nombre}
              maxLength={30}
              autoFocus={!categoria}
              aria-invalid={error !== ''}
              onChange={(e) => {
                setNombre(e.target.value);
                setError('');
              }}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="campo">
          <legend>Color</legend>
          <div className="colores">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                className="color"
                style={{ background: c }}
                aria-pressed={color === c}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>

        <div className="acciones">
          {categoria && (
            <button type="button" className="boton peligro" onClick={eliminar}>
              Eliminar
            </button>
          )}
          <button type="submit" className="boton primario">
            Guardar
          </button>
        </div>
      </form>
    </Hoja>
  );
}
