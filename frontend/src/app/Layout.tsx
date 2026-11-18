import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AREA_TACTIL, FOCO_VISIBLE } from '../componentes/estilos';
import { IconoCheck, IconoMancuerna } from '../componentes/Iconos';
import { useDisponibleSinConexion } from '../registrar-sw';
import { textos } from '../textos/es';
import { SECCIONES } from './secciones';

// La sección actual se distingue por el fondo del icono y la negrita, no solo por color (Principio VI).
function clasesEnlace({ isActive }: { isActive: boolean }) {
  const estado = isActive ? 'font-bold text-white' : 'font-medium text-slate-400 hover:text-white';
  return `${AREA_TACTIL} ${FOCO_VISIBLE} group flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs ${estado}`;
}

/**
 * Al cambiar de página (también al entrar tras iniciar sesión), lleva el foco al título para que
 * teclado y lector de pantalla sigan el cambio. En la primera carga del documento no lo mueve.
 */
function useFocoAlNavegar() {
  const { key } = useLocation();
  const contenido = useRef<HTMLElement>(null);

  useEffect(() => {
    if (key === 'default') return;
    const main = contenido.current;
    if (!main) return;
    // Las páginas lazy pueden seguir en Suspense cuando cambia la ruta.
    const enfocar = () => {
      const titulo = main.querySelector<HTMLElement>('h1');
      if (!titulo) return false;
      titulo.focus();
      return true;
    };
    if (enfocar()) return;
    const observer = new MutationObserver(() => {
      if (enfocar()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [key]);

  return contenido;
}

export function Layout() {
  const contenido = useFocoAlNavegar();
  const sinConexion = useDisponibleSinConexion();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <a
        href="#contenido"
        className={`${AREA_TACTIL} ${FOCO_VISIBLE} sr-only flex items-center rounded-xl bg-lime-300 px-4 font-bold text-slate-950 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50`}
      >
        {textos.shell.saltarAlContenido}
      </a>
      <header className="border-b border-white/10 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-lime-300 text-slate-950">
            <IconoMancuerna className="size-5" />
          </span>
          <p className="font-display text-2xl font-extrabold italic leading-none">{textos.app.nombre}</p>
          {sinConexion && (
            <p className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-400">
              <IconoCheck className="size-3.5 text-lime-300" />{textos.shell.disponibleSinConexion}
            </p>
          )}
        </div>
      </header>
      <main id="contenido" ref={contenido} className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-6">
        <Outlet />
      </main>
      <nav
        aria-label={textos.navegacion.etiqueta}
        className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl gap-1 px-2 py-1">
          {SECCIONES.map(({ ruta, nombre, Icono }) => (
            <li key={ruta} className="flex flex-1">
              <NavLink to={ruta} end={ruta === '/'} className={clasesEnlace}>
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-lime-300 text-slate-950' : 'group-hover:bg-white/10'}`}>
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
