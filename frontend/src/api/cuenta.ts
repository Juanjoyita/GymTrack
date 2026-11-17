import type { Usuario } from './auth';
import { descargar, solicitar } from './cliente';

// Cuenta (contracts/api.md, «Autenticación y cuenta» — P4).

/** Solo se envía lo que cambia: la zona horaria guardada no se toca (FR-024). */
export const actualizarPreferencias = (datos: { unidadPeso: 'kg' | 'lb' }) =>
  solicitar<Usuario>('/cuenta/preferencias', { method: 'PATCH', cuerpo: datos });

export type FormatoExportacion = 'json' | 'csv';

/** Exportación completa (FR-025, research R-17). El nombre lo da el servidor en Content-Disposition. */
export async function exportarDatos(formato: FormatoExportacion) {
  const { contenido, nombre } = await descargar(`/exportacion?formato=${formato}`);
  return { contenido, nombre: nombre ?? `gymtrack.${formato}` };
}

/** Elimina la cuenta y todos sus datos (FR-026, research R-18). 401 si la contraseña no es correcta. */
export const eliminarCuenta = (contrasena: string) =>
  solicitar<void>('/cuenta', { method: 'DELETE', cuerpo: { contrasena } });
