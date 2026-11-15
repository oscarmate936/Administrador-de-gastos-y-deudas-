import { useEffect, useState } from 'react';
import type { Datos } from '../datos';
import { guardarAjuste, type Ajustes, type AjustesRecordatorios } from '../lib/ajustes';
import { alarmasExactas, avisoDePrueba, esNativo, pedirAlarmasExactas, permisoNotificaciones, type EstadoPermiso } from '../lib/nativo';
import { generarRecordatorios } from '../lib/recordatorios';
import { Hoja } from './Hoja';

interface Props {
  ajustes: Ajustes;
  datos: Datos;
  alCerrar: () => void;
}

const OPCIONES_DIAS = [7, 5, 3, 2, 1, 0];
const textoDia = (d: number) => (d === 0 ? 'El mismo día' : d === 1 ? '1 día antes' : `${d} días antes`);
const fechaHora = new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function FormularioRecordatorios({ ajustes, datos, alCerrar }: Props) {
  const r = ajustes.recordatorios;
  const [permiso, setPermiso] = useState<EstadoPermiso | null>(null);
  // Sin alarmas exactas, Android puede retrasar los avisos varios minutos u horas.
  const [exactas, setExactas] = useState<boolean | null>(null);
  const [prueba, setPrueba] = useState('');
  useEffect(() => {
    void permisoNotificaciones(false).then(setPermiso);
    void alarmasExactas().then(setExactas);
  }, []);

  async function probar() {
    const ok = await avisoDePrueba();
    setPermiso(await permisoNotificaciones(false));
    setPrueba(ok ? 'Listo: en un minuto te llega un aviso de prueba. Toca «Ya pagué» en él.' : 'No se pudo: revisa que las notificaciones estén permitidas.');
  }

  const guardar = (cambios: Partial<AjustesRecordatorios>) => void guardarAjuste('recordatorios', cambios);
  const alternarDia = (clave: 'diasTarjeta' | 'diasPrestamo', d: number) => {
    const actual = r[clave];
    const nuevo = actual.includes(d) ? actual.filter((x) => x !== d) : [...actual, d].sort((a, b) => b - a);
    guardar({ [clave]: nuevo });
  };

  async function activar(activo: boolean) {
    if (activo) {
      const p = await permisoNotificaciones(true);
      setPermiso(p);
      if (p === 'negado') return;
    }
    guardar({ activo });
  }

  const proximos = generarRecordatorios(
    { ...datos, ajustes: { recordatorios: { ...r, activo: true }, respaldo: ajustes.respaldo } },
    new Date(),
  ).slice(0, 6);

  return (
    <Hoja titulo="Recordatorios" alCerrar={alCerrar}>
      <div className="formulario">
        {!esNativo && (
          <p className="aviso">Las notificaciones funcionan en la app de Android. Aquí puedes ver y ajustar qué avisaría.</p>
        )}
        {permiso === 'negado' && (
          <p className="aviso error">
            Las notificaciones están bloqueadas para Mis Finanzas. Actívalas en los ajustes del celular: Aplicaciones → Mis
            Finanzas → Notificaciones.
          </p>
        )}

        <label className="interruptor">
          <span>
            <strong>Avisarme en el celular</strong>
            <span className="texto-tenue">Funcionan sin internet. Se actualizan cada vez que abres la app.</span>
          </span>
          <input type="checkbox" role="switch" checked={r.activo} disabled={!esNativo} onChange={(e) => void activar(e.target.checked)} />
        </label>

        {r.activo && exactas === false && (
          <div className="aviso alerta">
            <p className="sin-margen">Android puede retrasar los avisos porque la app no tiene permiso de alarmas exactas.</p>
            <button type="button" className="enlace" onClick={() => void pedirAlarmasExactas().then(setExactas)}>
              Permitir alarmas exactas
            </button>
          </div>
        )}

        <label className="campo">
          <span>Hora de los avisos</span>
          <input type="time" value={r.hora} onChange={(e) => e.target.value && guardar({ hora: e.target.value })} />
        </label>

        <fieldset className="campo">
          <legend>Qué avisar</legend>
          <div className="lista-interruptores">
            {(
              [
                ['pagos', 'Fechas de pago', 'Tarjetas y cuotas, con el botón «Ya pagué»'],
                ['cortes', 'Corte de tarjeta', 'El día anterior al corte'],
                ['estados', 'Estado de cuenta listo', 'Para importarlo 2 días después del corte'],
                ['actualizar', 'Actualizar préstamos', 'Cada mes, 3 días después de la cuota'],
                ['resumen', 'Resumen del mes', 'El día 1, cómo te fue en el mes que terminó'],
                ['respaldo', 'Respaldo', `Cada ${ajustes.respaldo.recordarCadaDias} días`],
              ] as const
            ).map(([clave, titulo, detalle]) => (
              <label key={clave} className="interruptor">
                <span>
                  <strong>{titulo}</strong>
                  <span className="texto-tenue">{detalle}</span>
                </span>
                <input type="checkbox" role="switch" checked={r[clave]} onChange={(e) => guardar({ [clave]: e.target.checked })} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="campo">
          <legend>Pago de tarjetas</legend>
          <div className="chips">
            {OPCIONES_DIAS.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={r.diasTarjeta.includes(d)} onClick={() => alternarDia('diasTarjeta', d)}>
                {textoDia(d)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="campo">
          <legend>Cuotas de préstamos</legend>
          <div className="chips">
            {OPCIONES_DIAS.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={r.diasPrestamo.includes(d)} onClick={() => alternarDia('diasPrestamo', d)}>
                {textoDia(d)}
              </button>
            ))}
          </div>
        </fieldset>

        {esNativo && (
          <section className="campo">
            <h3 className="subtitulo">¿Llegan los avisos?</h3>
            <p className="texto-tenue">Te mandamos un aviso de prueba en un minuto, con sus botones, sin registrar nada.</p>
            <button type="button" className="boton" onClick={() => void probar()}>
              Probar un aviso
            </button>
            {prueba && (
              <p className="aviso" role="status">
                {prueba}
              </p>
            )}
          </section>
        )}

        <section className="campo">
          <h3 className="subtitulo">Próximos avisos</h3>
          {proximos.length === 0 ? (
            <p className="texto-tenue">Nada por avisar todavía. Registra tus tarjetas y préstamos en Deudas.</p>
          ) : (
            <ul className="lista-avisos">
              {proximos.map((a) => (
                <li key={a.clave}>
                  <span className="aviso-cuando">{fechaHora.format(a.fecha)}</span>
                  <strong>{a.titulo}</strong>
                  <span className="texto-tenue">{a.cuerpo}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Hoja>
  );
}
