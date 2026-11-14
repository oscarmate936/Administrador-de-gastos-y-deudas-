import type { ReactNode } from 'react';

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconoInicio = () => (
  <Icono>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
  </Icono>
);

export const IconoLista = () => (
  <Icono>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </Icono>
);

export const IconoAjustes = () => (
  <Icono>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icono>
);

export const IconoMas = () => (
  <Icono>
    <path d="M12 5v14M5 12h14" />
  </Icono>
);

export const IconoAnterior = () => (
  <Icono>
    <path d="m15 6-6 6 6 6" />
  </Icono>
);

export const IconoSiguiente = () => (
  <Icono>
    <path d="m9 6 6 6-6 6" />
  </Icono>
);

export const IconoCerrar = () => (
  <Icono>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icono>
);

export const IconoDeudas = () => (
  <Icono>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h4" />
  </Icono>
);

export const IconoHuella = () => (
  <Icono>
    <path d="M12 11v3a8 8 0 0 1-1.3 4.4" />
    <path d="M8.5 8.8A4 4 0 0 1 16 11v1.5a11 11 0 0 1-.6 3.6" />
    <path d="M5.2 15.5A10 10 0 0 1 5 13v-2a7 7 0 0 1 11.6-5.3" />
    <path d="M19 9.5c.3.5.5 1 .6 1.5" />
    <path d="M8 13v.5a12 12 0 0 1-1 4.8" />
  </Icono>
);

export const IconoBorrar = () => (
  <Icono>
    <path d="M9 6h11v12H9l-5-6z" />
    <path d="m12.5 9.5 5 5M17.5 9.5l-5 5" />
  </Icono>
);

export const IconoCandado = () => (
  <Icono>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icono>
);

export const IconoFlecha = () => (
  <Icono>
    <path d="m9 6 6 6-6 6" />
  </Icono>
);
