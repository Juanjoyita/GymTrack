import { DataSource } from 'typeorm';
import { databaseOptions } from '../../src/database/data-source';

export const TEST_SCHEMA = 't004_verificacion';

export function testDataSource() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Las pruebas requieren NODE_ENV=test.');
  }
  const options = databaseOptions();
  if (options.database !== 'gymtrack_test') {
    throw new Error('Se rechaza ejecutar pruebas fuera de gymtrack_test.');
  }
  return new DataSource({
    ...options,
    schema: TEST_SCHEMA,
    extra: { options: `-c search_path=${TEST_SCHEMA} -c timezone=UTC` }
  });
}

export async function cleanTestSchema(source: DataSource) {
  if (source.options.type !== 'postgres' || source.options.database !== 'gymtrack_test' || source.options.schema !== TEST_SCHEMA) {
    throw new Error('Limpieza rechazada: base o esquema no son los de T004.');
  }
  await source.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
}
