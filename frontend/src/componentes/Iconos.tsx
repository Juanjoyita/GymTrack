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

export const IconoTrofeo = (p: PropsIcono) => (
  <Icono {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Icono>
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

export const IconoAlerta = (p: PropsIcono) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.5h.01" /></Icono>
);

export const IconoSalir = (p: PropsIcono) => (
  <Icono {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="m10 17 5-5-5-5M15 12H4" /></Icono>
);

/** Indicador de actividad; gira solo si el usuario no pidió reducir el movimiento. */
export const IconoCargando = (p: PropsIcono) => (
  <Icono {...p}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Icono>
);

export const IconoMas = (p: PropsIcono) => (
  <Icono {...p}><path d="M12 5v14M5 12h14" /></Icono>
);

export const IconoCerrar = (p: PropsIcono) => (
  <Icono {...p}><path d="M6 6l12 12M18 6 6 18" /></Icono>
);

export const IconoBuscar = (p: PropsIcono) => (
  <Icono {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icono>
);

export const IconoLapiz = (p: PropsIcono) => (
  <Icono {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Icono>
);

export const IconoPapelera = (p: PropsIcono) => (
  <Icono {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icono>
);
