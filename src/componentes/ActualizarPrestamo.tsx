import { useState } from 'react';
import { db, type Movimiento, type Prestamo } from '../db';
import { ajustarPrestamo, estadoPrestamo, inicioSegunDesglose } from '../lib/deudas';
import { centavosATexto, formatearDinero, textoACentavos, textoATasa } from '../lib/dinero';
import { esFechaValida, fechaCorta, hoy } from '../lib/fechas';
import { desgloseDe, type CapturaPrestamo } from '../lib/ocr/prestamo';
import { Hoja } from './Hoja';
import { DudasLectura } from './LecturaCaptura';

interface Props {
  prestamo: Prestamo;
  movimientos: Movimiento[];
  captura: CapturaPrestamo;
  alCerrar: () => void;
}

/** Ajusta un préstamo existente a lo que muestra la app del banco. */
export function ActualizarPrestamo({ prestamo: p, movimientos, captura, alCerrar }: Props) {
  const actual = estadoPrestamo(p, movimientos, hoy());
  const [saldo, setSaldo] = useState(captura.saldo.valor !== undefined ? centavosATexto(captura.saldo.valor) : centavosATexto(actual.saldoCentavos));
  const [cuota, setCuota] = useState(centavosATexto(captura.cuota.valor ?? p.cuotaCentavos));
  const [tasa, setTasa] = useState(String(captura.tasaAnual.valor ?? p.tasaAnual));
  const [fecha, setFecha] = useState(captura.proximaFecha.valor ?? actual.proximaFecha ?? hoy());
  const cargosIniciales = captura.cargos.valor ?? p.cargosCentavos;
  const [cargos, setCargos] = useState(cargosIniciales ? centavosATexto(cargosIniciales) : '');
  const [error, setError] = useState('');

  async function guardar() {
    const saldoCentavos = textoACentavos(saldo);
    const cuotaCentavos = textoACentavos(cuota);
    const tasaAnual = textoATasa(tasa);
    if (saldoCentavos === null) return setError('El saldo no es un monto válido.');
    if (!cuotaCentavos) return setError('La cuota no es un monto válido.');
    if (tasaAnual === null) return setError('La tasa no es válida.');
    if (!esFechaValida(fecha)) return setError('Elige la fecha de la próxima cuota.');
    const cargosCentavos = cargos.trim() === '' ? 0 : textoACentavos(cargos);
    if (cargosCentavos === null) return setError('Los seguros y otros cargos no son un monto válido.');
    if (cargosCentavos >= cuotaCentavos) return setError('Los seguros y otros cargos deben ser menores que la cuota.');
    const desglose = desgloseDe(captura);
    await db.prestamos.put(
      ajustarPrestamo(p, movimientos, hoy(), {
        desgloseCuota: desglose?.fecha === fecha ? desglose : undefined,
        saldoCentavos,
        cuotaCentavos,
        tasaAnual,
        proximaFecha: fecha,
        montoOriginalCentavos: captura.montoOriginal.valor,
        cargosCentavos,
        inicioPeriodo:
          desglose?.fecha === fecha
            ? inicioSegunDesglose({ saldoCentavos, tasaAnual, cuotaCentavos, cargosCentavos, capitalCentavos: desglose.capitalCentavos, fecha })
            : undefined,
      }),
    );
    alCerrar();
  }

  return (
    <Hoja titulo={`Actualizar · ${p.nombre}`} alCerrar={alCerrar}>
      <div className="formulario">
        <p className="texto-tenue">Esto leí en la captura. Corrige lo que no coincida con la app del banco antes de guardar.</p>
        <DudasLectura
          dudas={[
            { nombre: 'Saldo', lectura: captura.saldo, formato: 'dinero', clave: 'saldo' },
            { nombre: 'Cuota', lectura: captura.cuota, formato: 'dinero', clave: 'cuota' },
            { nombre: 'Tasa', lectura: captura.tasaAnual, formato: 'tasa', clave: 'tasa' },
            { nombre: 'Próxima cuota', lectura: captura.proximaFecha, formato: 'fecha', clave: 'fecha' },
            { nombre: 'Seguros y otros cargos', lectura: captura.cargos, formato: 'dinero', clave: 'cargos' },
          ]}
          alElegir={(clave, v) => {
            if (clave === 'saldo') setSaldo(centavosATexto(v as number));
            if (clave === 'cuota') setCuota(centavosATexto(v as number));
            if (clave === 'tasa') setTasa(String(v));
            if (clave === 'fecha') setFecha(v as string);
            if (clave === 'cargos') setCargos(centavosATexto(v as number));
          }}
        />
        <label className="campo">
          <span>Saldo que debes (en la app: {formatearDinero(actual.saldoCentavos)})</span>
          <input type="text" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
        </label>
        <div className="fila-campos">
          <label className="campo campo-crece">
            <span>Cuota</span>
            <input type="text" inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} />
          </label>
          <label className="campo campo-crece">
            <span>Tasa anual (%)</span>
            <input type="text" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} />
          </label>
        </div>
        <label className="campo">
          <span>Seguros y otros cargos de la cuota</span>
          <input type="text" inputMode="decimal" value={cargos} placeholder="0.00" onChange={(e) => setCargos(e.target.value)} />
        </label>
        <label className="campo">
          <span>Próxima cuota{actual.proximaFecha ? ` (en la app: ${fechaCorta(actual.proximaFecha)})` : ''}</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {(captura.pendiente.valor ?? 0) > 0 && (
          <p className="aviso error">
            El banco muestra {formatearDinero(captura.pendiente.valor!)} pendientes de pago
            {captura.cuotasEnMora.valor ? ` (${captura.cuotasEnMora.valor} cuotas en mora)` : ''}.
          </p>
        )}
        <p className="ayuda sin-margen">Los pagos que ya registraste se conservan.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button type="button" className="boton primario" onClick={() => void guardar()}>
            Actualizar préstamo
          </button>
        </div>
      </div>
    </Hoja>
  );
}
