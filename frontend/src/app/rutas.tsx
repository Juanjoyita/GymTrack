import type { RouteObject } from 'react-router-dom';
import { Layout } from './Layout';
import { NoEncontrada } from './NoEncontrada';
import { PaginaSeccion } from './PaginaSeccion';
import { SECCIONES } from './secciones';

// Cada historia sustituirá su marcador por la página real (frontend/src/paginas/*).
export const rutas: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      ...SECCIONES.map((seccion) => (seccion.ruta === '/'
        ? { index: true, element: <PaginaSeccion seccion={seccion} /> }
        : { path: seccion.ruta.slice(1), element: <PaginaSeccion seccion={seccion} /> })),
      { path: '*', element: <NoEncontrada /> },
    ],
  },
];
