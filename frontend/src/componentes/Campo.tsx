import { useId, type InputHTMLAttributes } from 'react';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';
import { IconoAlerta } from './Iconos';

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string;
  /** Mensaje de error mostrado junto al campo (FR-027). */
  error?: string;
  /** Indicación permanente bajo el campo, por ejemplo una regla de longitud. */
  ayuda?: string;
}

export function Campo({ etiqueta, error, ayuda, className = '', ...props }: CampoProps) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  // Con error visible, la ayuda se oculta: el mensaje de error ya indica cómo corregirlo.
  const mostrarAyuda = Boolean(ayuda) && !error;
  const descripcion = error ? idError : mostrarAyuda ? idAyuda : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion}
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} h-12 w-full rounded-xl border bg-slate-900 px-4 text-base text-white transition-colors hover:border-slate-400 ${error ? 'border-red-400' : 'border-slate-600'} ${className}`}
        {...props}
      />
      {error && (
        <p id={idError} className="flex items-start gap-1.5 text-sm font-medium text-red-300">
          <IconoAlerta className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {mostrarAyuda && (
        <p id={idAyuda} className="text-sm text-slate-400">
          {ayuda}
        </p>
      )}
    </div>
  );
}
