import { databaseConfig } from '../../src/database/config';

const env = {
  NODE_ENV: 'development', DB_HOST: 'localhost', DB_PORT: '5433',
  DB_USERNAME: 'gymtrack', POSTGRES_PASSWORD: 'solo-fixture-no-real',
  DB_DATABASE: 'gymtrack', DB_TEST_DATABASE: 'gymtrack_test'
};

describe('Configuración de conexión', () => {
  it('selecciona bases diferentes para desarrollo y pruebas', () => {
    expect(databaseConfig(env).database).toBe('gymtrack');
    expect(databaseConfig({ ...env, NODE_ENV: 'test' }).database).toBe('gymtrack_test');
  });
  it('rechaza una base de pruebas que apunte a desarrollo', () => {
    expect(() => databaseConfig({ ...env, NODE_ENV: 'test', DB_TEST_DATABASE: 'gymtrack' }))
      .toThrow('gymtrack_test');
  });
  it.each(['0', '65536', 'abc', '5433.5', ''])('rechaza puerto inválido %s', port => {
    expect(() => databaseConfig({ ...env, DB_PORT: port })).toThrow('DB_PORT');
  });
  it('rechaza configuración incompleta sin revelar secretos', () => {
    expect(() => databaseConfig({ ...env, DB_HOST: '' })).toThrow('falta DB_HOST');
    expect(() => databaseConfig({ ...env, POSTGRES_PASSWORD: '' })).toThrow('POSTGRES_PASSWORD');
  });
});
