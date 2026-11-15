import { useRef, useState, type FormEvent } from 'react';
import type { Datos, Detalle, Formulario } from '../datos';
import { db, nuevoId, type Movimiento } from '../db';
import { interpretar, type Intencion } from '../lib/asistente/interpretar';
import { capitalDelPago, estadoPrestamo } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta, hoy, sumarDias } from '../lib/fechas';
import { IconoSiguiente } from './Iconos';
import { Simbolo } from './Simbolo';

interface Props {
  datos: Datos;
  alAbrirFormulario: (f: Formulario) => void;
  alAbrir: (d: Detalle | 'movimientos') => void;
  /** Lo apartado en el fondo de emergencia, para responder cuánto queda libre. */
  fondoCentavos?: number;
}

// Ejemplos de frases; al tocarlos se escriben en la barra para completarlos.
const EJEMPLOS = ['Gasté 5 en almuerzo', 'Pagué 100 a la tarjeta', 'Me pagaron 450'];

const textoDia = (fecha: string) => {
  const h = hoy();
  if (fecha === h) return 'hoy';
  if (fecha === sumarDias(h, -1)) return `ayer (${fechaCorta(fecha)})`;
  return fechaCorta(fecha);
};

/**
 * Asistente sin IA: escribe o dicta una frase para registrar un movimiento.
 * Si escribes una pregunta («¿cuánto debo?») también la responde, pero no se
 * sugieren preguntas porque Inicio y Deudas ya muestran esas cifras.
 */
export function Asistente({ datos, alAbrirFormulario, alAbrir, fondoCentavos = 0 }: Props) {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<Intencion | null>(null);
  const [guardado, setGuardado] = useState<{ id: string; texto: string } | null>(null);
  // Las sugerencias aparecen al tocar la barra, para que Inicio quede limpio.
  const [abierto, setAbierto] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  /** Escribe un ejemplo en la barra y deja el cursor listo para cambiarlo. */
  const usarEjemplo = (frase: string) => {
    setResultado(null);
    setTexto(frase);
    entrada.current?.focus();
  };

  const preguntar = (frase: string) => {
    setGuardado(null);
    setResultado(interpretar(frase, datos, hoy(), fondoCentavos));
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (texto.trim()) preguntar(texto);
  }

  const nombreTarjeta = (id?: string) => datos.tarjetas.find((t) => t.id === id)?.nombre;
  const nombrePrestamo = (id: string) => datos.prestamos.find((p) => p.id === id)?.nombre ?? 'Préstamo';
  const nombreCategoria = (id?: string) => (id ? datos.mapaCategorias.get(id)?.nombre : undefined);

  /** El movimiento que se guardaría, o null si falta el monto. */
  function movimientoDe(r: Intencion): Movimiento | null {
    const base = { id: nuevoId(), nota: '', creadoEn: Date.now() };
    switch (r.tipo) {
      case 'gasto':
        return r.montoCentavos
          ? { ...base, tipo: 'gasto', montoCentavos: r.montoCentavos, fecha: r.fecha, categoriaId: r.categoriaId, tarjetaId: r.tarjetaId, nota: r.nota }
          : null;
      case 'ingreso':
        return r.montoCentavos ? { ...base, tipo: 'ingreso', montoCentavos: r.montoCentavos, fecha: r.fecha, esPago: r.esPago, nota: r.nota } : null;
      case 'pagoTarjeta':
        return r.montoCentavos ? { ...base, tipo: 'pago', montoCentavos: r.montoCentavos, fecha: r.fecha, tarjetaId: r.tarjetaId } : null;
      case 'pagoPrestamo': {
        const p = datos.prestamos.find((x) => x.id === r.prestamoId);
        if (!p) return null;
        const e = estadoPrestamo(p, datos.movimientos, hoy());
        const monto = r.montoCentavos ?? (r.extra ? 0 : e.proximaCuotaCentavos);
        if (!monto) return null;
        return {
          ...base,
          tipo: 'pago',
          montoCentavos: monto,
          fecha: r.fecha,
          prestamoId: p.id,
          esExtra: r.extra,
          capitalCentavos: capitalDelPago(p, e, monto, r.extra, r.fecha),
        };
      }
      default:
        return null;
    }
  }

  function revisar(r: Intencion) {
    if (r.tipo === 'gasto') {
      alAbrirFormulario({ clase: 'movimiento', tipo: 'gasto', borrador: { montoCentavos: r.montoCentavos, categoriaId: r.categoriaId, tarjetaId: r.tarjetaId, fecha: r.fecha, nota: r.nota } });
    } else if (r.tipo === 'ingreso') {
      alAbrirFormulario({ clase: 'movimiento', tipo: 'ingreso', borrador: { montoCentavos: r.montoCentavos, esPago: r.esPago, fecha: r.fecha, nota: r.nota } });
    } else if (r.tipo === 'pagoTarjeta') {
      alAbrirFormulario({ clase: 'pago', tarjetaId: r.tarjetaId, monto: r.montoCentavos, fecha: r.fecha });
    } else if (r.tipo === 'pagoPrestamo') {
      alAbrirFormulario({ clase: 'pago', prestamoId: r.prestamoId, extra: r.extra, monto: r.montoCentavos, fecha: r.fecha });
    }
    setResultado(null);
    setTexto('');
  }

  // Evita guardar dos veces con un doble toque.
  const enviando = useRef(false);

  async function guardar(r: Intencion) {
    const m = movimientoDe(r);
    if (!m || enviando.current) return;
    enviando.current = true;
    try {
      await db.movimientos.add(m);
    } finally {
      enviando.current = false;
    }
    setGuardado({ id: m.id, texto: `${resumen(r)} guardado.` });
    setResultado(null);
    setTexto('');
  }

  function resumen(r: Intencion): string {
    const m = movimientoDe(r);
    const monto = m ? formatearDinero(m.montoCentavos) : 'sin monto';
    switch (r.tipo) {
      case 'gasto':
        return [`Gasto de ${monto}`, nombreCategoria(r.categoriaId) ?? 'sin categoría', nombreTarjeta(r.tarjetaId) ? `con ${nombreTarjeta(r.tarjetaId)}` : 'en efectivo', textoDia(r.fecha)].join(' · ');
      case 'ingreso':
        return [`${r.esPago ? 'Tu pago' : 'Ingreso'} de ${monto}`, textoDia(r.fecha)].join(' · ');
      case 'pagoTarjeta':
        return [`Pago de ${monto} a ${nombreTarjeta(r.tarjetaId)}`, textoDia(r.fecha)].join(' · ');
      case 'pagoPrestamo':
        return [`${r.extra ? 'Abono extra' : 'Cuota'} de ${monto} a ${nombrePrestamo(r.prestamoId)}`, textoDia(r.fecha)].join(' · ');
      default:
        return '';
    }
  }

  const esRegistro = resultado && ['gasto', 'ingreso', 'pagoTarjeta', 'pagoPrestamo'].includes(resultado.tipo);

  return (
    <section className="asistente" aria-label="Asistente">
      <form className="asistente-entrada" onSubmit={enviar}>
        <Simbolo nombre="chispa" />
        <input
          ref={entrada}
          onFocus={() => setAbierto(true)}
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          placeholder="Escribe «gasté 5 en almuerzo»"
          aria-label="Registra con una frase"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {texto.trim() && (
          <button type="submit" className="boton-icono primario" aria-label="Enviar">
            <IconoSiguiente />
          </button>
        )}
      </form>

      {abierto && !resultado && !guardado && !texto && (
        <div className="chips desplazable">
          {EJEMPLOS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => usarEjemplo(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {guardado && (
        <p className="aviso" role="status">
          {guardado.texto}{' '}
          <button
            type="button"
            className="enlace"
            onClick={async () => {
              await db.movimientos.delete(guardado.id);
              setGuardado(null);
            }}
          >
            Deshacer
          </button>
        </p>
      )}

      {resultado?.tipo === 'respuesta' && (
        <div className="asistente-respuesta" role="status">
          <strong>{resultado.titulo}</strong>
          {resultado.lineas.length > 0 && (
            <ul>
              {resultado.lineas.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {resultado.destino && (
            <button type="button" className="enlace" onClick={() => alAbrir(resultado.destino!)}>
              Ver detalle
            </button>
          )}
        </div>
      )}

      {esRegistro && resultado && (
        <div className="asistente-respuesta" role="status">
          <span className="texto-tenue">Entendí:</span>
          <strong>{resumen(resultado)}</strong>
          {'nota' in resultado && resultado.nota && <span className="texto-tenue">Nota: {resultado.nota}</span>}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => revisar(resultado)}>
              {movimientoDe(resultado) ? 'Revisar' : 'Completar'}
            </button>
            {movimientoDe(resultado) && (
              <button type="button" className="boton primario" onClick={() => void guardar(resultado)}>
                Guardar
              </button>
            )}
          </div>
        </div>
      )}

      {resultado?.tipo === 'noEntendi' && (
        <div className="asistente-respuesta" role="status">
          <strong>No entendí esa frase.</strong>
          <span className="texto-tenue">Prueba con algo como:</span>
          <div className="chips">
            {EJEMPLOS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => usarEjemplo(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
