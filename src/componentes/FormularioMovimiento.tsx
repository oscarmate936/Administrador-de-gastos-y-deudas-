import { useState, type FormEvent } from 'react';
import { db, nuevoId, type Categoria, type Movimiento, type TipoMovimiento } from '../db';
import { centavosATexto, textoACentavos } from '../lib/dinero';
import { esFechaValida, hoy } from '../lib/fechas';
import { Hoja } from './Hoja';

interface Props {
  /** Si viene, se edita ese movimiento; si no, se crea uno nuevo. */
  movimiento?: Movimiento;
  tipoInicial: TipoMovimiento;
  categorias: Categoria[];
  alCerrar: () => void;
}

export function FormularioMovimiento({ movimiento, tipoInicial, categorias, alCerrar }: Props) {
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? tipoInicial);
  const [monto, setMonto] = useState(movimiento ? centavosATexto(movimiento.montoCentavos) : '');
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoy());
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoriaId);
  const [esPago, setEsPago] = useState(movimiento?.esPago ?? true);
  const [nota, setNota] = useState(movimiento?.nota ?? '');
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const montoCentavos = textoACentavos(monto);
    if (!montoCentavos) {
      setError('Escribe un monto mayor que cero, por ejemplo 12.50');
      return;
    }
    if (!esFechaValida(fecha)) {
      setError('Elige una fecha válida.');
      return;
    }
    await db.movimientos.put({
      id: movimiento?.id ?? nuevoId(),
      tipo,
      montoCentavos,
      fecha,
      categoriaId: tipo === 'gasto' ? categoriaId : undefined,
      esPago: tipo === 'ingreso' ? esPago : undefined,
      nota: nota.trim(),
      creadoEn: movimiento?.creadoEn ?? Date.now(),
    });
    alCerrar();
  }

  async function eliminar() {
    if (!movimiento) return;
    if (!window.confirm('¿Eliminar este movimiento? No se puede deshacer.')) return;
    await db.movimientos.delete(movimiento.id);
    alCerrar();
  }

  const titulo = `${movimiento ? 'Editar' : 'Nuevo'} ${tipo === 'gasto' ? 'gasto' : 'ingreso'}`;

  return (
    <Hoja titulo={titulo} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        <div className="segmentos" role="group" aria-label="Tipo de movimiento">
          <button type="button" aria-pressed={tipo === 'gasto'} onClick={() => setTipo('gasto')}>
            Gasto
          </button>
          <button type="button" aria-pressed={tipo === 'ingreso'} onClick={() => setTipo('ingreso')}>
            Ingreso
          </button>
        </div>

        <label className="campo-monto">
          <span className="solo-lectores">Monto</span>
          <span aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={monto}
            autoFocus={!movimiento}
            aria-invalid={error !== ''}
            onChange={(e) => {
              setMonto(e.target.value);
              setError('');
            }}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {tipo === 'gasto' ? (
          <fieldset className="campo">
            <legend>Categoría</legend>
            <div className="chips">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={categoriaId === c.id}
                  onClick={() => setCategoriaId(categoriaId === c.id ? undefined : c.id)}
                >
                  <span aria-hidden="true">{c.emoji}</span> {c.nombre}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="campo">
            <legend>¿Qué tipo de ingreso es?</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={esPago} onClick={() => setEsPago(true)}>
                <span aria-hidden="true">💵</span> Mi pago
              </button>
              <button type="button" className="chip" aria-pressed={!esPago} onClick={() => setEsPago(false)}>
                <span aria-hidden="true">➕</span> Otro ingreso
              </button>
            </div>
            <p className="ayuda">
              {esPago
                ? 'Al guardarlo, Inicio empieza a contar tus gastos desde este pago.'
                : 'Suma a tu disponible sin reiniciar la cuenta desde tu último pago.'}
            </p>
          </fieldset>
        )}

        <label className="campo">
          <span>Fecha</span>
          <input type="date" value={fecha} max="2099-12-31" onChange={(e) => setFecha(e.target.value)} />
        </label>

        <label className="campo">
          <span>Nota (opcional)</span>
          <input
            type="text"
            value={nota}
            maxLength={80}
            placeholder={tipo === 'gasto' ? 'Ej. almuerzo, gasolina' : 'Ej. quincena'}
            onChange={(e) => setNota(e.target.value)}
          />
        </label>

        <div className="acciones">
          {movimiento && (
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
