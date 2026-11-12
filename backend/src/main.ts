import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export function configureApi(app: { setGlobalPrefix(prefix: string): unknown }) {
  app.setGlobalPrefix('api');
}

async function bootstrap() {
  // No public listener until HTTPS is configured in T010A.
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApi(app);
  app.enableShutdownHooks();
  await app.init();
  console.info('NestJS inicializado; conexión PostgreSQL disponible. Sin listener web hasta T010A.');
}

if (require.main === module) {
  bootstrap().catch(() => {
    console.error('No se pudo iniciar NestJS. Revisa la configuración y la disponibilidad de PostgreSQL.');
    process.exitCode = 1;
  });
}
