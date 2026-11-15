import { useState, type FormEvent } from 'react';
import type { Movimiento } from '../db';
import { guardarAjuste, type AjustesSaldo } from '../lib/ajustes';
import { centavosATexto, formatearDinero, textoACentavos } from '../lib/dinero';
import { fechaCorta, hoy } from '../lib/fechas';
import { calcularDisponible } from '../lib/resumen';
import { Hoja } from './Hoja';

interface Props {
  movimientos: Movimiento[];
  saldo: AjustesSaldo;
  alCerrar: () => void;
  /** Se llama con el texto a mostrar al terminar. */
  alGuardar?: (texto: string) => void;
}

/**
 * «¿Cuánto dinero tienes hoy?»: fija el dinero disponible sin tener que anotar
 * ingresos pasados. Guarda la diferencia con lo que suman los movimientos.
 */
export function FormularioSaldo({ movimientos, saldo, alCerrar, alGuardar }: Props) {
  const segunMovimientos = calcularDisponible(movimientos);
  const actual = segunMovimientos + saldo.ajusteCentavos;
  const [texto, setTexto] = useState(actual > 0 ? centavosATexto(actual) : '');
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const nuevo = texto.trim() === '' ? null : textoACentavos(texto);
    if (nuevo === null) return setError('Escribe cuánto tienes, por ejemplo 150.00 (o 0 si no tienes nada).');
    await guardarAjuste('saldo', { ajusteCentavos: nuevo - segunMovimientos, fecha: hoy() });
    alGuardar?.(`Listo: la app cuenta que hoy tienes ${formatearDinero(nuevo)}.`);
    alCerrar();
  }

  async function quitar() {
    await guardarAjuste('saldo', { ajusteCentavos: 0, fecha: undefined });
    alGuardar?.('Corrección quitada: tu dinero vuelve a salir solo de tus movimientos.');
    alCerrar();
  }

  return (
    <Hoja titulo="¿Cuánto dinero tienes hoy?" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <p className="texto-tenue">
          Suma tu efectivo y lo que tienes en tus cuentas. No cuentes el crédito de tus tarjetas. Desde ahí la app sigue restando
          tus gastos y sumando tus ingresos.
        </p>
        <label className="campo">
          <span>Dinero que tienes hoy</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={texto}
            autoFocus
            aria-invalid={error !== ''}
            onChange={(e) => {
              setTexto(e.target.value);
              setError('');
            }}
          />
          <span className="ayuda sin-margen">Según lo que has anotado, la app calculaba {formatearDinero(actual)}.</span>
        </label>
        {saldo.ajusteCentavos !== 0 && (
          <p className="ayuda sin-margen">
            Ya corregiste esta cifra{saldo.fecha ? ` el ${fechaCorta(saldo.fecha)}` : ''}. Puedes cambiarla o quitar la corrección.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          {saldo.ajusteCentavos !== 0 && (
            <button type="button" className="boton" onClick={() => void quitar()}>
              Quitar corrección
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
