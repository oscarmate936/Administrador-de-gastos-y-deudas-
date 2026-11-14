import type { ReactNode } from 'react';
import type { Categoria } from '../db';

// Íconos de línea de la app. Siempre del mismo grosor y tamaño, y dentro de una
// insignia de color cuando acompañan a una fila.

const TRAZOS = {
  gasto: <path d="M12 5v14M6 13l6 6 6-6" />,
  ingreso: <path d="M12 19V5M6 11l6-6 6 6" />,
  pago: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M8 12l2.5 2.5L16 9" />
    </>
  ),
  tarjeta: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  prestamo: <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  camara: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  documento: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  celular: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  comida: <path d="M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17.5 3C16 4.5 15 7 15 10.5h2.5V21" />,
  super: (
    <>
      <path d="M4 4h2l2.4 11h10.2L21 7H7" />
      <circle cx="10" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  transporte: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="2.5" />
      <path d="M5 11h14M8 20.5v-3M16 20.5v-3M8.5 14.5h.01M15.5 14.5h.01" />
    </>
  ),
  casa: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5" />,
  servicios: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  salud: <path d="M20.8 8.6a5 5 0 0 0-8.8-3.2 5 5 0 0 0-8.8 3.2c0 5.4 8.8 11.4 8.8 11.4s8.8-6 8.8-11.4zM8 11.5h2.5l1.5-2.5 2 5 1.5-2.5H17" />,
  ocio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" />
    </>
  ),
  otros: <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9" />,
  intereses: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </>
  ),
  repetir: <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7M4 4v4.7h4.7" />,
  campana: <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" />,
  candado: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  subir: <path d="M12 15V3M7 8l5-5 5 5M4 15v5h16v-5" />,
  bajar: <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  tabla: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M10 4v16" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  luna: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  objetivo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  engranaje: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  analisis: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  chispa: <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />,
  alerta: <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  dinero: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </>
  ),
  lapiz: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  listo: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} satisfies Record<string, ReactNode>;

export type NombreSimbolo = keyof typeof TRAZOS;

export function Simbolo({ nombre, tamano = 20 }: { nombre: NombreSimbolo; tamano?: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}

/** Ícono de las categorías que trae la app; las creadas por ti usan su emoji. */
const DE_CATEGORIA: Record<string, NombreSimbolo> = {
  comida: 'comida',
  super: 'super',
  transporte: 'transporte',
  casa: 'casa',
  servicios: 'servicios',
  salud: 'salud',
  ocio: 'ocio',
  otros: 'otros',
  intereses: 'intereses',
};

interface PropsInsignia {
  /** Color de la insignia (cualquier color CSS). */
  color: string;
  simbolo?: NombreSimbolo;
  emoji?: string;
  /** "solida": fondo de color e ícono blanco. */
  solida?: boolean;
  cuadrada?: boolean;
}

/** Círculo de color con un ícono, al inicio de cada fila. */
export function Insignia({ color, simbolo, emoji, solida, cuadrada }: PropsInsignia) {
  const clase = ['insignia', solida && 'solida', cuadrada && 'cuadrada'].filter(Boolean).join(' ');
  return (
    <span className={clase} style={{ '--color-insignia': color } as React.CSSProperties} aria-hidden="true">
      {simbolo ? <Simbolo nombre={simbolo} /> : <span className="insignia-emoji">{emoji}</span>}
    </span>
  );
}

export function InsigniaCategoria({ categoria }: { categoria?: Categoria }) {
  if (!categoria) return <Insignia color="var(--tenue)" simbolo="otros" />;
  const simbolo = DE_CATEGORIA[categoria.id];
  return simbolo ? <Insignia color={categoria.color} simbolo={simbolo} /> : <Insignia color={categoria.color} emoji={categoria.emoji} />;
}

/** Ícono pequeño de una categoría, para chips y listas de opciones. */
export function MarcaCategoria({ categoria }: { categoria: Categoria }) {
  const simbolo = DE_CATEGORIA[categoria.id];
  return (
    <span className="marca-categoria" style={{ color: categoria.color }} aria-hidden="true">
      {simbolo ? <Simbolo nombre={simbolo} tamano={16} /> : categoria.emoji}
    </span>
  );
}
