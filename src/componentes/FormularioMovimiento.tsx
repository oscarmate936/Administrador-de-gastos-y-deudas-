import { useRef, useState, type FormEvent } from 'react';
import { db, nuevoId, type Categoria, type Movimiento, type Tarjeta } from '../db';
import type { Borrador } from '../datos';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { esFechaValida, hoy } from '../lib/fechas';
import { primeraFecha } from '../lib/recurrentes';
import { sugerirCategoria } from '../lib/estados/categorias';
import { marcarSalidaPropia } from '../lib/nativo';
import { Hoja } from './Hoja';

interface Props {
  /** Si viene, se edita ese movimiento; si no, se crea uno nuevo. */
  movimiento?: Movimiento;
  tipoInicial: 'ingreso' | 'gasto';
  categorias: Categoria[];
  tarjetas: Tarjeta[];
  /** Tarjeta preseleccionada al registrar una compra desde el detalle de una tarjeta. */
  tarjetaInicial?: string;
  /** Valores iniciales de un movimiento nuevo. */
  borrador?: Borrador;
  alCerrar: () => void;
  /** Se llama con el movimiento guardado (para avisos de límite). */
  alGuardar?: (m: Movimiento) => void;
}

export function FormularioMovimiento({ movimiento, tipoInicial, categorias, tarjetas, tarjetaInicial, borrador, alCerrar, alGuardar }: Props) {
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(movimiento?.tipo === 'ingreso' ? 'ingreso' : movimiento ? 'gasto' : tipoInicial);
  const [tarjetaId, setTarjetaId] = useState(movimiento ? movimiento.tarjetaId : (borrador?.tarjetaId ?? tarjetaInicial));
  const [cuotas, setCuotas] = useState(String(movimiento?.cuotas ?? 1));
  const [monto, setMonto] = useState(
    movimiento ? centavosATexto(movimiento.montoCentavos) : borrador?.montoCentavos ? centavosATexto(borrador.montoCentavos) : '',
  );
  const [fecha, setFecha] = useState(movimiento?.fecha ?? borrador?.fecha ?? hoy());
  const [categoriaId, setCategoriaId] = useState(movimiento ? movimiento.categoriaId : borrador?.categoriaId);
  const [esPago, setEsPago] = useState(movimiento?.esPago ?? borrador?.esPago ?? true);
  const [nota, setNota] = useState(movimiento?.nota ?? borrador?.nota ?? '');
  const [repetir, setRepetir] = useState(false);
  const [lectura, setLectura] = useState<{ estado: 'leyendo'; avance: number } | { estado: 'listo' | 'error'; texto: string } | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);

  async function leerFoto(archivo: File) {
    setLectura({ estado: 'leyendo', avance: 0 });
    try {
      const [{ leerTextoDeImagen }, { leerTicket }, { combinar }] = await Promise.all([
        import('../lib/ocr/leer'),
        import('../lib/ocr/ticket'),
        import('../lib/ocr/combinar'),
      ]);
      const [textoLstm, textoClasico] = await leerTextoDeImagen(archivo, (avance) => setLectura({ estado: 'leyendo', avance }));
      const lstm = leerTicket(textoLstm, hoy());
      const clasico = leerTicket(textoClasico, hoy());
      // Los números se toman del motor clásico; las palabras, del moderno.
      const montoLeido = combinar(clasico.montoCentavos, lstm.montoCentavos);
      const fechaLeida = combinar(clasico.fecha, lstm.fecha);
      const comercio = lstm.comercio ?? clasico.comercio;
      const leidos: string[] = [];
      if (montoLeido.valor) {
        setMonto(centavosATexto(montoLeido.valor));
        leidos.push('monto');
      }
      if (fechaLeida.valor) {
        setFecha(fechaLeida.valor);
        leidos.push('fecha');
      }
      if (comercio) {
        setNota(comercio);
        leidos.push('comercio');
        const sugerida = sugerirCategoria(comercio);
        if (sugerida && categorias.some((c) => c.id === sugerida)) setCategoriaId(sugerida);
      }
      setError('');
      const duda =
        montoLeido.dudoso && montoLeido.alternativa
          ? ` Ojo: el monto lo leí como ${formatearDinero(montoLeido.valor!)} o ${formatearDinero(montoLeido.alternativa)}; confírmalo.`
          : '';
      setLectura(
        leidos.length > 0
          ? { estado: duda ? 'error' : 'listo', texto: `Leí ${leidos.join(', ')}. Revisa que esté bien antes de guardar.${duda}` }
          : { estado: 'error', texto: 'No encontré datos en la imagen. Prueba con una foto más nítida o escríbelos.' },
      );
    } catch {
      setLectura({ estado: 'error', texto: 'No pude leer la imagen.' });
    }
  }
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
    const conTarjeta = tipo === 'gasto' && tarjetaId !== undefined;
    const numCuotas = Number(cuotas);
    if (conTarjeta && (!Number.isInteger(numCuotas) || numCuotas < 1 || numCuotas > 60)) {
      setError('Las cuotas deben ser un número entre 1 y 60.');
      return;
    }
    const guardado: Movimiento = {
      id: movimiento?.id ?? nuevoId(),
      tipo,
      montoCentavos,
      fecha,
      categoriaId: tipo === 'gasto' ? categoriaId : undefined,
      esPago: tipo === 'ingreso' ? esPago : undefined,
      tarjetaId: conTarjeta ? tarjetaId : undefined,
      cuotas: conTarjeta && numCuotas > 1 ? numCuotas : undefined,
      nota: nota.trim(),
      creadoEn: movimiento?.creadoEn ?? Date.now(),
    };
    await db.movimientos.put(guardado);
    if (repetir && !movimiento) {
      await db.recurrentes.add({
        id: nuevoId(),
        tipo,
        montoCentavos,
        categoriaId: guardado.categoriaId,
        tarjetaId: guardado.tarjetaId,
        esPago: guardado.esPago,
        nota: guardado.nota,
        ...primeraFecha(fecha),
        activo: true,
        creadoEn: Date.now(),
      });
    }
    alGuardar?.(guardado);
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

        {tipo === 'gasto' && !movimiento && (
          <>
            <button
              type="button"
              className="boton boton-foto"
              disabled={lectura?.estado === 'leyendo'}
              onClick={() => {
                marcarSalidaPropia();
                entradaFoto.current?.click();
              }}
            >
              {lectura?.estado === 'leyendo'
                ? `Leyendo la imagen… ${Math.round(lectura.avance * 100)}%`
                : '📷 Leer ticket o captura'}
            </button>
            <input
              ref={entradaFoto}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = '';
                if (archivo) void leerFoto(archivo);
              }}
            />
            {lectura && lectura.estado !== 'leyendo' && (
              <p className={lectura.estado === 'listo' ? 'aviso' : 'aviso error'} role="status">
                {lectura.texto}
              </p>
            )}
          </>
        )}

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

        {tipo === 'gasto' && tarjetas.length > 0 && (
          <fieldset className="campo">
            <legend>¿Con qué pagaste?</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={tarjetaId === undefined} onClick={() => setTarjetaId(undefined)}>
                <span aria-hidden="true">💵</span> Efectivo o débito
              </button>
              {tarjetas.map((t) => (
                <button key={t.id} type="button" className="chip" aria-pressed={tarjetaId === t.id} onClick={() => setTarjetaId(t.id)}>
                  <span aria-hidden="true">💳</span> {t.nombre}
                </button>
              ))}
            </div>
            <p className="ayuda">
              {tarjetaId === undefined
                ? 'Se resta de tu disponible.'
                : 'Aumenta la deuda de la tarjeta; tu disponible baja cuando pagues la tarjeta.'}
            </p>
          </fieldset>
        )}

        {tipo === 'gasto' && tarjetaId !== undefined && (
          <label className="campo">
            <span>Cuotas (1 = de contado)</span>
            <input type="text" inputMode="numeric" value={cuotas} maxLength={2} onChange={(e) => { setCuotas(e.target.value); setError(''); }} />
          </label>
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

        {!movimiento && (
          <label className="interruptor">
            <span>
              <strong>Se repite cada mes</strong>
              <span className="texto-tenue">Te lo propone el mismo día del próximo mes para confirmarlo con un toque.</span>
            </span>
            <input type="checkbox" role="switch" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
          </label>
        )}

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
