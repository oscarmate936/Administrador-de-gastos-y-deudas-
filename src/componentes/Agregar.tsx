import { useState } from 'react';
import type { Datos, Formulario } from '../datos';
import { estadoPrestamo, estadoTarjeta } from '../lib/deudas';
import { formatearDinero } from '../lib/dinero';
import { hoy } from '../lib/fechas';
import { Hoja } from './Hoja';
import { IconoFlecha } from './Iconos';
import { Insignia, Simbolo, type NombreSimbolo } from './Simbolo';

interface Props {
  datos: Datos;
  alCerrar: () => void;
  /** Abre un formulario (la hoja de Agregar se cierra antes). */
  alAbrir: (f: Formulario) => void;
  alImportarPdf: () => void;
  /** Abrir directo en la lista de deudas para pagar (atajo del ícono). */
  empezarEnPago?: boolean;
}

/** Todo lo que se puede agregar, desde el botón + del centro. */
export function Agregar({ datos, alCerrar, alAbrir, alImportarPdf, empezarEnPago }: Props) {
  const [elegirDeuda, setElegirDeuda] = useState(empezarEnPago ?? false);
  const fechaHoy = hoy();

  if (elegirDeuda) {
    const hayDeudas = datos.tarjetas.length + datos.prestamos.length > 0;
    return (
      <Hoja titulo="¿Qué vas a pagar?" alCerrar={alCerrar}>
        {hayDeudas ? (
          <ul className="lista">
            {datos.tarjetas.map((t) => {
              const e = estadoTarjeta(t, datos.movimientos, fechaHoy);
              return (
                <FilaAccion
                  key={t.id}
                  insignia={<Insignia color={t.color} simbolo="tarjeta" />}
                  titulo={t.nombre}
                  detalle={
                    e.pendienteCentavos <= 0
                      ? 'Al día'
                      : t.formaPago === 'minimo' && e.minimoPendienteCentavos > 0
                        ? `Mínimo: ${formatearDinero(e.minimoPendienteCentavos)}${e.minimoEsEstimado ? ' aprox.' : ''}`
                        : t.formaPago === 'recomendado' && e.recomendadoPendienteCentavos > 0
                          ? `Recomendado: ${formatearDinero(e.recomendadoPendienteCentavos)}`
                          : `De contado: ${formatearDinero(e.pendienteCentavos)}`
                  }
                  alTocar={() => alAbrir({ clase: 'pago', tarjetaId: t.id })}
                />
              );
            })}
            {datos.prestamos.map((p) => {
              const e = estadoPrestamo(p, datos.movimientos, fechaHoy);
              return (
                <FilaAccion
                  key={p.id}
                  insignia={<Insignia color="var(--primario)" simbolo="prestamo" />}
                  titulo={p.nombre}
                  detalle={e.proximaFecha ? `Cuota: ${formatearDinero(e.proximaCuotaCentavos)}` : 'Pagado por completo'}
                  alTocar={() => alAbrir({ clase: 'pago', prestamoId: p.id })}
                />
              );
            })}
          </ul>
        ) : (
          <p className="texto-tenue">Aún no tienes tarjetas ni préstamos. Agrégalos primero para registrar sus pagos.</p>
        )}
        <div className="acciones">
          <button type="button" className="boton" onClick={() => setElegirDeuda(false)}>
            Volver
          </button>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja titulo="Agregar" alCerrar={alCerrar}>
      <div className="agregar-principales">
        <BotonGrande simbolo="gasto" color="var(--texto)" texto="Gasto" alTocar={() => alAbrir({ clase: 'movimiento', tipo: 'gasto' })} />
        <BotonGrande simbolo="ingreso" color="var(--positivo)" texto="Ingreso" alTocar={() => alAbrir({ clase: 'movimiento', tipo: 'ingreso' })} />
        <BotonGrande simbolo="pago" color="var(--primario)" texto="Pago de deuda" alTocar={() => setElegirDeuda(true)} />
      </div>

      <h3 className="titulo-grupo">Leer de un documento</h3>
      <ul className="lista grupo-borde">
        <FilaAccion
          insignia={<Insignia color="var(--primario)" simbolo="camara" cuadrada />}
          titulo="Foto de un ticket"
          detalle="Llena el gasto con el total, la fecha y el comercio"
          alTocar={() => alAbrir({ clase: 'movimiento', tipo: 'gasto', leer: true })}
        />
        <FilaAccion
          insignia={<Insignia color="var(--primario)" simbolo="documento" cuadrada />}
          titulo="Estado de cuenta (PDF)"
          detalle="Tarjetas de Davivienda y Banco Agrícola"
          alTocar={alImportarPdf}
        />
        <FilaAccion
          insignia={<Insignia color="var(--primario)" simbolo="celular" cuadrada />}
          titulo="Captura de un préstamo"
          detalle="Desde la app del banco"
          alTocar={() => alAbrir({ clase: 'prestamo', leer: true })}
        />
      </ul>

      <h3 className="titulo-grupo">Nueva cuenta</h3>
      <div className="agregar-cuentas">
        <button type="button" className="boton" onClick={() => alAbrir({ clase: 'tarjeta' })}>
          <Simbolo nombre="tarjeta" tamano={18} /> Tarjeta
        </button>
        <button type="button" className="boton" onClick={() => alAbrir({ clase: 'prestamo' })}>
          <Simbolo nombre="prestamo" tamano={18} /> Préstamo
        </button>
      </div>
    </Hoja>
  );
}

function BotonGrande({ simbolo, color, texto, alTocar }: { simbolo: NombreSimbolo; color: string; texto: string; alTocar: () => void }) {
  return (
    <button type="button" className="boton-grande" onClick={alTocar}>
      <Insignia color={color} simbolo={simbolo} solida />
      <span>{texto}</span>
    </button>
  );
}

interface PropsFila {
  insignia: React.ReactNode;
  titulo: string;
  detalle: string;
  alTocar: () => void;
}

function FilaAccion({ insignia, titulo, detalle, alTocar }: PropsFila) {
  return (
    <li>
      <button type="button" className="fila" onClick={alTocar}>
        {insignia}
        <span className="fila-texto">
          <span className="fila-titulo">{titulo}</span>
          <span className="fila-detalle envolver">{detalle}</span>
        </span>
        <span className="opcion-flecha" aria-hidden="true">
          <IconoFlecha />
        </span>
      </button>
    </li>
  );
}
