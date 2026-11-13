import { Link } from 'react-router-dom';
import { AREA_TACTIL, FOCO_VISIBLE } from '../componentes/estilos';
import { IconoBrujula } from '../componentes/Iconos';
import { textos } from '../textos/es';
import { useTituloDocumento } from './useTituloDocumento';

export function NoEncontrada() {
  useTituloDocumento(textos.noEncontrada.titulo);

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col items-start gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        <IconoBrujula className="size-8" />
      </span>
      <h1 id="titulo-pagina" tabIndex={-1} className="text-3xl font-extrabold tracking-tight text-slate-900 focus:outline-none">
        {textos.noEncontrada.titulo}
      </h1>
      <p className="text-base text-slate-700">{textos.noEncontrada.descripcion}</p>
      <Link
        to="/"
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center rounded-xl bg-slate-950 px-5 font-semibold text-white hover:bg-slate-800`}
      >
        {textos.noEncontrada.volver}
      </Link>
    </section>
  );
}
