import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { aplicarImportacion, leerArchivoDeudas, planImportacion, type PlanImportacion } from '../lib/archivoDeudas';
import { estadoPrestamo, estadoTarjeta } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { hoy } from '../lib/fechas';
import { Hoja } from './Hoja';

interface Props {
  /** Texto del archivo elegido. */
  texto: string;
  alCerrar: () => void;
  /** Se llama con el mensaje para mostrar al terminar. */
  alTerminar: (texto: string) => void;
}

/** Revisa un archivo de deudas, muestra qué se agrega y qué se actualiza, y lo guarda al confirmar. */
export function ImportarDeudas({ texto, alCerrar, alTerminar }: Props) {
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const archivo = leerArchivoDeudas(texto);
        const [tarjetas, prestamos, movimientos] = await Promise.all([db.tarjetas.toArray(), db.prestamos.toArray(), db.movimientos.toArray()]);
        setPlan(planImportacion(archivo, { tarjetas, prestamos, movimientos }, hoy()));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
      }
    })();
  }, [texto]);

  async function guardar() {
    if (!plan || enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    try {
      await aplicarImportacion(db, plan);
      const n = plan.tarjetas.length + plan.prestamos.length;
      alTerminar(`Listo: ${n === 1 ? 'se cargó 1 deuda' : `se cargaron ${n} deudas`}. Tus movimientos y pagos no se tocaron.`);
    } catch {
      enviando.current = false;
      setGuardando(false);
      setError('No se pudo guardar. No se cambió nada; inténtalo de nuevo.');
    }
  }

  const fecha = hoy();
  const nuevas = plan ? [...plan.tarjetas.filter((t) => t.nueva).map((t) => t.tarjeta.nombre), ...plan.prestamos.filter((p) => p.nuevo).map((p) => p.prestamo.nombre)] : [];
  return (
    <Hoja titulo="Cargar tus deudas" alCerrar={alCerrar}>
      <div className="formulario">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!plan && !error && <p className="texto-tenue">Leyendo el archivo…</p>}
        {plan && (
          <>
            <p className="texto-tenue">
              Se agregan las deudas que no tienes y se ponen al día las que ya están. No se borra nada: tus movimientos y pagos
              quedan igual.
            </p>
            <ul className="lista grupo-borde">
              {plan.tarjetas.map(({ tarjeta: t, nueva, sinCambios }) => (
                <li key={t.id} className="fila-info">
                  <span className="fila-texto">
                    <span className="fila-titulo">{t.nombre}</span>
                    <span className="fila-detalle envolver">
                      {nueva ? 'Nueva' : sinCambios ? 'Ya tienes datos más recientes: solo se cambia cómo la pagas' : 'Se pone al día'} · debes{' '}
                      {formatearDinero(estadoTarjeta(t, [], fecha).deudaTotalCentavos)}
                    </span>
                  </span>
                </li>
              ))}
              {plan.prestamos.map(({ prestamo: p, nuevo, sinCambios }) => (
                <li key={p.id} className="fila-info">
                  <span className="fila-texto">
                    <span className="fila-titulo">{p.nombre}</span>
                    <span className="fila-detalle envolver">
                      {nuevo ? 'Nuevo' : sinCambios ? 'Ya tienes datos más recientes: se queda como está' : 'Se pone al día, sin borrar sus pagos'} · cuota{' '}
                      {formatearDinero(p.cuotaCentavos)}
                      {nuevo && ` · debes ${formatearDinero(estadoPrestamo(p, [], fecha).saldoCentavos)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {plan.sueldo && (
              <p className="ayuda sin-margen">
                También se guarda cómo te pagan
                {plan.sueldo.comidaCentavos ? ` y tu bono de comida de ${formatearDinero(plan.sueldo.comidaCentavos)}` : ''}.
              </p>
            )}
            {nuevas.length > 0 && (
              <p className="ayuda sin-margen">
                Si alguna de las nuevas ya la tenías con otro nombre, después borra la vieja desde su detalle (Editar → Eliminar).
              </p>
            )}
            <div className="acciones">
              <button type="button" className="boton primario" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Cargar mis deudas'}
              </button>
            </div>
          </>
        )}
      </div>
    </Hoja>
  );
}
