import type { ReactNode } from 'react';
import { IconoReloj } from '../componentes/Iconos';
import { textos } from '../textos/es';
import type { Seccion } from './secciones';
import { useTituloDocumento } from './useTituloDocumento';

// Marcador de cada sección mientras se implementa su historia (US1–US5): explica qué incluirá.
// El título va directo sobre el fondo; el lima se reserva para acciones y la sección activa.
export function PaginaSeccion({ seccion, children }: { seccion: Seccion; children?: ReactNode }) {
  const { clave, nombre, Icono } = seccion;
  const { descripcion, incluira } = textos.secciones[clave];
  useTituloDocumento(nombre);

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col gap-8">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lime-300">
            <Icono className="size-6" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-sm font-semibold text-slate-300">
            <IconoReloj className="size-4" />
            {textos.shell.proximamente}
          </span>
        </div>
        <h1 id="titulo-pagina" tabIndex={-1} className="mt-6 font-display text-6xl font-extrabold italic leading-none text-white focus:outline-none">
          {nombre}
        </h1>
        <p className="mt-3 max-w-prose text-lg leading-relaxed text-slate-300">{descripcion}</p>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h2 id="que-incluira" className="text-base font-bold text-white">
          {textos.shell.queIncluira}
        </h2>
        <ul aria-labelledby="que-incluira" className="mt-4 flex flex-col gap-3">
          {incluira.map((elemento) => (
            <li key={elemento} className="flex items-start gap-3 text-base text-slate-300">
              <span aria-hidden="true" className="mt-2.5 h-0.5 w-4 shrink-0 rounded-full bg-slate-500" />
              {elemento}
            </li>
          ))}
        </ul>
      </div>
      {children}
    </section>
  );
}
