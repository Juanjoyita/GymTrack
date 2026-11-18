import { config } from 'dotenv';
import { resolve } from 'node:path';

// Resolve from source or compiled output, regardless of the CLI working directory.
config({ path: resolve(__dirname, '../../../.env') });

export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Configuración inválida: falta ${key}.`);
    return value;
  };
  const database = required(env.NODE_ENV === 'test' ? 'DB_TEST_DATABASE' : 'DB_DATABASE');
  if (env.NODE_ENV === 'test' && (database !== 'gymtrack_test' || database === env.DB_DATABASE)) {
    throw new Error('Configuración inválida: las pruebas solo pueden usar gymtrack_test, separada de desarrollo.');
  }
  const port = Number(required('DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuración inválida: DB_PORT debe estar entre 1 y 65535.');
  }
  return {
    host: required('DB_HOST'), port, username: required('DB_USERNAME'),
    password: required('POSTGRES_PASSWORD'), database
  };
}
