import type { ReactNode } from 'react';

// Iconos decorativos: siempre acompañan a un texto visible, así que se ocultan a los lectores de pantalla.
function Icono({ children, className = 'size-6' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

type PropsIcono = { className?: string };

export const IconoMancuerna = (p: PropsIcono) => (
  <Icono {...p}><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></Icono>
);

export const IconoHistorial = (p: PropsIcono) => (
  <Icono {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Icono>
);

export const IconoProgreso = (p: PropsIcono) => (
  <Icono {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></Icono>
);

export const IconoRutinas = (p: PropsIcono) => (
  <Icono {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Icono>
);

export const IconoCuenta = (p: PropsIcono) => (
  <Icono {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icono>
);

export const IconoCheck = (p: PropsIcono) => (
  <Icono {...p}><path d="m5 12 5 5 9-10" /></Icono>
);

export const IconoReloj = (p: PropsIcono) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icono>
);

export const IconoBrujula = (p: PropsIcono) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></Icono>
);
