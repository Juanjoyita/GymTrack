import { IconoAlerta } from '../../componentes/Iconos';

/** Aviso general del formulario. Se monta al aparecer para que el lector de pantalla lo anuncie. */
export function AvisoError({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-3 text-base text-red-100">
      <IconoAlerta className="mt-0.5 size-5 shrink-0 text-red-300" />
      <p>{mensaje}</p>
    </div>
  );
}
