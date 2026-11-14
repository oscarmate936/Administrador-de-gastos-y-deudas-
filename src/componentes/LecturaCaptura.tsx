import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatearDinero } from '../lib/dinero';
import { fechaCorta } from '../lib/fechas';
import { marcarSalidaPropia } from '../lib/nativo';
import type { Lectura } from '../lib/ocr/combinar';
import type { CapturaPrestamo } from '../lib/ocr/prestamo';

/** Botón que pide una imagen y la lee como captura de un préstamo. */
export function BotonCapturaPrestamo({
  texto,
  alLeer,
  abrirAlInicio,
}: {
  texto: ReactNode;
  alLeer: (c: CapturaPrestamo) => void;
  /** Pide la imagen en cuanto aparece, sin esperar a que se toque el botón. */
  abrirAlInicio?: boolean;
}) {
  const [estado, setEstado] = useState<{ avance: number; texto: string } | { error: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const yaAbierta = useRef(false);
  useEffect(() => {
    if (!abrirAlInicio || yaAbierta.current) return;
    yaAbierta.current = true;
    marcarSalidaPropia();
    entrada.current?.click();
  }, [abrirAlInicio]);

  /** Lee una o varias capturas del mismo préstamo y junta lo que encuentre en cada una. */
  async function leer(archivos: File[]) {
    const varias = archivos.length > 1;
    const texto = (i: number) => (varias ? `Leyendo la captura ${i + 1} de ${archivos.length}…` : 'Leyendo la captura…');
    setEstado({ avance: 0, texto: texto(0) });
    try {
      const [{ leerTextoDeImagen }, { leerCapturaConDosMotores, unirCapturas }] = await Promise.all([
        import('../lib/ocr/leer'),
        import('../lib/ocr/prestamo'),
      ]);
      const capturas: CapturaPrestamo[] = [];
      for (const [i, archivo] of archivos.entries()) {
        const [lstm, clasico] = await leerTextoDeImagen(archivo, (avance) => setEstado({ avance, texto: texto(i) }));
        capturas.push(leerCapturaConDosMotores(lstm, clasico));
      }
      const captura = unirCapturas(capturas);
      if (captura.saldo.valor === undefined && captura.cuota.valor === undefined) {
        setEstado({
          error: varias
            ? 'No encontré los datos del préstamo en estas capturas. Usa capturas donde se vean el saldo y la cuota.'
            : 'No encontré los datos del préstamo. Usa una captura donde se vean el saldo y la cuota.',
        });
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
        {estado && 'avance' in estado ? `${estado.texto} ${Math.round(estado.avance * 100)}%` : texto}
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const archivos = [...(e.target.files ?? [])].slice(0, 6);
          e.target.value = '';
          if (archivos.length > 0) void leer(archivos);
        }}
      />
      <span className="ayuda sin-margen">Puedes elegir varias capturas del mismo préstamo: la app junta los datos.</span>
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
