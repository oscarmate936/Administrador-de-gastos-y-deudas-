import { useState, type FormEvent } from 'react';
import { db, type Categoria, type Recurrente, type Tarjeta } from '../db';
import { fechaConDia } from '../lib/deudas';
import { centavosATexto, textoACentavos } from '../lib/dinero';
import { aDate, fechaCorta, hoy } from '../lib/fechas';
import { Hoja } from './Hoja';

interface Props {
  recurrente: Recurrente;
  categorias: Categoria[];
  tarjetas: Tarjeta[];
  alCerrar: () => void;
}

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Próxima fecha con ese día a partir de hoy. */
function proximaConDia(dia: number): string {
  const h = aDate(hoy());
  const esteMes = fechaConDia(h.getFullYear(), h.getMonth(), dia);
  return esteMes >= hoy() ? esteMes : fechaConDia(h.getFullYear(), h.getMonth() + 1, dia);
}

export function FormularioRecurrente({ recurrente: r, categorias, tarjetas, alCerrar }: Props) {
  const [monto, setMonto] = useState(centavosATexto(r.montoCentavos));
  const [dia, setDia] = useState(r.dia);
  const [nota, setNota] = useState(r.nota);
  const [categoriaId, setCategoriaId] = useState(r.categoriaId);
  const [activo, setActivo] = useState(r.activo);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const montoCentavos = textoACentavos(monto);
    if (!montoCentavos) return setError('Escribe un monto mayor que cero.');
    await db.recurrentes.update(r.id, {
      montoCentavos,
      dia,
      nota: nota.trim(),
      categoriaId: r.tipo === 'gasto' ? categoriaId : undefined,
      activo,
      proxima: dia !== r.dia || (activo && !r.activo) ? proximaConDia(dia) : r.proxima,
    });
    alCerrar();
  }

  async function eliminar() {
    if (!window.confirm('¿Dejar de repetir este movimiento? Los que ya registraste no se borran.')) return;
    await db.recurrentes.delete(r.id);
    alCerrar();
  }

  const tarjeta = r.tarjetaId ? tarjetas.find((t) => t.id === r.tarjetaId) : undefined;

  return (
    <Hoja titulo={r.tipo === 'ingreso' ? 'Ingreso que se repite' : 'Gasto que se repite'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        <label className="campo-monto">
          <span className="solo-lectores">Monto</span>
          <span aria-hidden="true">$</span>
          <input inputMode="decimal" value={monto} onChange={(e) => { setMonto(e.target.value); setError(''); }} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label className="campo">
          <span>Día del mes</span>
          <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {DIAS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="ayuda sin-margen">
            {activo ? `Próxima vez: ${fechaCorta(dia !== r.dia ? proximaConDia(dia) : r.proxima)}.` : 'En pausa.'}
            {tarjeta && ` Se paga con ${tarjeta.nombre}.`}
          </span>
        </label>
        {r.tipo === 'gasto' && (
          <label className="campo">
            <span>Categoría</span>
            <select value={categoriaId ?? ''} onChange={(e) => setCategoriaId(e.target.value || undefined)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="campo">
          <span>Nota</span>
          <input type="text" value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} />
        </label>
        <label className="interruptor">
          <span>
            <strong>Activo</strong>
            <span className="texto-tenue">Si lo pausas, deja de proponerse cada mes.</span>
          </span>
          <input type="checkbox" role="switch" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        </label>
        <div className="acciones">
          <button type="button" className="boton peligro" onClick={eliminar}>
            Eliminar
          </button>
          <button type="submit" className="boton primario">
            Guardar
          </button>
        </div>
      </form>
    </Hoja>
  );
}
