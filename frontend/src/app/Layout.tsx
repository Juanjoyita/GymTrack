import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AREA_TACTIL, FOCO_VISIBLE } from '../componentes/estilos';
import { IconoMancuerna } from '../componentes/Iconos';
import { textos } from '../textos/es';
import { SECCIONES } from './secciones';

// La sección actual se distingue por el fondo del icono y la negrita, no solo por color (Principio VI).
function clasesEnlace({ isActive }: { isActive: boolean }) {
  const estado = isActive ? 'font-bold text-slate-950' : 'font-medium text-slate-600 hover:text-slate-900';
  return `${AREA_TACTIL} ${FOCO_VISIBLE} group flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs ${estado}`;
}

/** Al cambiar de página, lleva el foco al título para que teclado y lector de pantalla sigan el cambio. */
function useFocoAlNavegar() {
  const { pathname } = useLocation();
  const contenido = useRef<HTMLElement>(null);
  const primeraCarga = useRef(true);

  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    contenido.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [pathname]);

  return contenido;
}

export function Layout() {
  const contenido = useFocoAlNavegar();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 text-slate-900">
      <a
        href="#contenido"
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} sr-only flex items-center rounded-xl bg-white px-4 font-semibold text-slate-950 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50`}
      >
        {textos.shell.saltarAlContenido}
      </a>
      <header className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
            <IconoMancuerna className="size-6" />
          </span>
          <div>
            <p className="text-lg font-extrabold leading-tight tracking-tight">{textos.app.nombre}</p>
            <p className="text-xs text-slate-400">{textos.app.lema}</p>
          </div>
        </div>
      </header>
      <main id="contenido" ref={contenido} className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-6">
        <Outlet />
      </main>
      <nav
        aria-label={textos.navegacion.etiqueta}
        className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl gap-1 px-2 py-1">
          {SECCIONES.map(({ ruta, nombre, Icono }) => (
            <li key={ruta} className="flex flex-1">
              <NavLink to={ruta} end={ruta === '/'} className={clasesEnlace}>
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-14 items-center justify-center rounded-full ${isActive ? 'bg-lime-300' : 'group-hover:bg-slate-100'}`}>
                      <Icono className="size-5" />
                    </span>
                    {nombre}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
