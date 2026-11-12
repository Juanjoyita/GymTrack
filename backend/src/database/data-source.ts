import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { databaseConfig } from './config';
import { entities } from './entities';
import { EsquemaInicial1794441600000 } from './migrations/001-esquema';

export function databaseOptions(): PostgresConnectionOptions {
  return {
    type: 'postgres', ...databaseConfig(), entities,
    migrations: [EsquemaInicial1794441600000],
    synchronize: false, migrationsRun: false, logging: false,
    extra: { options: '-c timezone=UTC' }
  };
}

export default new DataSource(databaseOptions());
