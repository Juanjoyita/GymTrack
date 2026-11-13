import { Body, Controller, Get, HttpException, INestApplication, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { esquemaEjercicio, esquemaSerie } from '@gymtrack/domain';
import request from 'supertest';
import { configureApi } from '../../src/main';
import { ZodValidationPipe } from '../../src/comun/zod-validation.pipe';

@Controller('comun-prueba')
class ComunPrueba {
  @Post('serie')
  serie(@Body(new ZodValidationPipe(esquemaSerie)) body: unknown) { return body; }
  @Post('ejercicio')
  ejercicio(@Body(new ZodValidationPipe(esquemaEjercicio)) body: unknown) { return body; }
  @Get('error/:status')
  error(@Param('status') status: string) { throw new HttpException('secreto-interno', Number(status)); }
  @Get('conflicto')
  conflicto() { throw new HttpException({ codigo: 'CONFLICTO_VERSION', mensaje: 'Versión desactualizada.', actual: { id: 'fixture', version: 2 } }, 409); }
  @Get('inesperado')
  inesperado() { throw new Error('token-super-secreto'); }
}

describe('T009: validación, errores HTTP y logs sin datos sensibles', () => {
  let app: INestApplication;
  let log: jest.SpyInstance;
  beforeAll(async () => {
    log = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const module = await Test.createTestingModule({ controllers: [ComunPrueba] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApi(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); log?.mockRestore(); });
  beforeEach(() => log.mockClear());

  it('devuelve 400 VALIDACION con errores por campo y rutas anidadas', async () => {
    const response = await request(app.getHttpServer()).post('/api/comun-prueba/serie')
      .send({ repeticiones: 0, pesoEntrada: { valor: 501, unidad: 'kg' } }).expect(400);
    expect(response.body).toEqual({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.',
      campos: { repeticiones: expect.any(String), 'pesoEntrada.valor': expect.any(String) }, actual: null });
  });
  it('usa el resultado transformado por el esquema compartido', async () => {
    await request(app.getHttpServer()).post('/api/comun-prueba/ejercicio')
      .send({ nombre: '  Press  ', ignorado: 'no persistir' }).expect(201, { nombre: 'Press' });
  });
  it.each([[401, 'NO_AUTENTICADO'], [404, 'NO_ENCONTRADO'], [410, 'ENLACE_INVALIDO'], [429, 'DEMASIADAS_PETICIONES']])('normaliza HTTP %s', async (status, codigo) => {
    const response = await request(app.getHttpServer()).get(`/api/comun-prueba/error/${status}`).expect(status as number);
    expect(response.body).toEqual({ codigo, mensaje: expect.any(String), campos: null, actual: null });
    expect(JSON.stringify(response.body)).not.toContain('secreto-interno');
  });
  it('conserva el recurso vigente de un conflicto contractual', async () => {
    await request(app.getHttpServer()).get('/api/comun-prueba/conflicto').expect(409, {
      codigo: 'CONFLICTO_VERSION', mensaje: 'Versión desactualizada.', campos: null, actual: { id: 'fixture', version: 2 },
    });
  });
  it('normaliza rutas inexistentes y JSON malformado sin reflejar datos', async () => {
    const missing = await request(app.getHttpServer()).get('/api/token-super-secreto?email=privado').expect(404);
    expect(missing.body.codigo).toBe('NO_ENCONTRADO');
    const bad = await request(app.getHttpServer()).post('/api/comun-prueba/serie')
      .set('Content-Type', 'application/json').send('{"token":"token-super-secreto"').expect(400);
    expect(bad.body).toEqual({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: null, actual: null });
    expect(JSON.stringify([missing.body, bad.body])).not.toContain('token-super-secreto');
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('token-super-secreto');
    expect(JSON.parse(log.mock.calls[0][0]).ruta).toBe('SIN_RUTA');
  });
  it('oculta detalles inesperados y registra solo metadatos seguros en éxito y errores', async () => {
    await request(app.getHttpServer()).post('/api/comun-prueba/serie?token=token-super-secreto')
      .set('Authorization', 'Bearer token-super-secreto').set('Cookie', 'session=token-super-secreto')
      .send({ pesoKg: 77.37, repeticiones: 8, email: 'persona@example.invalid', password: 'clave-secreta' }).expect(201);
    await request(app.getHttpServer()).get('/api/comun-prueba/error/401?email=persona@example.invalid').expect(401);
    const response = await request(app.getHttpServer()).get('/api/comun-prueba/inesperado').expect(500);
    expect(response.body).toEqual({ codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la solicitud.', campos: null, actual: null });
    expect(log).toHaveBeenCalledTimes(3);
    for (const [entry] of log.mock.calls) {
      const parsed = JSON.parse(entry);
      expect(Object.keys(parsed).sort()).toEqual(['duracionMs', 'estado', 'metodo', 'ruta']);
      expect(parsed.duracionMs).toEqual(expect.any(Number));
    }
    const output = JSON.stringify(log.mock.calls);
    for (const secret of ['token-super-secreto', 'persona@example.invalid', 'clave-secreta', '77.37', 'Authorization', 'Cookie']) expect(output).not.toContain(secret);
    expect(output).toContain('/api/comun-prueba/error/:status');
  });
});
