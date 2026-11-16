import type { RouteObject } from 'react-router-dom';
import { PaginaLogin } from '../paginas/auth/PaginaLogin';
import { PaginaRegistro } from '../paginas/auth/PaginaRegistro';
import { CerrarSesion } from '../paginas/auth/CerrarSesion';
import { PaginaEntrenar } from '../paginas/entrenamiento/PaginaEntrenar';
import { PaginaDetalleHistorial } from '../paginas/historial/PaginaDetalleHistorial';
import { PaginaHistorial } from '../paginas/historial/PaginaHistorial';
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
  {
    element: <RutaPrivada />,
    children: [{
      element: <Layout />,
      children: [
        ...SECCIONES.map((seccion) => {
          const element = seccion.clave === 'entrenar' ? <PaginaEntrenar /> : seccion.clave === 'historial' ? <PaginaHistorial /> : (
            <PaginaSeccion seccion={seccion}>
              {seccion.clave === 'cuenta' && <CerrarSesion />}
            </PaginaSeccion>
          );
          return seccion.ruta === '/' ? { index: true, element } : { path: seccion.ruta.slice(1), element };
        }),
        { path: 'historial/:id', element: <PaginaDetalleHistorial /> },
        { path: '*', element: <NoEncontrada /> },
      ],
    }],
  },
];
