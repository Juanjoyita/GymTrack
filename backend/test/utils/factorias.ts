import { DataSource } from 'typeorm';
import { UsuarioRow } from '../../src/database/entities/usuario';
import { PREFIJO_ESQUEMA_INTEGRACION } from './infraestructura';

type UsuarioPrueba = Pick<UsuarioRow, 'id' | 'email' | 'hash_contrasena' | 'zona_horaria'>;

export function factoriaUsuarioPrueba(numero: 1 | 2): UsuarioPrueba {
  return {
    id: `00000000-0000-4000-8000-00000000000${numero}`,
    email: `t006.usuario${numero}@example.invalid`,
    hash_contrasena: `hash-sintetico-t006-${numero}`,
    zona_horaria: 'UTC'
  };
}

export async function crearDosUsuariosPrueba(source: DataSource) {
  if (
    source.options.type !== 'postgres' ||
    source.options.database !== 'gymtrack_test' ||
    typeof source.options.schema !== 'string' ||
    !source.options.schema.startsWith(`${PREFIJO_ESQUEMA_INTEGRACION}_`) ||
    !/^[a-z0-9_]+$/.test(source.options.schema)
  ) {
    throw new Error('Factorías rechazadas: solo se permite el esquema aislado de gymtrack_test.');
  }

  const users = [factoriaUsuarioPrueba(1), factoriaUsuarioPrueba(2)];
  return source.getRepository<UsuarioRow>('Usuario').save(users);
}
