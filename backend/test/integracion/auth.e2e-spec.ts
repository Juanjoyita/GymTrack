import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id, verify } from 'argon2';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

// Credenciales exclusivamente sintéticas. Cada caso dispone de aplicación y esquema propios.
const contrasena = 'T012-solo-pruebas-2026!';
const usuario = { id: '00000000-0000-4000-8000-000000000012', email: 't012.existente@example.invalid', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' };
const registro = { email: 't012.nuevo@example.invalid', contrasena, zonaHoraria: 'America/Bogota' };

function comprobarCookie(cookies: string[] | string | undefined) {
  const list = typeof cookies === 'string' ? [cookies] : cookies ?? [];
  const cookie = list.find((value) => value.startsWith('gt_sesion='));
  expect(Boolean(cookie)).toBe(true); // No imprimir el JWT al fallar.
  for (const flag of [/;\s*HttpOnly/i, /;\s*Secure/i, /;\s*SameSite=Strict/i, /;\s*Path=\//i]) {
    expect(flag.test(cookie ?? '')).toBe(true);
  }
}

describe('T012: aceptación REST de acceso (rojo hasta T023)', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let hashPrueba: string;

  beforeAll(async () => { hashPrueba = await hash(contrasena, { type: argon2id }); });
  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    await source.query('INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
      [usuario.id, usuario.email, hashPrueba, usuario.zonaHoraria]);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app);
    await app.init();
  });
  afterEach(async () => {
    try {
      if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source);
    } finally {
      ownsSchema = false;
      await app?.close();
      app = undefined;
      if (source?.isInitialized) await source.destroy();
    }
  });

  const cliente = () => {
    if (!app) throw new Error('Aplicación de prueba no inicializada.');
    return peticionHttps(app);
  };
  async function iniciarSesion() {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email: usuario.email, contrasena }).expect(200);
    return agent;
  }

  it('registra, establece cookie segura, conserva Argon2id y devuelve la sesión propia', async () => {
    const agent = cliente();
    const response = await agent.post('/api/auth/registro').send(registro).expect(201);
    expect(response.body).toEqual({ id: expect.any(String), email: registro.email, unidadPeso: 'kg', zonaHoraria: registro.zonaHoraria });
    comprobarCookie(response.headers['set-cookie']);
    await agent.get('/api/auth/yo').expect(200, response.body);
    const [row] = await source.query('SELECT hash_contrasena FROM usuario WHERE email=$1', [registro.email]);
    expect(Boolean(row?.hash_contrasena?.startsWith('$argon2id$'))).toBe(true);
    expect(await verify(row.hash_contrasena, contrasena)).toBe(true);
  });

  it('login de cuenta existente devuelve solo Usuario y cookie de sesión', async () => {
    const agent = cliente();
    const response = await agent.post('/api/auth/login').send({ email: usuario.email, contrasena }).expect(200);
    expect(response.body).toEqual(usuario);
    comprobarCookie(response.headers['set-cookie']);
    await agent.get('/api/auth/yo').expect(200, usuario);
  });

  it('logout borra la cookie y las siguientes peticiones quedan sin sesión', async () => {
    const agent = await iniciarSesion();
    const response = await agent.post('/api/auth/logout').expect(204);
    const raw = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    expect(cookies.some((value) => /^gt_sesion=;/i.test(value))).toBe(true);
    const rejected = await agent.get('/api/auth/yo').expect(401);
    expect(rejected.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String), campos: null, actual: null });
  });

  it('otro dispositivo inicia sesión independiente y conserva su acceso tras logout del primero', async () => {
    const primero = await iniciarSesion();
    const segundo = await iniciarSesion();
    await primero.get('/api/auth/yo').expect(200, usuario);
    await segundo.get('/api/auth/yo').expect(200, usuario);
    await primero.post('/api/auth/logout').expect(204);
    await primero.get('/api/auth/yo').expect(401);
    await segundo.get('/api/auth/yo').expect(200, usuario);
  });

  it('credenciales inválidas y email desconocido dan el mismo 401, sin crear cookie', async () => {
    const responses = [];
    for (const email of [usuario.email, 't012.desconocido@example.invalid']) {
      const response = await cliente().post('/api/auth/login').send({ email, contrasena: 'T012-incorrecta!' });
      responses.push(response);
    }
    expect(responses.map(({ status }) => status)).toEqual([401, 401]);
    for (const response of responses) {
      expect(response.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String), campos: null, actual: null });
      expect(Boolean(response.headers['set-cookie'])).toBe(false);
    }
    expect(responses[0].body).toEqual(responses[1].body);
  });

  it.each(['/api/auth/yo', '/api/entrenamientos/en-curso'])('rechaza acceso sin sesión a %s', async (ruta) => {
    const response = await cliente().get(ruta).expect(401);
    expect(response.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String), campos: null, actual: null });
  });

  it('logout sin sesión exige autenticación', async () => {
    const response = await cliente().post('/api/auth/logout').expect(401);
    expect(response.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('rechaza cookie manipulada como sesión inválida', async () => {
    const response = await cliente().get('/api/auth/yo').set('Cookie', 'gt_sesion=no-es-un-jwt').expect(401);
    expect(response.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('registro inválido devuelve VALIDACION por email y contrasena según el contrato', async () => {
    const response = await cliente().post('/api/auth/registro')
      .send({ email: 'no-valido', contrasena: '', zonaHoraria: 'America/Bogota' }).expect(400);
    expect(response.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String),
      campos: { email: expect.any(String), contrasena: expect.any(String) }, actual: null });
    expect(Boolean(response.headers['set-cookie'])).toBe(false);
  });

  it('rechaza email ya registrado sin crear una segunda cuenta', async () => {
    const response = await cliente().post('/api/auth/registro').send({ ...registro, email: usuario.email }).expect(409);
    expect(response.body.codigo).toBe('EMAIL_EN_USO');
    const [{ total }] = await source.query('SELECT count(*)::int AS total FROM usuario WHERE email=$1', [usuario.email]);
    expect(total).toBe(1);
  });
});
