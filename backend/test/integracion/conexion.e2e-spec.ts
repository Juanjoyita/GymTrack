import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';

// Ruta solo del módulo de prueba; no añade endpoints al producto.
@Controller('conexion-prueba')
class ConexionPrueba {
  @Get()
  get() { return { disponible: true }; }
}

describe('NestJS y TypeORM (base de pruebas)', () => {
  let app: INestApplication;
  afterAll(async () => { await app?.close(); });
  it('inicializa NestJS y conecta a PostgreSQL sin sincronizar ni migrar automáticamente', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule], controllers: [ConexionPrueba] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApi(app);
    await app.init();
    const source = app.get(DataSource);
    expect(source.isInitialized).toBe(true);
    expect(source.options.synchronize).toBe(false);
    expect(source.options.migrationsRun).toBe(false);
    const [row] = await source.query('SELECT current_database() AS base');
    expect(row.base).toBe('gymtrack_test');
    await request(app.getHttpServer()).get('/api/conexion-prueba').expect(200, { disponible: true });
    await request(app.getHttpServer()).get('/conexion-prueba').expect(404);
  });
});
