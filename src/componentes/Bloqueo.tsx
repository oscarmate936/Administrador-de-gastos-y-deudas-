import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import type { AjustesBloqueo } from '../lib/ajustes';
import { borrarCopias } from '../lib/copias';
import { verificarPin } from '../lib/cripto';
import { guardarClave } from '../lib/respaldoAuto';
import { verificarHuella } from '../lib/nativo';
import { IconoHuella } from './Iconos';
import { TecladoPin } from './TecladoPin';

interface Props {
  ajustes: AjustesBloqueo;
  alDesbloquear: () => void;
}

const INTENTOS_ANTES_DE_ESPERAR = 5;
const SEGUNDOS_DE_ESPERA = 30;

/** Pantalla que tapa la app hasta que la persona pone su PIN o su huella. */
export function Bloqueo({ ajustes, alDesbloquear }: Props) {
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [fallos, setFallos] = useState(0);
  const [esperaHasta, setEsperaHasta] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [revisando, setRevisando] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const largo = ajustes.largoPin ?? 4;
  const pidioHuella = useRef(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const pedirHuella = async () => {
    if (await verificarHuella()) alDesbloquear();
  };

  useEffect(() => {
    if (ajustes.huella && !pidioHuella.current) {
      pidioHuella.current = true;
      void pedirHuella();
    }
    // Solo al mostrar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (esperaHasta <= Date.now()) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [esperaHasta]);

  const esperando = esperaHasta > ahora;

  async function cambiar(valor: string) {
    setPin(valor);
    setMensaje('');
    if (valor.length < largo) return;
    setRevisando(true);
    const bien = await verificarPin(valor, ajustes);
    setRevisando(false);
    if (bien) {
      alDesbloquear();
      return;
    }
    const n = fallos + 1;
    setFallos(n);
    setPin('');
    if (n % INTENTOS_ANTES_DE_ESPERAR === 0) {
      setEsperaHasta(Date.now() + SEGUNDOS_DE_ESPERA * 1000);
      setAhora(Date.now());
      setMensaje(`Demasiados intentos. Espera ${SEGUNDOS_DE_ESPERA} segundos.`);
    } else {
      setMensaje('PIN incorrecto');
    }
  }

  async function borrarTodo() {
    const ok =
      window.confirm('Esto borra TODOS tus datos de este dispositivo: movimientos, tarjetas, préstamos y ajustes. ¿Continuar?') &&
      window.confirm('Última confirmación: no se puede deshacer. Después podrás restaurar un respaldo si tienes uno. ¿Borrar todo?');
    if (!ok) return;
    // También las copias diarias guardadas en el celular y la contraseña del
    // respaldo automático: si quedaran, se podrían restaurar sin saber el PIN.
    await borrarCopias().catch(() => undefined);
    await guardarClave(undefined).catch(() => undefined);
    await db.delete();
    window.location.reload();
  }

  return (
    <dialog ref={dialogo} className="pantalla-bloqueo" aria-label="App bloqueada" onCancel={(e) => e.preventDefault()}>
      <img src="./icono.svg" alt="" className="logo-bloqueo" width="72" height="72" />
      {/* El foco inicial va al título y no a la tecla 1. */}
      <h1 tabIndex={-1} autoFocus>
        Mis Finanzas
      </h1>
      {olvido ? (
        <div className="olvido">
          <p>
            Por seguridad, el PIN no se puede recuperar. Si tienes la huella activada, úsala para entrar y cambiar el PIN en
            Ajustes.
          </p>
          <p>
            Si no, la única salida es borrar los datos de este dispositivo (también las copias automáticas) y restaurar tu último
            respaldo.
          </p>
          <button type="button" className="boton peligro" onClick={borrarTodo}>
            Borrar todo y empezar de nuevo
          </button>
          <button type="button" className="boton" onClick={() => setOlvido(false)}>
            Volver
          </button>
        </div>
      ) : (
        <>
          <p className={mensaje ? 'mensaje-bloqueo error-texto' : 'mensaje-bloqueo'} role="alert">
            {esperando
              ? `Espera ${Math.ceil((esperaHasta - ahora) / 1000)} segundos`
              : mensaje || 'Escribe tu PIN'}
          </p>
          <TecladoPin
            valor={pin}
            largo={largo}
            alCambiar={(v) => void cambiar(v)}
            deshabilitado={esperando || revisando}
            extra={
              ajustes.huella ? (
                <button type="button" className="tecla tecla-icono" aria-label="Usar huella" onClick={() => void pedirHuella()}>
                  <IconoHuella />
                </button>
              ) : null
            }
          />
          <button type="button" className="enlace" onClick={() => setOlvido(true)}>
            ¿Olvidaste tu PIN?
          </button>
        </>
      )}
    </dialog>
  );
}
