import { useEffect, useState } from 'react';
import { guardarAjuste, type AjustesBloqueo } from '../lib/ajustes';
import { protegerPin } from '../lib/cripto';
import { huellaDisponible, pantallaPrivada } from '../lib/nativo';
import { Hoja } from './Hoja';
import { TecladoPin } from './TecladoPin';

interface Props {
  ajustes: AjustesBloqueo;
  alCerrar: () => void;
}

const ESPERAS = [
  { minutos: 0, texto: 'Siempre' },
  { minutos: 1, texto: 'Después de 1 min' },
  { minutos: 5, texto: 'Después de 5 min' },
];

type Paso = { tipo: 'opciones' } | { tipo: 'nuevo' } | { tipo: 'confirmar'; primero: string };

export function FormularioBloqueo({ ajustes, alCerrar }: Props) {
  const [paso, setPaso] = useState<Paso>(ajustes.activo ? { tipo: 'opciones' } : { tipo: 'nuevo' });
  const [largo, setLargo] = useState(4);
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [hayHuella, setHayHuella] = useState(false);

  useEffect(() => {
    void huellaDisponible().then(setHayHuella);
  }, []);

  async function escribir(valor: string) {
    setPin(valor);
    setMensaje('');
    if (valor.length < largo) return;
    if (paso.tipo === 'nuevo') {
      setPaso({ tipo: 'confirmar', primero: valor });
      setPin('');
      return;
    }
    if (paso.tipo === 'confirmar') {
      if (valor !== paso.primero) {
        setMensaje('Los PIN no coinciden. Empieza de nuevo.');
        setPaso({ tipo: 'nuevo' });
        setPin('');
        return;
      }
      await guardarAjuste('bloqueo', { activo: true, largoPin: largo, ...(await protegerPin(valor)) });
      await pantallaPrivada(true);
      setPin('');
      setPaso({ tipo: 'opciones' });
    }
  }

  async function desactivar() {
    if (!window.confirm('¿Quitar el bloqueo? Cualquiera con tu celular desbloqueado podrá ver tus finanzas.')) return;
    await guardarAjuste('bloqueo', { activo: false, huella: false, pinHash: undefined, sal: undefined, largoPin: undefined });
    await pantallaPrivada(false);
    alCerrar();
  }

  if (paso.tipo !== 'opciones') {
    return (
      <Hoja titulo={paso.tipo === 'nuevo' ? 'Crea tu PIN' : 'Confirma tu PIN'} alCerrar={alCerrar}>
        <div className="formulario centrado">
          {paso.tipo === 'nuevo' && (
            <div className="segmentos" role="group" aria-label="Largo del PIN">
              {[4, 6].map((n) => (
                <button key={n} type="button" aria-pressed={largo === n} onClick={() => { setLargo(n); setPin(''); }}>
                  {n} dígitos
                </button>
              ))}
            </div>
          )}
          <p className={mensaje ? 'error-texto' : 'texto-tenue'} role="status">
            {mensaje || (paso.tipo === 'nuevo' ? 'Elige un PIN que no uses en otro lugar.' : 'Escríbelo otra vez.')}
          </p>
          <TecladoPin valor={pin} largo={largo} alCambiar={(v) => void escribir(v)} />
          <p className="ayuda sin-margen">
            Si lo olvidas no se puede recuperar: haz un respaldo antes y, si tu celular tiene huella, actívala también.
          </p>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja titulo="Bloqueo de la app" alCerrar={alCerrar}>
      <div className="formulario">
        <p className="aviso">La app pide tu PIN al abrirla y oculta su contenido en la lista de apps recientes.</p>

        {hayHuella && (
          <label className="interruptor">
            <span>
              <strong>Usar huella o rostro</strong>
              <span className="texto-tenue">Más rápido que escribir el PIN.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={ajustes.huella}
              onChange={(e) => void guardarAjuste('bloqueo', { huella: e.target.checked })}
            />
          </label>
        )}

        <fieldset className="campo">
          <legend>Pedir el PIN al volver a la app</legend>
          <div className="chips">
            {ESPERAS.map((e) => (
              <button
                key={e.minutos}
                type="button"
                className="chip"
                aria-pressed={ajustes.esperaMinutos === e.minutos}
                onClick={() => void guardarAjuste('bloqueo', { esperaMinutos: e.minutos })}
              >
                {e.texto}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="acciones-columna">
          <button type="button" className="boton" onClick={() => setPaso({ tipo: 'nuevo' })}>
            Cambiar PIN
          </button>
          <button type="button" className="boton peligro" onClick={desactivar}>
            Quitar el bloqueo
          </button>
        </div>
      </div>
    </Hoja>
  );
}
