import type { ButtonHTMLAttributes } from 'react';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';

type Variante = 'principal' | 'secundario';

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400',
  secundario: 'border border-slate-400 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-500',
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

export function Boton({ variante = 'principal', type = 'button', className = '', ...props }: BotonProps) {
  return (
    <button
      type={type}
      className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center justify-center rounded-xl px-5 text-base font-semibold disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}
