import type { UsuarioRow } from '../database/entities/usuario';

export interface UsuarioSesion {
  id: string;
  email: string;
  unidadPeso: 'kg' | 'lb';
  zonaHoraria: string;
}
export interface Acceso {
  usuario: UsuarioSesion;
  token: string;
}
export interface PeticionAutenticada {
  headers: { cookie?: string; authorization?: string };
  usuario?: UsuarioSesion;
}
export function usuarioSesion(row: UsuarioRow): UsuarioSesion {
  return { id: row.id, email: row.email, unidadPeso: row.unidad_peso, zonaHoraria: row.zona_horaria };
}
