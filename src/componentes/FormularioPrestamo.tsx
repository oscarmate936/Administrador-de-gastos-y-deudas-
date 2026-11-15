import { useState, type FormEvent } from 'react';
import { BANCOS } from '../datos';
import { db, nuevoId, type Movimiento, type Prestamo } from '../db';
import { estadoPrestamo, inicioSegunDesglose, proyectar, sumarMeses, textoDuracion } from '../lib/deudas';
import { centavosATexto, formatearDinero, textoACentavos, textoATasa } from '../lib/dinero';
import { aDate, aFechaTexto, esFechaValida, fechaCorta, hoy, mesCorto } from '../lib/fechas';
import { Hoja } from './Hoja';
import { Simbolo } from './Simbolo';
import { BotonCapturaPrestamo, DudasLectura } from './LecturaCaptura';
import { desgloseDe, type CapturaPrestamo } from '../lib/ocr/prestamo';

interface Props {
  prestamo?: Prestamo;
  /** Los pagos ya registrados, para estimar al editar un préstamo con pagos. */
  movimientos?: Movimiento[];
  alCerrar: () => void;
  /** Pide la captura de la app del banco en cuanto se abre. */
  leerAlAbrir?: boolean;
}

/** Vacío cuenta como 0 (tasa desconocida). */
const leerTasa = (texto: string) => (texto.trim() === '' ? 0 : textoATasa(texto));

export function FormularioPrestamo({ prestamo, movimientos = [], alCerrar, leerAlAbrir }: Props) {
  const [nombre, setNombre] = useState(prestamo?.nombre ?? '');
  const [acreedor, setAcreedor] = useState(prestamo?.acreedor ?? BANCOS[1]);
  const [original, setOriginal] = useState(
    prestamo?.montoOriginalCentavos !== undefined ? centavosATexto(prestamo.montoOriginalCentavos) : '',
  );
  const [saldo, setSaldo] = useState(prestamo ? centavosATexto(prestamo.saldoInicialCentavos) : '');
  const [tasa, setTasa] = useState(prestamo ? String(prestamo.tasaAnual) : '');
  const [cuota, setCuota] = useState(prestamo ? centavosATexto(prestamo.cuotaCentavos) : '');
  const [cargos, setCargos] = useState(prestamo?.cargosCentavos ? centavosATexto(prestamo.cargosCentavos) : '');
  const [primeraCuota, setPrimeraCuota] = useState(prestamo?.primeraCuota ?? '');
  const [error, setError] = useState('');
  // Fijo mientras el formulario está abierto: guardar dos veces seguidas no crea un duplicado.
  const [idNuevo] = useState(nuevoId);
  const [captura, setCaptura] = useState<CapturaPrestamo | null>(null);

  function aplicarCaptura(c: CapturaPrestamo) {
    setCaptura(c);
    setError('');
    if (c.nombre && !nombre.trim()) setNombre(c.nombre);
    if (c.saldo.valor !== undefined) setSaldo(centavosATexto(c.saldo.valor));
    if (c.cuota.valor !== undefined) setCuota(centavosATexto(c.cuota.valor));
    if (c.tasaAnual.valor !== undefined) setTasa(String(c.tasaAnual.valor));
    if (c.proximaFecha.valor) setPrimeraCuota(c.proximaFecha.valor);
    if (c.montoOriginal.valor !== undefined) setOriginal(centavosATexto(c.montoOriginal.valor));
    if (c.cargos.valor !== undefined) setCargos(centavosATexto(c.cargos.valor));
  }

  const cambiar = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setError('');
  };

  const saldoCentavos = textoACentavos(saldo);
  const cuotaCentavos = textoACentavos(cuota);
  const tasaAnual = leerTasa(tasa);
  const cargosCentavos = cargos.trim() === '' ? 0 : textoACentavos(cargos);
  const desglose = captura ? desgloseDe(captura) : undefined;
  // Con el desglose del banco se sabe desde qué día corre el interés de la primera cuota.
  const inicioPeriodo =
    desglose && desglose.fecha === primeraCuota && saldoCentavos && cuotaCentavos && tasaAnual
      ? inicioSegunDesglose({ saldoCentavos, tasaAnual, cuotaCentavos, cargosCentavos: cargosCentavos ?? 0, capitalCentavos: desglose.capitalCentavos, fecha: primeraCuota })
      : prestamo?.primeraCuota === primeraCuota ? prestamo?.inicioPeriodo : undefined;
  const proyeccion =
    saldoCentavos && cuotaCentavos && tasaAnual !== null && cargosCentavos !== null
      ? proyectar(
          saldoCentavos,
          tasaAnual,
          cuotaCentavos,
          cargosCentavos / saldoCentavos,
          esFechaValida(primeraCuota)
            ? { desde: inicioPeriodo ?? sumarMeses(primeraCuota, -1), primera: primeraCuota, ancla: aDate(primeraCuota).getDate() }
            : undefined,
        )
      : undefined;

  // Al editar sin cambiar el seguro, se conserva el saldo con que lo midió el banco.
  const cargosBase =
    cargosCentavos && prestamo && cargosCentavos === prestamo.cargosCentavos ? (prestamo.cargosBaseCentavos ?? saldoCentavos ?? undefined) : (saldoCentavos ?? undefined);
  // Al editar un préstamo con pagos, la estimación es la de hoy (saldo y cuota pendientes).
  const pagosDelPrestamo = prestamo ? movimientos.filter((m) => m.tipo === 'pago' && m.prestamoId === prestamo.id) : [];
  const estadoHoy =
    prestamo && pagosDelPrestamo.length > 0 && saldoCentavos && cuotaCentavos && tasaAnual !== null && cargosCentavos !== null && esFechaValida(primeraCuota)
      ? estadoPrestamo(
          { ...prestamo, saldoInicialCentavos: saldoCentavos, cuotaCentavos, tasaAnual, cargosCentavos: cargosCentavos || undefined, cargosBaseCentavos: cargosBase, primeraCuota, inicioPeriodo },
          pagosDelPrestamo,
          hoy(),
        )
      : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const originalCentavos = original.trim() === '' ? undefined : textoACentavos(original);
    if (!nombre.trim()) return setError('Escribe un nombre para el préstamo, por ejemplo "Préstamo personal".');
    if (!saldoCentavos) return setError('Escribe cuánto debes todavía.');
    if (tasaAnual === null) return setError('La tasa de interés no es válida. Escribe un número, por ejemplo 18.5');
    if (!cuotaCentavos) return setError('Escribe el monto de la cuota mensual.');
    if (cargosCentavos === null) return setError('Los seguros y otros cargos no son un monto válido.');
    if (cargosCentavos >= cuotaCentavos) return setError('Los seguros y otros cargos deben ser menores que la cuota.');
    if (!esFechaValida(primeraCuota)) return setError('Elige la fecha de tu próxima cuota.');
    if (originalCentavos === null) return setError('El monto original no es un monto válido.');

    await db.prestamos.put({
      id: prestamo?.id ?? idNuevo,
      nombre: nombre.trim(),
      acreedor: acreedor.trim(),
      montoOriginalCentavos: originalCentavos,
      saldoInicialCentavos: saldoCentavos,
      tasaAnual,
      cuotaCentavos,
      cargosCentavos: cargosCentavos || undefined,
      cargosBaseCentavos: cargosCentavos ? cargosBase : undefined,
      // Con una captura, los datos son los del banco de hoy.
      actualizadoEn: captura ? hoy() : prestamo?.actualizadoEn,
      inicioPeriodo,
      desgloseCuota: desglose?.fecha === primeraCuota ? desglose : prestamo?.desgloseCuota,
      primeraCuota,
      creadoEn: prestamo?.creadoEn ?? Date.now(),
    });
    alCerrar();
  }

  async function eliminar() {
    if (!prestamo) return;
    const mensaje = `¿Eliminar el préstamo "${prestamo.nombre}"? Sus pagos se conservan en Movimientos.`;
    if (!window.confirm(mensaje)) return;
    await db.prestamos.delete(prestamo.id);
    alCerrar();
  }

  const otro = !BANCOS.includes(acreedor);
  const desde = prestamo ? ` (al registrarlo, ${fechaCorta(aFechaTexto(new Date(prestamo.creadoEn)))})` : '';

  return (
    <Hoja titulo={prestamo ? 'Editar préstamo' : 'Nuevo préstamo'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        {!prestamo && (
          <>
            <BotonCapturaPrestamo
              texto={
                <>
                  <Simbolo nombre="camara" tamano={18} /> Llenar con una captura de la app del banco
                </>
              }
              alLeer={aplicarCaptura}
              abrirAlInicio={leerAlAbrir}
            />
            {captura && (
              <p className="aviso" role="status">
                Llené los datos con la captura. Revísalos, elige con quién es el préstamo y guarda.
              </p>
            )}
            {captura && (
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
                  if (clave === 'fecha') setPrimeraCuota(v as string);
                  if (clave === 'cargos') setCargos(centavosATexto(v as number));
                }}
              />
            )}
          </>
        )}
        <label className="campo">
          <span>Nombre</span>
          <input type="text" value={nombre} maxLength={30} placeholder="Ej. Préstamo personal" autoFocus={!prestamo} onChange={cambiar(setNombre)} />
        </label>

        <fieldset className="campo">
          <legend>¿Con quién es?</legend>
          <div className="chips">
            {BANCOS.map((b) => (
              <button key={b} type="button" className="chip" aria-pressed={acreedor === b} onClick={() => setAcreedor(b)}>
                {b}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={otro} onClick={() => setAcreedor('')}>
              Otro
            </button>
          </div>
          {otro && (
            <input type="text" value={acreedor} maxLength={30} placeholder="Banco, cooperativa o persona" aria-label="Con quién es el préstamo" onChange={cambiar(setAcreedor)} />
          )}
        </fieldset>

        <label className="campo">
          <span>{prestamo ? `Saldo que debías${desde}` : 'Saldo que debes hoy'}</span>
          <input type="text" inputMode="decimal" value={saldo} placeholder="0.00" onChange={cambiar(setSaldo)} />
          <span className="ayuda sin-margen">El capital pendiente que aparece en tu estado de cuenta o en tu banca en línea.</span>
        </label>

        <div className="fila-campos">
          <label className="campo campo-crece">
            <span>Cuota mensual</span>
            <input type="text" inputMode="decimal" value={cuota} placeholder="0.00" onChange={cambiar(setCuota)} />
          </label>
          <label className="campo campo-crece">
            <span>Tasa anual (%)</span>
            <input type="text" inputMode="decimal" value={tasa} placeholder="Ej. 18.5" onChange={cambiar(setTasa)} />
          </label>
        </div>
        <p className="ayuda sin-margen">La tasa está en tu contrato. Si no la sabes, déjala vacía: el tiempo restante será aproximado.</p>

        <label className="campo">
          <span>Seguros y otros cargos de la cuota (opcional)</span>
          <input type="text" inputMode="decimal" value={cargos} placeholder="0.00" onChange={cambiar(setCargos)} />
          <span className="ayuda sin-margen">
            La parte fija de cada cuota que no es capital ni intereses, por ejemplo «Otras deducciones» o seguros. No baja lo
            que debes.
          </span>
        </label>

        <label className="campo">
          <span>{prestamo ? 'Primera cuota después de registrarlo' : 'Fecha de tu próxima cuota'}</span>
          <input type="date" value={primeraCuota} max="2099-12-31" onChange={cambiar(setPrimeraCuota)} />
          <span className="ayuda sin-margen">Las siguientes cuotas caen el mismo día de cada mes.</span>
        </label>

        <label className="campo">
          <span>Monto original del préstamo (opcional)</span>
          <input type="text" inputMode="decimal" value={original} placeholder="0.00" onChange={cambiar(setOriginal)} />
          <span className="ayuda sin-margen">Sirve para mostrar cuánto llevas pagado.</span>
        </label>

        {estadoHoy ? (
          estadoHoy.proyeccion && estadoHoy.fechaFin ? (
            <p className="aviso">
              Hoy debes {formatearDinero(estadoHoy.saldoCentavos)}: te faltan {textoDuracion(estadoHoy.proyeccion.meses)} (
              {estadoHoy.proyeccion.meses} {estadoHoy.proyeccion.meses === 1 ? 'cuota' : 'cuotas'}) y terminas en {mesCorto(estadoHoy.fechaFin)}.
            </p>
          ) : estadoHoy.saldoCentavos > 0 ? (
            <p className="aviso error">La cuota no alcanza para cubrir los intereses: con estos datos la deuda nunca baja.</p>
          ) : null
        ) : proyeccion === null ? (
          <p className="aviso error">La cuota no alcanza para cubrir los intereses del mes: con estos datos la deuda nunca baja.</p>
        ) : null}
        {!estadoHoy && proyeccion && esFechaValida(primeraCuota) && (
          <p className="aviso">
            Con estos datos te faltan {textoDuracion(proyeccion.meses)} ({proyeccion.meses}{' '}
            {proyeccion.meses === 1 ? 'cuota' : 'cuotas'}): terminas en {mesCorto(sumarMeses(primeraCuota, proyeccion.meses - 1))}
            {proyeccion.interesesCentavos > 0 && ` y pagarás cerca de ${formatearDinero(proyeccion.interesesCentavos)} en intereses`}.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          {prestamo && (
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
