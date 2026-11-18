import { lazy, Suspense, type ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Layout } from './Layout';
import { NoEncontrada } from './NoEncontrada';
import { PaginaSeccion } from './PaginaSeccion';
import { RutaPrivada, RutaPublica } from './RutaProtegida';
import { SECCIONES } from './secciones';

const PaginaLogin = lazy(() => import('../paginas/auth/PaginaLogin').then(({ PaginaLogin }) => ({ default: PaginaLogin })));
const PaginaRecuperar = lazy(() => import('../paginas/auth/PaginaRecuperar').then(({ PaginaRecuperar }) => ({ default: PaginaRecuperar })));
const PaginaRegistro = lazy(() => import('../paginas/auth/PaginaRegistro').then(({ PaginaRegistro }) => ({ default: PaginaRegistro })));
const PaginaRestablecer = lazy(() => import('../paginas/auth/PaginaRestablecer').then(({ PaginaRestablecer }) => ({ default: PaginaRestablecer })));
const PaginaCuenta = lazy(() => import('../paginas/cuenta/PaginaCuenta').then(({ PaginaCuenta }) => ({ default: PaginaCuenta })));
const PaginaEntrenar = lazy(() => import('../paginas/entrenamiento/PaginaEntrenar').then(({ PaginaEntrenar }) => ({ default: PaginaEntrenar })));
const PaginaDetalleHistorial = lazy(() => import('../paginas/historial/PaginaDetalleHistorial').then(({ PaginaDetalleHistorial }) => ({ default: PaginaDetalleHistorial })));
const PaginaHistorial = lazy(() => import('../paginas/historial/PaginaHistorial').then(({ PaginaHistorial }) => ({ default: PaginaHistorial })));
const PaginaProgreso = lazy(() => import('../paginas/progreso/PaginaProgreso').then(({ PaginaProgreso }) => ({ default: PaginaProgreso })));
const PaginaEditarRutina = lazy(() => import('../paginas/rutinas/EditorRutina').then(({ PaginaEditarRutina }) => ({ default: PaginaEditarRutina })));
const PaginaNuevaRutina = lazy(() => import('../paginas/rutinas/EditorRutina').then(({ PaginaNuevaRutina }) => ({ default: PaginaNuevaRutina })));
const PaginaRutinas = lazy(() => import('../paginas/rutinas/PaginaRutinas').then(({ PaginaRutinas }) => ({ default: PaginaRutinas })));

function cargar(elemento: ReactNode) {
  return <Suspense fallback={<p role="status" className="p-6 text-slate-300">Cargando...</p>}>{elemento}</Suspense>;
}

// Las secciones aún no implementadas conservan su marcador informativo.
export const rutas: RouteObject[] = [
  {
    element: <RutaPublica />,
    children: [
      { path: 'login', element: cargar(<PaginaLogin />) },
      { path: 'registro', element: cargar(<PaginaRegistro />) },
    ],
  },
  // Recuperar y el enlace del correo funcionan haya o no una sesión abierta en este navegador.
  { path: 'recuperar', element: cargar(<PaginaRecuperar />) },
  { path: 'restablecer', element: cargar(<PaginaRestablecer />) },
  {
    element: <RutaPrivada />,
    children: [{
      element: <Layout />,
      children: [
        ...SECCIONES.map((seccion) => {
          const element = seccion.clave === 'entrenar' ? cargar(<PaginaEntrenar />) : seccion.clave === 'historial' ? cargar(<PaginaHistorial />) : seccion.clave === 'progreso' ? cargar(<PaginaProgreso />) : seccion.clave === 'cuenta' ? cargar(<PaginaCuenta />) : seccion.clave === 'rutinas' ? cargar(<PaginaRutinas />) : (
            <PaginaSeccion seccion={seccion} />
          );
          return seccion.ruta === '/' ? { index: true, element } : { path: seccion.ruta.slice(1), element };
        }),
        { path: 'historial/:id', element: cargar(<PaginaDetalleHistorial />) },
        { path: 'rutinas/nueva', element: cargar(<PaginaNuevaRutina />) },
        { path: 'rutinas/:id', element: cargar(<PaginaEditarRutina />) },
        { path: '*', element: <NoEncontrada /> },
      ],
    }],
  },
];
