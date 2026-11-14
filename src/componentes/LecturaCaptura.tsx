import { useRef, useState } from 'react';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';
import { marcarSalidaPropia } from '../lib/nativo';
import type { Lectura } from '../lib/ocr/combinar';
import type { CapturaPrestamo } from '../lib/ocr/prestamo';

/** Botón que pide una imagen y la lee como captura de un préstamo. */
export function BotonCapturaPrestamo({ texto, alLeer }: { texto: string; alLeer: (c: CapturaPrestamo) => void }) {
  const [estado, setEstado] = useState<{ avance: number } | { error: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function leer(archivo: File) {
    setEstado({ avance: 0 });
    try {
      const [{ leerTextoDeImagen }, { leerCapturaConDosMotores }] = await Promise.all([
        import('../lib/ocr/leer'),
        import('../lib/ocr/prestamo'),
      ]);
      const [lstm, clasico] = await leerTextoDeImagen(archivo, (avance) => setEstado({ avance }));
      const captura = leerCapturaConDosMotores(lstm, clasico);
      if (captura.saldo.valor === undefined && captura.cuota.valor === undefined) {
        setEstado({ error: 'No encontré los datos del préstamo. Usa una captura donde se vean el saldo y la cuota.' });
        return;
      }
      setEstado(null);
      alLeer(captura);
    } catch {
      setEstado({ error: 'No pude leer la imagen.' });
    }
  }

  return (
    <>
      <button
        type="button"
        className="boton boton-foto"
        disabled={estado !== null && 'avance' in estado}
        onClick={() => {
          marcarSalidaPropia();
          entrada.current?.click();
        }}
      >
        {estado && 'avance' in estado ? `Leyendo la captura… ${Math.round(estado.avance * 100)}%` : texto}
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) void leer(archivo);
        }}
      />
      {estado && 'error' in estado && (
        <p className="aviso error" role="alert">
          {estado.error}
        </p>
      )}
    </>
  );
}

type Formato = 'dinero' | 'tasa' | 'fecha';
const mostrar = (v: number | string, f: Formato) =>
  f === 'dinero' ? formatearDinero(v as number) : f === 'tasa' ? `${v}%` : fechaCorta(v as string);

/** Aviso con las lecturas dudosas y botones para elegir la otra. */
export function DudasLectura({
  dudas,
  alElegir,
}: {
  dudas: Array<{ nombre: string; lectura: Lectura<number | string>; formato: Formato; clave: string }>;
  alElegir: (clave: string, valor: number | string) => void;
}) {
  const visibles = dudas.filter((d) => d.lectura.dudoso && d.lectura.alternativa !== undefined);
  if (visibles.length === 0) return null;
  return (
    <div className="aviso error dudas-lectura" role="status">
      <strong>Revisa {visibles.length === 1 ? 'este dato' : 'estos datos'}: la imagen se leyó de dos formas.</strong>
      {visibles.map((d) => (
        <span key={d.clave} className="duda">
          {d.nombre}: puse {mostrar(d.lectura.valor!, d.formato)}.{' '}
          <button type="button" className="enlace" onClick={() => alElegir(d.clave, d.lectura.alternativa!)}>
            Usar {mostrar(d.lectura.alternativa!, d.formato)}
          </button>
        </span>
      ))}
    </div>
  );
}
