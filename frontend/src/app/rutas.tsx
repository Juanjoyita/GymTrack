import type { RouteObject } from 'react-router-dom';
import { PaginaLogin } from '../paginas/auth/PaginaLogin';
import { PaginaRecuperar } from '../paginas/auth/PaginaRecuperar';
import { PaginaRegistro } from '../paginas/auth/PaginaRegistro';
import { PaginaRestablecer } from '../paginas/auth/PaginaRestablecer';
import { PaginaCuenta } from '../paginas/cuenta/PaginaCuenta';
import { PaginaEntrenar } from '../paginas/entrenamiento/PaginaEntrenar';
import { PaginaDetalleHistorial } from '../paginas/historial/PaginaDetalleHistorial';
import { PaginaHistorial } from '../paginas/historial/PaginaHistorial';
import { PaginaProgreso } from '../paginas/progreso/PaginaProgreso';
import { PaginaEditarRutina, PaginaNuevaRutina } from '../paginas/rutinas/EditorRutina';
import { PaginaRutinas } from '../paginas/rutinas/PaginaRutinas';
import { Layout } from './Layout';
import { NoEncontrada } from './NoEncontrada';
import { PaginaSeccion } from './PaginaSeccion';
import { RutaPrivada, RutaPublica } from './RutaProtegida';
import { SECCIONES } from './secciones';

// Las secciones aún no implementadas conservan su marcador informativo.
export const rutas: RouteObject[] = [
  {
    element: <RutaPublica />,
    children: [
      { path: 'login', element: <PaginaLogin /> },
      { path: 'registro', element: <PaginaRegistro /> },
    ],
  },
  // Recuperar y el enlace del correo funcionan haya o no una sesión abierta en este navegador.
  { path: 'recuperar', element: <PaginaRecuperar /> },
  { path: 'restablecer', element: <PaginaRestablecer /> },
  {
    element: <RutaPrivada />,
    children: [{
      element: <Layout />,
      children: [
        ...SECCIONES.map((seccion) => {
          const element = seccion.clave === 'entrenar' ? <PaginaEntrenar /> : seccion.clave === 'historial' ? <PaginaHistorial /> : seccion.clave === 'progreso' ? <PaginaProgreso /> : seccion.clave === 'cuenta' ? <PaginaCuenta /> : seccion.clave === 'rutinas' ? <PaginaRutinas /> : (
            <PaginaSeccion seccion={seccion} />
          );
          return seccion.ruta === '/' ? { index: true, element } : { path: seccion.ruta.slice(1), element };
        }),
        { path: 'historial/:id', element: <PaginaDetalleHistorial /> },
        { path: 'rutinas/nueva', element: <PaginaNuevaRutina /> },
        { path: 'rutinas/:id', element: <PaginaEditarRutina /> },
        { path: '*', element: <NoEncontrada /> },
      ],
    }],
  },
];
