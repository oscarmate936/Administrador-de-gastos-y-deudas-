import { useState, type FormEvent } from 'react';
import { BANCOS, COLORES } from '../datos';
import { db, nuevoId, type Tarjeta } from '../db';
import { diasDePlazo, type FormaPago } from '../lib/deudas';
import { AYUDA_FORMA, SegmentosForma } from './FormaDePago';
import { centavosATexto, textoACentavos, textoATasa } from '../lib/dinero';
import { fechaCorta, hoy, sumarDias } from '../lib/fechas';
import { Hoja } from './Hoja';

interface Props {
  tarjeta?: Tarjeta;
  /** Cuántas tarjetas hay ya, para proponer un color distinto a cada una. */
  cantidad: number;
  alCerrar: () => void;
}

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Menos días que estos entre el corte y el último día de pago pide confirmar. */
const PLAZO_MINIMO = 10;

/** Campo vacío = 0; texto inválido = null. */
const montoOpcional = (texto: string) => (texto.trim() === '' ? 0 : textoACentavos(texto));

export function FormularioTarjeta({ tarjeta, cantidad, alCerrar }: Props) {
  const [nombre, setNombre] = useState(tarjeta?.nombre ?? '');
  const [banco, setBanco] = useState(tarjeta?.banco ?? BANCOS[0]);
  const [limite, setLimite] = useState(tarjeta ? centavosATexto(tarjeta.limiteCentavos) : '');
  const [diaCorte, setDiaCorte] = useState(String(tarjeta?.diaCorte ?? ''));
  const [diaPago, setDiaPago] = useState(String(tarjeta?.diaPago ?? ''));
  const [saldo, setSaldo] = useState(tarjeta ? centavosATexto(tarjeta.saldoInicialCentavos) : '');
  const [pendiente, setPendiente] = useState(tarjeta ? centavosATexto(tarjeta.pendienteInicialCentavos) : '');
  const [tasa, setTasa] = useState(tarjeta?.tasaAnual !== undefined ? String(tarjeta.tasaAnual) : '');
  const [color, setColor] = useState(tarjeta?.color ?? COLORES[(2 + cantidad * 3) % COLORES.length]);
  const [formaPago, setFormaPago] = useState<FormaPago>(tarjeta?.formaPago ?? 'total');
  const [error, setError] = useState('');
  // Fijo mientras el formulario está abierto: guardar dos veces seguidas no crea un duplicado.
  const [idNuevo] = useState(nuevoId);

  const cambiar = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setError('');
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const limiteCentavos = textoACentavos(limite);
    const saldoCentavos = montoOpcional(saldo);
    const pendienteCentavos = montoOpcional(pendiente);
    if (!nombre.trim()) return setError('Escribe un nombre para la tarjeta, por ejemplo "Visa Clásica".');
    if (!limiteCentavos) return setError('Escribe el límite de crédito de la tarjeta.');
    if (!diaCorte) return setError('Elige el día de corte.');
    if (!diaPago) return setError('Elige el último día de pago.');
    if (saldoCentavos === null) return setError('La deuda actual no es un monto válido.');
    if (pendienteCentavos === null) return setError('El pago de contado pendiente no es un monto válido.');
    if (pendienteCentavos > saldoCentavos) return setError('Lo pendiente del estado de cuenta no puede ser mayor que la deuda total.');
    // Los bancos dan de 15 a 25 días entre el corte y el último día de pago; menos suele ser un día mal escrito.
    const dias = diasDePlazo(Number(diaCorte), Number(diaPago));
    const cambioDias = !tarjeta || tarjeta.diaCorte !== Number(diaCorte) || tarjeta.diaPago !== Number(diaPago);
    if (dias < PLAZO_MINIMO && cambioDias) {
      const texto = dias === 1 ? 'solo 1 día' : `solo ${dias} días`;
      const sigue = window.confirm(
        `Entre el corte (día ${diaCorte}) y el último día de pago (día ${diaPago}) hay ${texto}. Lo normal son de 15 a 25. ¿Los dos días están bien?`,
      );
      if (!sigue) return setError('Revisa el día de corte y el último día de pago en tu estado de cuenta.');
    }
    const tasaAnual = tasa.trim() === '' ? undefined : textoATasa(tasa);
    if (tasaAnual === null) return setError('La tasa de interés no es válida. Escribe un número, por ejemplo 39.9');

    await db.tarjetas.put({
      id: tarjeta?.id ?? idNuevo,
      nombre: nombre.trim(),
      banco: banco.trim(),
      limiteCentavos,
      diaCorte: Number(diaCorte),
      diaPago: Number(diaPago),
      saldoInicialCentavos: saldoCentavos,
      pendienteInicialCentavos: pendienteCentavos,
      // Lo que se registre con fecha de hoy en adelante suma o resta a estos saldos.
      // Editar no cambia esa fecha.
      fechaSaldo: tarjeta?.fechaSaldo ?? sumarDias(hoy(), -1),
      color,
      creadoEn: tarjeta?.creadoEn ?? Date.now(),
      ultimos4: tarjeta?.ultimos4,
      tasaAnual,
      formaPago,
      ultimoEstado: tarjeta?.ultimoEstado,
    });
    alCerrar();
  }

  async function eliminar() {
    if (!tarjeta) return;
    const mensaje = `¿Eliminar la tarjeta "${tarjeta.nombre}"? Sus compras y pagos se conservan en Movimientos.`;
    if (!window.confirm(mensaje)) return;
    // Los gastos que se repiten con esta tarjeta no pueden seguir usándola.
    const repiten = await db.recurrentes.filter((r) => r.tarjetaId === tarjeta.id).toArray();
    const aEfectivo =
      repiten.length > 0 &&
      window.confirm(
        `${repiten.length === 1 ? 'Un gasto que se repite usa' : `${repiten.length} gastos que se repiten usan`} esta tarjeta. ` +
          '¿Pasarlos a efectivo? Si eliges Cancelar, se pausan.',
      );
    await db.transaction('rw', db.tarjetas, db.recurrentes, async () => {
      await db.tarjetas.delete(tarjeta.id);
      for (const r of repiten) {
        await db.recurrentes.update(r.id, aEfectivo ? { tarjetaId: undefined } : { activo: false });
      }
    });
    alCerrar();
  }

  const otroBanco = !BANCOS.includes(banco);
  const desde = tarjeta ? ` al ${fechaCorta(tarjeta.fechaSaldo)}` : '';

  return (
    <Hoja titulo={tarjeta ? 'Editar tarjeta' : 'Nueva tarjeta de crédito'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="formulario" noValidate>
        <label className="campo">
          <span>Nombre</span>
          <input type="text" value={nombre} maxLength={30} placeholder="Ej. Visa Clásica" autoFocus={!tarjeta} onChange={cambiar(setNombre)} />
        </label>

        <fieldset className="campo">
          <legend>Banco</legend>
          <div className="chips">
            {BANCOS.map((b) => (
              <button key={b} type="button" className="chip" aria-pressed={banco === b} onClick={() => setBanco(b)}>
                {b}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={otroBanco} onClick={() => setBanco('')}>
              Otro
            </button>
          </div>
          {otroBanco && (
            <input type="text" value={banco} maxLength={30} placeholder="Nombre del banco" aria-label="Nombre del banco" onChange={cambiar(setBanco)} />
          )}
        </fieldset>

        <label className="campo">
          <span>Límite de crédito</span>
          <input type="text" inputMode="decimal" value={limite} placeholder="0.00" onChange={cambiar(setLimite)} />
        </label>

        <div className="fila-campos">
          <label className="campo campo-crece">
            <span>Día de corte</span>
            <select value={diaCorte} onChange={cambiar(setDiaCorte)}>
              <option value="">Elegir</option>
              {DIAS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="campo campo-crece">
            <span>Último día de pago</span>
            <select value={diaPago} onChange={cambiar(setDiaPago)}>
              <option value="">Elegir</option>
              {DIAS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="ayuda sin-margen">Los dos aparecen en tu estado de cuenta. Si un mes no tiene ese día, se usa su último día.</p>

        <label className="campo">
          <span>{tarjeta ? `Deuda total${desde}` : 'Deuda total hoy'}</span>
          <input type="text" inputMode="decimal" value={saldo} placeholder="0.00" onChange={cambiar(setSaldo)} />
          <span className="ayuda sin-margen">
            {tarjeta
              ? 'Las compras y pagos con fecha posterior se suman o restan a esta deuda.'
              : 'El saldo actual que ves en tu banca en línea. Lo que registres con fecha de hoy en adelante se suma o resta.'}
          </span>
        </label>

        <label className="campo">
          <span>{tarjeta ? `Pago de contado pendiente${desde}` : 'Pago de contado pendiente'}</span>
          <input type="text" inputMode="decimal" value={pendiente} placeholder="0.00" onChange={cambiar(setPendiente)} />
          <span className="ayuda sin-margen">
            Lo que te falta pagar de tu último estado de cuenta para no generar intereses. Si ya lo pagaste, déjalo en 0.
          </span>
        </label>

        <label className="campo">
          <span>Tasa de interés anual (%)</span>
          <input type="text" inputMode="decimal" value={tasa} placeholder="Ej. 39.9" onChange={cambiar(setTasa)} />
          <span className="ayuda sin-margen">
            Opcional. Viene en tu estado de cuenta ("tasa de interés anual" o "interés normal"). Sirve para el plan de pago.
          </span>
        </label>

        <fieldset className="campo">
          <legend>Cada mes pago</legend>
          <SegmentosForma valor={formaPago} alCambiar={setFormaPago} etiqueta="Cómo pagas esta tarjeta" />
          <span className="ayuda sin-margen">{AYUDA_FORMA[formaPago]}</span>
        </fieldset>

        <fieldset className="campo">
          <legend>Color</legend>
          <div className="colores">
            {COLORES.map((c) => (
              <button key={c} type="button" className="color" style={{ background: c }} aria-pressed={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          {tarjeta && (
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
