import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { IconoMancuerna } from '../../componentes/Iconos';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { textos } from '../../textos/es';

/**
 * Disco olímpico de goma con el aro de marca: el emblema de las pantallas de acceso. Decorativo.
 * El gris oscuro mantiene legible el texto blanco que pasa por encima.
 */
function Disco({ className = '' }: { className?: string }) {
  const leyenda = '20 KG · GYMTRACK · 20 KG · GYMTRACK · ';
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 200 200" className={className}>
      <defs>
        <path id="aro-disco" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" />
      </defs>
      <circle cx="100" cy="100" r="99" className="fill-slate-800" />
      <circle cx="100" cy="100" r="91" fill="none" strokeWidth="1.5" className="stroke-white/10" />
      <text className="fill-lime-300 font-display text-[15px] font-extrabold italic" letterSpacing="2.2">
        <textPath href="#aro-disco">{leyenda}</textPath>
      </text>
      <circle cx="100" cy="100" r="60" fill="none" strokeWidth="1.5" className="stroke-white/10" />
      <circle cx="100" cy="100" r="31" strokeWidth="3" className="fill-slate-900 stroke-lime-300" />
      <circle cx="100" cy="100" r="13" className="fill-slate-950" />
    </svg>
  );
}

interface PantallaAccesoProps {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  pie: ReactNode;
}

/**
 * Composición de /login y /registro, toda oscura. En móvil, identidad y disco arriba y formulario
 * debajo en una sola columna; desde lg, la identidad ocupa la mitad izquierda.
 */
export function PantallaAcceso({ titulo, subtitulo, children, pie }: PantallaAccesoProps) {
  useTituloDocumento(titulo);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();

  // Tras una redirección (no en la primera carga), el foco va al título para anunciar la pantalla.
  useEffect(() => {
    if (key !== 'default') encabezado.current?.focus();
  }, [key]);

  return (
    <div className="min-h-dvh bg-slate-950 text-white lg:grid lg:grid-cols-2">
      <header className="relative overflow-hidden px-6 pt-8 sm:px-10 lg:border-r lg:border-white/10 lg:bg-slate-900/40 lg:px-14 lg:py-14">
        <Disco className="pointer-events-none absolute -right-24 top-20 size-56 motion-safe:animate-rodar sm:-right-10 lg:-right-36 lg:top-14 lg:size-[26rem]" />
        <div className="relative mx-auto flex w-full max-w-sm flex-col lg:mx-0 lg:h-full lg:max-w-lg lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
              <IconoMancuerna className="size-6" />
            </span>
            <div>
              <p className="font-display text-2xl font-extrabold italic leading-none">{textos.app.nombre}</p>
              <p className="text-sm text-slate-400">{textos.app.lema}</p>
            </div>
          </div>
          <div className="mt-24 lg:mt-0">
            <p className="max-w-[14rem] font-display text-5xl font-extrabold italic leading-[0.9] sm:max-w-sm sm:text-6xl lg:max-w-md lg:text-8xl">
              {textos.acceso.frase}
            </p>
          </div>
        </div>
      </header>

      <main id="contenido" className="px-6 pb-12 pt-10 sm:px-10 lg:flex lg:items-center lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <h1 ref={encabezado} tabIndex={-1} className="font-display text-4xl font-bold text-white focus:outline-none">
            {titulo}
          </h1>
          <p className="mt-2 text-base text-slate-400">{subtitulo}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 border-t border-white/10 pt-6 text-base text-slate-400">{pie}</div>
        </div>
      </main>
    </div>
  );
}
