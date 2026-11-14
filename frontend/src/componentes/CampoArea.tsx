import { useId, type TextareaHTMLAttributes } from 'react';
import { FOCO_VISIBLE } from './estilos';

export interface CampoAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  etiqueta: string;
}

/** Texto de varias líneas con etiqueta asociada, con el mismo aspecto que Campo. */
export function CampoArea({ etiqueta, className = '', ...props }: CampoAreaProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">{etiqueta}</label>
      <textarea
        id={id}
        rows={2}
        className={`${FOCO_VISIBLE} min-h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-base text-white hover:border-slate-400 ${className}`}
        {...props}
      />
    </div>
  );
}
