import { Link } from 'react-router-dom';
import { AREA_TACTIL, FOCO_VISIBLE } from '../componentes/estilos';
import { IconoBrujula } from '../componentes/Iconos';
import { textos } from '../textos/es';
import { useTituloDocumento } from './useTituloDocumento';

export function NoEncontrada() {
  useTituloDocumento(textos.noEncontrada.titulo);

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-slate-900 p-6">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-slate-200">
        <IconoBrujula className="size-8" />
      </span>
      <h1 id="titulo-pagina" tabIndex={-1} className="font-display text-5xl font-extrabold italic leading-none text-white focus:outline-none">
        {textos.noEncontrada.titulo}
      </h1>
      <p className="text-base text-slate-300">{textos.noEncontrada.descripcion}</p>
      <Link
        to="/"
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center rounded-xl bg-lime-300 px-5 font-bold text-slate-950 hover:bg-lime-200`}
      >
        {textos.noEncontrada.volver}
      </Link>
    </section>
  );
}
