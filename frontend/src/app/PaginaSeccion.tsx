import { IconoCheck, IconoReloj } from '../componentes/Iconos';
import { textos } from '../textos/es';
import type { Seccion } from './secciones';
import { useTituloDocumento } from './useTituloDocumento';

// Marcador de cada sección mientras se implementa su historia (US1–US5): explica qué incluirá.
export function PaginaSeccion({ seccion }: { seccion: Seccion }) {
  const { clave, nombre, Icono } = seccion;
  const { descripcion, incluira } = textos.secciones[clave];
  useTituloDocumento(nombre);

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-lime-300 text-slate-950">
            <Icono className="size-8" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-lime-200">
            <IconoReloj className="size-4" />
            {textos.shell.proximamente}
          </span>
        </div>
        <h1 id="titulo-pagina" tabIndex={-1} className="mt-6 text-3xl font-extrabold tracking-tight focus:outline-none">
          {nombre}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-slate-300">{descripcion}</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="que-incluira" className="text-sm font-bold uppercase tracking-wider text-slate-600">
          {textos.shell.queIncluira}
        </h2>
        <ul aria-labelledby="que-incluira" className="mt-4 flex flex-col gap-3">
          {incluira.map((elemento) => (
            <li key={elemento} className="flex items-start gap-3 text-base text-slate-800">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-100 text-lime-800">
                <IconoCheck className="size-4" />
              </span>
              {elemento}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
