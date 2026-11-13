import type { ComponentType } from 'react';
import { IconoCuenta, IconoHistorial, IconoMancuerna, IconoProgreso, IconoRutinas } from '../componentes/Iconos';
import { textos, type ClaveSeccion } from '../textos/es';

export interface Seccion {
  clave: ClaveSeccion;
  ruta: string;
  nombre: string;
  Icono: ComponentType<{ className?: string }>;
}

// Secciones principales de la navegación, una por historia de usuario (US1–US5).
export const SECCIONES: Seccion[] = [
  { clave: 'entrenar', ruta: '/', nombre: textos.navegacion.entrenar, Icono: IconoMancuerna },
  { clave: 'historial', ruta: '/historial', nombre: textos.navegacion.historial, Icono: IconoHistorial },
  { clave: 'progreso', ruta: '/progreso', nombre: textos.navegacion.progreso, Icono: IconoProgreso },
  { clave: 'rutinas', ruta: '/rutinas', nombre: textos.navegacion.rutinas, Icono: IconoRutinas },
  { clave: 'cuenta', ruta: '/cuenta', nombre: textos.navegacion.cuenta, Icono: IconoCuenta },
];
