import { useId, type InputHTMLAttributes } from 'react';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string;
  /** Mensaje de error mostrado junto al campo (FR-027). */
  error?: string;
}

export function Campo({ etiqueta, error, className = '', ...props }: CampoProps) {
  const id = useId();
  const idError = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} w-full rounded-xl border bg-white px-3 text-base text-slate-900 ${error ? 'border-red-700' : 'border-slate-500'} ${className}`}
        {...props}
      />
      {error && (
        <p id={idError} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
