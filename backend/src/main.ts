import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './comun/http-exception.filter';
import { httpLogger } from './comun/http-logger';
import { opcionesTls } from './comun/tls';

export function configureApi(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(httpLogger);
  app.useGlobalFilters(new HttpExceptionFilter());
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false, httpsOptions: opcionesTls() });
  configureApi(app);
  app.enableShutdownHooks();
  await app.listen(3000, 'localhost');
  console.info('API HTTPS disponible en https://localhost:3000/api.');
}

if (require.main === module) {
  bootstrap().catch(() => {
    console.error('No se pudo iniciar NestJS. Revisa los certificados HTTPS, la configuración y PostgreSQL.');
    process.exitCode = 1;
  });
}
