import { Controller, Get, Req, Param, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import { AuthModule } from '../../src/auth/auth.module';
import { opcionesJwt } from '../../src/auth/auth.config';
import type { PeticionAutenticada } from '../../src/auth/auth.types';
import { exigirPropiedad } from '../../src/comun/auth.guard';
import { Usuario, type UsuarioRow } from '../../src/database/entities/usuario';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';

const password = 'T016-contrasena-sintetica!';
const id = '00000000-0000-4000-8000-000000000016';
const email = 't016@example.invalid';
const dto = { id, email, unidadPeso: 'kg', zonaHoraria: 'UTC' };

@Controller('propiedad-prueba')
class PropiedadPrueba {
  @Get(':id')
  obtener(@Req() req: PeticionAutenticada, @Param('id') resourceId: string) {
    const resource = resourceId === 'ausente' ? null : { id: resourceId, usuario_id: resourceId === 'propio' ? id : 'otro' };
    return exigirPropiedad(req.usuario!.id, resource);
  }
}

function cookies(value: string | string[] | undefined) { return typeof value === 'string' ? [value] : value ?? []; }

describe('T016: módulo aislado, cookie HTTPS y límite de intentos (sin AppModule/BD)', () => {
  let app: INestApplication | undefined;
  let log: jest.SpyInstance;
  let fixtureHash: string;
  const previousSecret = process.env.JWT_SECRET;
  const previousEnv = process.env.NODE_ENV;
  beforeAll(async () => { fixtureHash = await hash(password, { type: argon2id }); });
  beforeEach(() => { log = jest.spyOn(console, 'info').mockImplementation(() => undefined); });
  afterEach(async () => {
    await app?.close(); app = undefined;
    log.mockRestore();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
  });
  async function iniciar(env = 'test') {
    process.env.NODE_ENV = env;
    process.env.JWT_SECRET = 't016-clave-sintetica-exclusiva-de-pruebas-2026';
    const rows: UsuarioRow[] = [{ id, email, hash_contrasena: fixtureHash, version_token: 0, unidad_peso: 'kg', zona_horaria: 'UTC', creado_en: new Date() }];
    const repo = {
      findOne: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => rows.find((row) => where.id ? row.id === where.id : row.email === where.email) ?? null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => { rows.push(row); return row; }),
    };
    const module = await Test.createTestingModule({ imports: [AuthModule], controllers: [PropiedadPrueba] })
      .overrideProvider(getRepositoryToken(Usuario)).useValue(repo).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app);
    await app.init();
    return peticionHttps(app);
  }

  it.each(['development', 'test', 'production'])('registro/yo/logout serializan cookie Secure en %s', async (env) => {
    const agent = await iniciar(env);
    const response = await agent.post('/api/auth/registro').send({ email: 'nuevo@example.invalid', contrasena: password, zonaHoraria: 'America/Bogota' }).expect(201);
    expect(response.body).toEqual({ id: expect.any(String), email: 'nuevo@example.invalid', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' });
    const header = cookies(response.headers['set-cookie']).find((cookie) => cookie.startsWith('gt_sesion=')) ?? '';
    for (const flag of [/;\s*Secure/i, /;\s*HttpOnly/i, /;\s*SameSite=Strict/i, /;\s*Path=\//i, /;\s*Max-Age=604800/i]) expect(flag.test(header)).toBe(true);
    expect(/;\s*Domain=/i.test(header)).toBe(false);
    await agent.get('/api/auth/yo').expect(200, response.body);
    const logout = await agent.post('/api/auth/logout').expect(204);
    const deletion = cookies(logout.headers['set-cookie']).join(';');
    for (const flag of [/gt_sesion=;/, /;\s*Secure/i, /;\s*HttpOnly/i, /;\s*SameSite=Strict/i, /;\s*Path=\//i]) expect(flag.test(deletion)).toBe(true);
    await agent.get('/api/auth/yo').expect(401);
  });

  it('guard global rechaza ausencia de cookie, bearer y cookie duplicada/mal codificada', async () => {
    const agent = await iniciar();
    await agent.get('/api/auth/yo').expect(401);
    await agent.get('/api/auth/yo').set('Authorization', 'Bearer no-es-cookie').expect(401);
    await agent.get('/api/auth/yo').set('Cookie', 'gt_sesion=uno; gt_sesion=dos').expect(401);
    await agent.get('/api/auth/yo').set('Cookie', 'gt_sesion=%ZZ').expect(401);
    await agent.post('/api/auth/logout').expect(401);
  });

  it('login entrega DTO, no token en JSON; guard aplica 404 a propiedad ajena/ausente', async () => {
    const agent = await iniciar();
    const response = await agent.post('/api/auth/login').send({ email, contrasena: password }).expect(200);
    expect(response.body).toEqual(dto);
    await agent.get('/api/auth/yo').expect(200, dto);
    await agent.get('/api/propiedad-prueba/propio').expect(200);
    const ajeno = await agent.get('/api/propiedad-prueba/ajeno').expect(404);
    const ausente = await agent.get('/api/propiedad-prueba/ausente').expect(404);
    expect(ajeno.body).toEqual(ausente.body);
    expect(ajeno.body.codigo).toBe('NO_ENCONTRADO');
    const token = cookies(response.headers['set-cookie'])[0].split(';')[0].slice('gt_sesion='.length);
    const output = JSON.stringify(log.mock.calls);
    for (const value of [email, password, token]) expect(output.includes(value)).toBe(false);
    for (const [entry] of log.mock.calls) expect(Object.keys(JSON.parse(entry)).sort()).toEqual(['duracionMs', 'estado', 'metodo', 'ruta']);
  });

  it('dos dispositivos mantienen sesiones independientes al cerrar una', async () => {
    const primero = await iniciar();
    const segundo = peticionHttps(app!);
    for (const agent of [primero, segundo]) await agent.post('/api/auth/login').send({ email, contrasena: password }).expect(200);
    await primero.post('/api/auth/logout').expect(204);
    await primero.get('/api/auth/yo').expect(401);
    await segundo.get('/api/auth/yo').expect(200, dto);
  });

  it('contraseña incorrecta y email desconocido conservan el mismo 401 sin sesión', async () => {
    const agent = await iniciar();
    const responses = [];
    for (const inputEmail of [email, 'inexistente@example.invalid']) {
      const response = await agent.post('/api/auth/login').send({ email: inputEmail, contrasena: 'incorrecta' }).expect(401);
      expect(Boolean(response.headers['set-cookie'])).toBe(false);
      responses.push(response.body);
    }
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[0].codigo).toBe('NO_AUTENTICADO');
  });

  it.each(['login', 'registro'])('limita %s a diez intentos/minuto por IP, incluso cuerpos inválidos', async (ruta) => {
    const agent = await iniciar();
    for (let index = 0; index < 10; index++) {
      await agent.post(`/api/auth/${ruta}`).set('X-Forwarded-For', `192.0.2.${index + 1}`).send({}).expect(400);
    }
    const response = await agent.post(`/api/auth/${ruta}`).set('X-Forwarded-For', '198.51.100.1').send({}).expect(429);
    expect(response.body).toEqual({ codigo: 'DEMASIADAS_PETICIONES', mensaje: expect.any(String), campos: null, actual: null });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('registro y login exigen JSON y no aceptan formularios de otro origen', async () => {
    const agent = await iniciar();
    for (const ruta of ['registro', 'login']) {
      const response = await agent.post(`/api/auth/${ruta}`).type('form')
        .send({ email: 'nuevo@example.invalid', contrasena: password, zonaHoraria: 'UTC' }).expect(400);
      expect(response.body.codigo).toBe('VALIDACION');
      expect(Boolean(response.headers['set-cookie'])).toBe(false);
    }
  });

  it('JWT_SECRET es obligatorio y fuerte sin excepciones por entorno', () => {
    for (const NODE_ENV of ['development', 'test', 'production']) {
      for (const JWT_SECRET of [undefined, '', 'corta', ' '.repeat(32)]) expect(() => opcionesJwt({ NODE_ENV, JWT_SECRET })).toThrow('JWT_SECRET');
    }
    const options = opcionesJwt({ JWT_SECRET: 't016-clave-sintetica-exclusiva-de-pruebas-2026' });
    expect(options.signOptions).toMatchObject({ algorithm: 'HS256', expiresIn: 604800 });
    expect(options.verifyOptions).toMatchObject({ algorithms: ['HS256'] });
  });
});
