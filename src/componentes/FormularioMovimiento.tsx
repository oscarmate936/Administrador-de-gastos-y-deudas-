import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { db, nuevoId, type Categoria, type Movimiento, type Tarjeta } from '../db';
import type { Borrador } from '../datos';
import { evaluarMonto } from '../lib/calculo';
import { centavosATexto, formatearDinero } from '../lib/dinero';
import { notasRecientes, ordenarPorUso, recordarComercio } from '../lib/frecuentes';
import { esFechaValida, fechaCorta, hoy } from '../lib/fechas';
import { primeraFecha } from '../lib/recurrentes';
import { sugerirCategoria } from '../lib/estados/categorias';
import { marcarSalidaPropia } from '../lib/nativo';
import { Hoja } from './Hoja';
import { MarcaCategoria, Simbolo } from './Simbolo';
import { TecladoMonto } from './TecladoMonto';

/** Lo que cambió al guardar, para poder deshacerlo. */
export interface Cambio {
  /** El movimiento como estaba antes de editarlo. */
  anterior?: Movimiento;
  /** Plantilla mensual creada junto con el movimiento. */
  recurrenteId?: string;
}

interface Props {
  /** Si viene, se edita ese movimiento; si no, se crea uno nuevo. */
  movimiento?: Movimiento;
  tipoInicial: 'ingreso' | 'gasto';
  categorias: Categoria[];
  tarjetas: Tarjeta[];
  /** Todos los movimientos: para ordenar por uso y recordar comercios. */
  movimientos: Movimiento[];
  /** Tarjeta preseleccionada al registrar una compra desde el detalle de una tarjeta. */
  tarjetaInicial?: string;
  /** Valores iniciales de un movimiento nuevo. */
  borrador?: Borrador;
  alCerrar: () => void;
  /** Se llama con el movimiento guardado (avisos de límite y Deshacer). */
  alGuardar?: (m: Movimiento, cambio: Cambio) => void;
  /** Se llama con el movimiento eliminado (para Deshacer). */
  alEliminar?: (m: Movimiento) => void;
  /** Abre la cámara o la galería en cuanto aparece el formulario. */
  leerAlAbrir?: boolean;
}

export function FormularioMovimiento(props: Props) {
  const { movimiento, tipoInicial, categorias, tarjetas, movimientos, tarjetaInicial, borrador, alCerrar, alGuardar, alEliminar, leerAlAbrir } = props;
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
  // El teclado del monto aparece abierto al registrar algo nuevo.
  const [tecladoAbierto, setTecladoAbierto] = useState(!movimiento && !leerAlAbrir);
  // Si la persona ya eligió categoría o forma de pago, la nota no las cambia.
  const categoriaTocada = useRef(movimiento !== undefined || borrador?.categoriaId !== undefined);
  const tarjetaTocada = useRef(movimiento !== undefined || borrador?.tarjetaId !== undefined || tarjetaInicial !== undefined);
  const [recordado, setRecordado] = useState('');
  const fechaHoy = hoy();
  const categoriasOrdenadas = useMemo(() => ordenarPorUso(categorias, movimientos, fechaHoy, 'categoriaId'), [categorias, movimientos, fechaHoy]);
  const tarjetasOrdenadas = useMemo(() => ordenarPorUso(tarjetas, movimientos, fechaHoy, 'tarjetaId'), [tarjetas, movimientos, fechaHoy]);
  const sugerencias = useMemo(() => notasRecientes(movimientos), [movimientos]);

  /** Al escribir una nota conocida, propone la categoría y la tarjeta de la última vez. */
  function cambiarNota(texto: string) {
    setNota(texto);
    if (tipo !== 'gasto') return;
    const recuerdo = recordarComercio(movimientos, texto, movimiento?.id);
    if (recuerdo) {
      const aplicados: string[] = [];
      if (!categoriaTocada.current && recuerdo.categoriaId && categorias.some((c) => c.id === recuerdo.categoriaId)) {
        setCategoriaId(recuerdo.categoriaId);
        aplicados.push('la categoría');
      }
      const tarjetaExiste = recuerdo.tarjetaId === undefined || tarjetas.some((t) => t.id === recuerdo.tarjetaId);
      if (!tarjetaTocada.current && tarjetaExiste && tarjetas.length > 0) {
        setTarjetaId(recuerdo.tarjetaId);
        aplicados.push('la forma de pago');
      }
      setRecordado(aplicados.length ? `Elegí ${aplicados.join(' y ')} de la última vez. Puedes cambiarlo.` : '');
      return;
    }
    setRecordado('');
    if (!categoriaTocada.current) {
      const sugerida = sugerirCategoria(texto);
      if (sugerida && categorias.some((c) => c.id === sugerida)) setCategoriaId(sugerida);
    }
  }
  const [lectura, setLectura] = useState<{ estado: 'leyendo'; avance: number } | { estado: 'listo' | 'error'; texto: string } | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const yaAbierta = useRef(false);
  useEffect(() => {
    if (!leerAlAbrir || yaAbierta.current) return;
    yaAbierta.current = true;
    marcarSalidaPropia();
    entradaFoto.current?.click();
  }, [leerAlAbrir]);

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
        cambiarNota(comercio);
        leidos.push('comercio');
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
  // Fijos mientras el formulario está abierto: guardar dos veces seguidas no crea duplicados.
  const [idNuevo] = useState(nuevoId);
  const [idRecurrente] = useState(nuevoId);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const montoCentavos = evaluarMonto(monto);
    if (!montoCentavos) {
      setError('Escribe un monto mayor que cero, por ejemplo 12.50');
      setTecladoAbierto(true);
      return;
    }
    if (!esFechaValida(fecha)) {
      setError('Elige una fecha válida.');
      return;
    }
    if (fecha > hoy()) {
      if (tipo === 'ingreso') {
        setError('Registra el ingreso cuando lo recibas: la fecha no puede ser futura.');
        return;
      }
      if (!window.confirm(`La fecha es futura (${fechaCorta(fecha)}). El gasto contará desde ya. ¿Guardarlo así?`)) return;
    }
    const conTarjeta = tipo === 'gasto' && tarjetaId !== undefined;
    const numCuotas = Number(cuotas);
    if (conTarjeta && (!Number.isInteger(numCuotas) || numCuotas < 1 || numCuotas > 60)) {
      setError('Las cuotas deben ser un número entre 1 y 60.');
      return;
    }
    const guardado: Movimiento = {
      id: movimiento?.id ?? idNuevo,
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
    let recurrenteId: string | undefined;
    if (repetir && !movimiento) {
      recurrenteId = idRecurrente;
      await db.recurrentes.put({
        id: recurrenteId,
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
    alGuardar?.(guardado, { anterior: movimiento, recurrenteId });
    alCerrar();
  }

  // Sin pregunta de confirmación: el aviso que aparece ofrece Deshacer.
  async function eliminar() {
    if (!movimiento) return;
    await db.movimientos.delete(movimiento.id);
    alEliminar?.(movimiento);
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
                : (
                  <>
                    <Simbolo nombre="camara" tamano={18} /> Leer ticket o captura
                  </>
                )}
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

        <TecladoMonto
          valor={monto}
          alCambiar={(v) => {
            setMonto(v);
            setError('');
          }}
          abierto={tecladoAbierto}
          alAbrir={() => setTecladoAbierto(true)}
          alCerrar={() => setTecladoAbierto(false)}
          invalido={error !== ''}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <label className="campo">
          <span>{tipo === 'gasto' ? '¿En qué? (opcional)' : 'Nota (opcional)'}</span>
          <input
            type="text"
            value={nota}
            maxLength={80}
            list={tipo === 'gasto' ? 'notas-anteriores' : undefined}
            autoComplete="off"
            placeholder={tipo === 'gasto' ? 'Ej. almuerzo, Super Selectos' : 'Ej. quincena'}
            onFocus={() => setTecladoAbierto(false)}
            onChange={(e) => cambiarNota(e.target.value)}
          />
          {recordado && <span className="ayuda sin-margen">{recordado}</span>}
        </label>
        {tipo === 'gasto' && (
          <datalist id="notas-anteriores">
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}

        {tipo === 'gasto' ? (
          <fieldset className="campo">
            <legend>Categoría</legend>
            <div className="chips">
              {categoriasOrdenadas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={categoriaId === c.id}
                  onClick={() => {
                    categoriaTocada.current = true;
                    setRecordado('');
                    setCategoriaId(categoriaId === c.id ? undefined : c.id);
                  }}
                >
                  <MarcaCategoria categoria={c} /> {c.nombre}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="campo">
            <legend>¿Qué tipo de ingreso es?</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={esPago} onClick={() => setEsPago(true)}>
                <Simbolo nombre="ingreso" tamano={16} /> Mi pago
              </button>
              <button type="button" className="chip" aria-pressed={!esPago} onClick={() => setEsPago(false)}>
                <Simbolo nombre="dinero" tamano={16} /> Otro ingreso
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
              <button
                type="button"
                className="chip"
                aria-pressed={tarjetaId === undefined}
                onClick={() => {
                  tarjetaTocada.current = true;
                  setTarjetaId(undefined);
                }}
              >
                <Simbolo nombre="dinero" tamano={16} /> Efectivo o débito
              </button>
              {tarjetasOrdenadas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  aria-pressed={tarjetaId === t.id}
                  onClick={() => {
                    tarjetaTocada.current = true;
                    setTarjetaId(t.id);
                  }}
                >
                  <span className="marca-categoria" style={{ color: t.color }}><Simbolo nombre="tarjeta" tamano={16} /></span> {t.nombre}
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
