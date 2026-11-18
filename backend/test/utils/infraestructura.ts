import { DataSource } from 'typeorm';
import { testDataSource } from './database';

export const PREFIJO_ESQUEMA_INTEGRACION = 't006_infraestructura';

export function fuenteDatosIntegracion() {
  const source = testDataSource();
  const schema = `${PREFIJO_ESQUEMA_INTEGRACION}_${process.pid}`;
  source.setOptions({
    schema,
    extra: { options: `-c search_path=${schema} -c timezone=UTC` }
  });
  return source;
}

function validarFuenteIntegracion(source: DataSource) {
  if (
    source.options.type !== 'postgres' ||
    source.options.database !== 'gymtrack_test'
  ) {
    throw new Error('Operación rechazada: solo se permite el esquema aislado de gymtrack_test.');
  }
  const schema = source.options.schema;
  if (
    typeof schema !== 'string' ||
    !new RegExp(`^${PREFIJO_ESQUEMA_INTEGRACION}_[0-9]+$`).test(schema)
  ) {
    throw new Error('Operación rechazada: solo se permite el esquema aislado de gymtrack_test.');
  }
  return schema;
}

export async function prepararEsquemaIntegracion(source: DataSource) {
  const schema = validarFuenteIntegracion(source);
  const existing = await source.query(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name=$1',
    [schema]
  );
  if (existing.length) {
    throw new Error(`El esquema ${schema} ya existe; no se elimina automáticamente.`);
  }
  await source.query(`CREATE SCHEMA ${schema}`);
}

export async function limpiarEsquemaIntegracion(source: DataSource) {
  const schema = validarFuenteIntegracion(source);
  await source.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
