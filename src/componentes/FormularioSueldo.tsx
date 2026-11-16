import { useState, type FormEvent } from 'react';
import type { Categoria } from '../db';
import { guardarAjuste, type AjustesSueldo } from '../lib/ajustes';
import { centavosATexto, textoACentavos } from '../lib/dinero';
import { MarcaCategoria } from './Simbolo';
import { Hoja } from './Hoja';

interface Props {
  sueldo: AjustesSueldo;
  categorias: Categoria[];
  alCerrar: () => void;
}

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);
const QUINCENAS = Array.from({ length: 15 }, (_, i) => i + 1);

/** Cada cuánto te pagan, qué día y el bono de comida que se aparta del sueldo. */
export function FormularioSueldo({ sueldo, categorias, alCerrar }: Props) {
  const [frecuencia, setFrecuencia] = useState<'mensual' | 'quincenal'>(sueldo.frecuencia === 'quincenal' ? 'quincenal' : 'mensual');
  const [dia, setDia] = useState(sueldo.dia === undefined ? '' : String(sueldo.dia));
  // Pago mensual sin día fijo: llega entre `dia` y `diaHasta`.
  const [variable, setVariable] = useState(sueldo.diaHasta !== undefined);
  const [diaHasta, setDiaHasta] = useState(sueldo.diaHasta === undefined ? '' : String(sueldo.diaHasta));
  const [comida, setComida] = useState(sueldo.comidaCentavos > 0 ? centavosATexto(sueldo.comidaCentavos) : '');
  const [deComida, setDeComida] = useState(sueldo.categoriasComida);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const comidaCentavos = comida.trim() === '' ? 0 : textoACentavos(comida);
    if (comidaCentavos === null) return setError('El bono de comida no es un monto válido. Escribe, por ejemplo, 200.');
    if (comidaCentavos > 0 && deComida.length === 0) return setError('Elige al menos una categoría que cuente como comida.');
    const diaNumero = dia === '' ? undefined : Number(dia);
    const conRango = frecuencia === 'mensual' && variable;
    if (conRango && (diaNumero === undefined || diaHasta === '' || Number(diaHasta) <= diaNumero)) {
      return setError('Elige entre qué días te pagan: el segundo día tiene que ser después del primero.');
    }
    await guardarAjuste('sueldo', {
      frecuencia,
      diaHasta: conRango ? Number(diaHasta) : undefined,
      dia: frecuencia === 'quincenal' && diaNumero !== undefined && diaNumero > 15 ? diaNumero - 15 : diaNumero,
      comidaCentavos,
      categoriasComida: deComida,
    });
    alCerrar();
  }

  const alternar = (id: string) => setDeComida(deComida.includes(id) ? deComida.filter((x) => x !== id) : [...deComida, id]);
  const diaQuincena = dia !== '' && Number(dia) > 15 ? String(Number(dia) - 15) : dia;

  return (
    <Hoja titulo="Tu sueldo" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <fieldset className="campo">
          <legend>¿Cada cuánto te pagan?</legend>
          <div className="segmentos" role="group" aria-label="Cada cuánto te pagan">
            <button type="button" aria-pressed={frecuencia === 'mensual'} onClick={() => setFrecuencia('mensual')}>
              Cada mes
            </button>
            <button type="button" aria-pressed={frecuencia === 'quincenal'} onClick={() => setFrecuencia('quincenal')}>
              Cada quincena
            </button>
          </div>
        </fieldset>

        {frecuencia === 'mensual' && (
          <fieldset className="campo">
            <legend>¿Te pagan siempre el mismo día?</legend>
            <div className="segmentos" role="group" aria-label="Día de pago fijo o variable">
              <button type="button" aria-pressed={!variable} onClick={() => setVariable(false)}>
                Sí, día fijo
              </button>
              <button type="button" aria-pressed={variable} onClick={() => setVariable(true)}>
                No, varía
              </button>
            </div>
          </fieldset>
        )}

        {frecuencia === 'mensual' && variable ? (
          <div className="campo">
            <span>¿Entre qué días te pagan?</span>
            <div className="fila-campos">
              <label className="campo campo-crece">
                <span className="solo-lectores">Desde el día</span>
                <select value={dia} onChange={(e) => { setDia(e.target.value); setError(''); }}>
                  <option value="">Desde el…</option>
                  {DIAS.slice(0, 30).map((d) => (
                    <option key={d} value={d}>
                      Del {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo campo-crece">
                <span className="solo-lectores">Hasta el día</span>
                <select value={diaHasta} onChange={(e) => { setDiaHasta(e.target.value); setError(''); }}>
                  <option value="">Hasta el…</option>
                  {DIAS.filter((d) => dia === '' || d > Number(dia)).map((d) => (
                    <option key={d} value={d}>
                      al {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="ayuda sin-margen">
              La app aparta lo que vence antes del primer día, por si te pagan temprano, y te espera hasta el último.
            </span>
          </div>
        ) : (
        <label className="campo">
          <span>{frecuencia === 'mensual' ? '¿Qué día te pagan?' : '¿Qué días te pagan?'}</span>
          {frecuencia === 'mensual' ? (
            <select value={dia} onChange={(e) => setDia(e.target.value)}>
              <option value="">El día de mi último sueldo</option>
              {DIAS.map((d) => (
                <option key={d} value={d}>
                  El {d} de cada mes
                </option>
              ))}
            </select>
          ) : (
            <select value={diaQuincena} onChange={(e) => setDia(e.target.value)}>
              <option value="">Los días de mi último sueldo</option>
              {QUINCENAS.map((d) => (
                <option key={d} value={d}>
                  El {d} y el {d + 15 >= 30 ? 'último día' : d + 15}
                </option>
              ))}
            </select>
          )}
          <span className="ayuda sin-margen">Si el mes no tiene ese día, se usa el último. Lo que vence antes de ese día se aparta de tu sueldo.</span>
        </label>
        )}

        <label className="campo">
          <span>Bono de comida al mes</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="No tengo"
            value={comida}
            onChange={(e) => {
              setComida(e.target.value);
              setError('');
            }}
          />
          <span className="ayuda sin-margen">
            {frecuencia === 'quincenal' ? 'Se aparta la mitad de cada sueldo. ' : 'Se aparta de tu sueldo. '}
            Lo que gastes en comida, con o sin tarjeta, sale de ahí y ves cuánto te queda.
          </span>
        </label>

        {comida.trim() !== '' && (
          <fieldset className="campo">
            <legend>¿Qué cuenta como comida?</legend>
            <div className="chips">
              {categorias.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={deComida.includes(c.id)} onClick={() => alternar(c.id)}>
                  <MarcaCategoria categoria={c} /> {c.nombre}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="submit" className="boton primario">
            Guardar
          </button>
        </div>
      </form>
    </Hoja>
  );
}
