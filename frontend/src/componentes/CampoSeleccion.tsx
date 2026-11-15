import { useId, type SelectHTMLAttributes } from 'react';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';
import { IconoAlerta } from './Iconos';

export interface CampoSeleccionProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  etiqueta: string;
  opciones: { valor: string; texto: string }[];
  /** Texto de la opción vacía inicial, que obliga a elegir. */
  vacio?: string;
  error?: string;
}

/** Lista desplegable con etiqueta asociada y error anunciado, con el mismo aspecto que Campo. */
export function CampoSeleccion({ etiqueta, opciones, vacio, error, className = '', ...props }: CampoSeleccionProps) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">{etiqueta}</label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} h-12 w-full rounded-xl border bg-slate-900 px-4 text-base text-white hover:border-slate-400 ${error ? 'border-red-400' : 'border-slate-600'} ${className}`}
        {...props}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map(({ valor, texto }) => <option key={valor} value={valor}>{texto}</option>)}
      </select>
      {error && (
        <p id={idError} className="flex items-start gap-1.5 text-sm font-medium text-red-300">
          <IconoAlerta className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
