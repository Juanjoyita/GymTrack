import { ErrorApi, solicitar } from './cliente';

// Autenticación (contracts/api.md). La sesión viaja solo en la cookie httpOnly gt_sesion.
export interface Usuario {
  id: string;
  email: string;
  unidadPeso: 'kg' | 'lb';
  zonaHoraria: string;
}

export interface Credenciales { email: string; contrasena: string }

/** Usuario de la sesión actual, o null si no hay sesión válida (401). */
export async function obtenerSesion(): Promise<Usuario | null> {
  try {
    return await solicitar<Usuario>('/auth/yo');
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 401) return null;
    throw error;
  }
}

export const iniciarSesion = (credenciales: Credenciales) =>
  solicitar<Usuario>('/auth/login', { method: 'POST', cuerpo: credenciales });

export const registrarse = (datos: Credenciales & { zonaHoraria: string }) =>
  solicitar<Usuario>('/auth/registro', { method: 'POST', cuerpo: datos });

export const cerrarSesion = () => solicitar<void>('/auth/logout', { method: 'POST' });
