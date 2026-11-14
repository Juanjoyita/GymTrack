import type { ButtonHTMLAttributes } from 'react';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';
import { IconoCargando } from './Iconos';

type Variante = 'principal' | 'secundario';

// La acción principal es lima con texto negro; la secundaria, contorno claro sobre fondo oscuro.
const VARIANTES: Record<Variante, string> = {
  principal: 'bg-lime-300 font-bold text-slate-950 hover:bg-lime-200 disabled:bg-lime-300/60',
  secundario: 'border border-slate-600 bg-transparent text-white hover:border-slate-400 hover:bg-white/5 disabled:text-slate-400',
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /** Muestra el indicador de actividad, bloquea nuevos envíos y lo anuncia con aria-busy. */
  cargando?: boolean;
}

export function Boton({ variante = 'principal', type = 'button', className = '', cargando = false, disabled, children, ...props }: BotonProps) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed motion-safe:active:scale-[0.98] ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {cargando && <IconoCargando className="size-5 motion-safe:animate-spin" />}
      {children}
    </button>
  );
}
