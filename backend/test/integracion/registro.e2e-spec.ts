import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

const password = 'T013-solo-pruebas-2026!';
const usuarioA = '00000000-0000-4000-8000-000000000013';
const usuarioB = '00000000-0000-4000-8000-000000000014';
const ejercicioId = '10000000-0000-4000-8000-000000000001';

describe('T013: aceptación REST de registro de entrenamientos', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let hashPrueba: string;

  beforeAll(async () => { hashPrueba = await hash(password, { type: argon2id }); });
  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    await source.query('INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4),($5,$6,$3,$4)',
      [usuarioA, 't013.a@example.invalid', hashPrueba, 'America/Bogota', usuarioB, 't013.b@example.invalid']);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app);
    await app.init();
  });
  afterEach(async () => {
    try { if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source); }
    finally { ownsSchema = false; await app?.close(); app = undefined; if (source?.isInitialized) await source.destroy(); }
  });

  const cliente = () => { if (!app) throw new Error('Aplicación de prueba no inicializada.'); return peticionHttps(app); };
  async function login(email: string) {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email, contrasena: password }).expect(200);
    return agent;
  }
  async function crearEjercicio() {
    const [row] = await source.query(`INSERT INTO ejercicio (id,nombre,grupo_muscular,es_catalogo) VALUES ($1,'Press T013','pecho',true) RETURNING id`, [ejercicioId]);
    return row.id as string;
  }
  function iniciar(agent: ReturnType<typeof cliente>, id: string, inicio = '2026-11-10T18:00:00.000Z') {
    return agent.post('/api/entrenamientos').send({ id, inicio, zonaHoraria: 'America/Bogota' });
  }

  it('inicia, recupera y finaliza una sesión conservando su nota y fechas', async () => {
    const agent = await login('t013.a@example.invalid');
    const id = '20000000-0000-4000-8000-000000000001';
    const created = await iniciar(agent, id).expect(201);
    expect(created.body).toMatchObject({ id, estado: 'en_curso', inicio: '2026-11-10T18:00:00.000Z', fin: null, zonaHoraria: 'America/Bogota' });
    await agent.patch(`/api/entrenamientos/${id}`).send({ nota: 'Buen entrenamiento', version: created.body.version }).expect(200);
    await agent.get('/api/entrenamientos/en-curso').expect(200);
    const done = await agent.post(`/api/entrenamientos/${id}/finalizar`).send({ fin: '2026-11-10T19:00:00.000Z', version: created.body.version + 1 }).expect(200);
    expect(done.body).toMatchObject({ id, estado: 'finalizado', nota: 'Buen entrenamiento' });
  });

  it('rechaza datos inválidos y fechas futuras con VALIDACION por campo', async () => {
    const agent = await login('t013.a@example.invalid');
    const response = await iniciar(agent, '20000000-0000-4000-8000-000000000002', '2999-01-01T00:00:00.000Z').send({ fin: '2999-01-01T01:00:00.000Z' }).expect(400);
    expect(response.body).toMatchObject({ codigo: 'VALIDACION', campos: expect.any(Object), actual: null });
    const bad = await agent.post('/api/entrenamientos').send({ id: 'no-uuid', inicio: 'ayer', zonaHoraria: 'no-es-zona' }).expect(400);
    expect(bad.body.codigo).toBe('VALIDACION');
  });

  it('registra series, convierte lb a kg, acepta límites y rechaza valores fuera de rango', async () => {
    const agent = await login('t013.a@example.invalid');
    const ex = await crearEjercicio();
    const entId = '20000000-0000-4000-8000-000000000003';
    await iniciar(agent, entId).expect(201);
    const erId = '30000000-0000-4000-8000-000000000001';
    await agent.post(`/api/entrenamientos/${entId}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    const result = await agent.post(`/api/entrenamientos/${entId}/ejercicios/${erId}/series`).send({ id: '40000000-0000-4000-8000-000000000001', orden: 1, repeticiones: 100, pesoEntrada: { valor: 0, unidad: 'lb' }, registradaEn: '2026-11-10T18:05:00Z' }).expect(201);
    expect(result.body.pesoKg).toBe(0);
    const invalidCases = [
      { repeticiones: 0, pesoEntrada: { valor: 10, unidad: 'kg' } },
      { repeticiones: 101, pesoEntrada: { valor: 10, unidad: 'kg' } },
      { repeticiones: 8, pesoEntrada: { valor: -1, unidad: 'kg' } },
      { repeticiones: 8, pesoEntrada: { valor: 1.234, unidad: 'kg' } },
      { repeticiones: 8, pesoEntrada: { valor: 1102.32, unidad: 'lb' } },
    ];
    for (const [index, values] of invalidCases.entries()) {
      const response = await agent.post(`/api/entrenamientos/${entId}/ejercicios/${erId}/series`).send({ id: `40000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`, orden: index + 2, registradaEn: '2026-11-10T18:06:00Z', ...values }).expect(400);
      expect(response.body.codigo).toBe('VALIDACION');
    }
  });

  it('el POST repetido con el mismo UUID es idempotente', async () => {
    const agent = await login('t013.a@example.invalid'); const ex = await crearEjercicio();
    const entId = '20000000-0000-4000-8000-000000000004'; const erId = '30000000-0000-4000-8000-000000000002';
    await iniciar(agent, entId).expect(201);
    await agent.post(`/api/entrenamientos/${entId}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    const path = `/api/entrenamientos/${entId}/ejercicios/${erId}/series`;
    const body = { id: '40000000-0000-4000-8000-000000000010', orden: 1, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: '2026-11-10T18:10:00Z' };
    await agent.post(path).send(body).expect(201);
    await agent.post(path).send(body).expect(200);
    const [{ total }] = await source.query('SELECT count(*)::int AS total FROM serie');
    expect(total).toBe(1);
  });

  it('permite una sola sesión activa por usuario ante dos inicios concurrentes', async () => {
    const agent = await login('t013.a@example.invalid');
    const responses = await Promise.all([
      iniciar(agent, '20000000-0000-4000-8000-000000000005'),
      iniciar(agent, '20000000-0000-4000-8000-000000000006'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const [{ total }] = await source.query("SELECT count(*)::int AS total FROM entrenamiento WHERE usuario_id=$1 AND estado='en_curso'", [usuarioA]);
    expect(total).toBe(1);
  });

  it('impide acceder a entrenamientos, ejercicios realizados y series de otro usuario', async () => {
    const a = await login('t013.a@example.invalid'); const b = await login('t013.b@example.invalid'); const ex = await crearEjercicio();
    const entId = '20000000-0000-4000-8000-000000000007'; const erId = '30000000-0000-4000-8000-000000000003';
    await iniciar(a, entId).expect(201);
    await a.post(`/api/entrenamientos/${entId}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    const serieId = '40000000-0000-4000-8000-000000000020';
    await a.post(`/api/entrenamientos/${entId}/ejercicios/${erId}/series`).send({ id: serieId, orden: 1, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: '2026-11-10T18:10:00Z' }).expect(201);
    await b.get(`/api/entrenamientos/${entId}`).expect(404);
    await b.patch(`/api/entrenamientos/${entId}`).send({ nota: 'ajena', version: 1 }).expect(404);
    await b.post(`/api/entrenamientos/${entId}/ejercicios`).send({ id: '30000000-0000-4000-8000-000000000004', ejercicioId: ex, posicion: 2 }).expect(404);
    await b.patch(`/api/entrenamientos/${entId}/ejercicios/${erId}`).send({ nota: 'ajena', version: 1 }).expect(404);
    await b.post(`/api/entrenamientos/${entId}/ejercicios/${erId}/series`).send({ id: '40000000-0000-4000-8000-000000000021', orden: 2, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: '2026-11-10T18:10:00Z' }).expect(404);
    await b.patch(`/api/entrenamientos/${entId}/ejercicios/${erId}/series/${serieId}`).send({ repeticiones: 9, version: 1 }).expect(404);
    await b.delete(`/api/entrenamientos/${entId}/ejercicios/${erId}/series/${serieId}?version=1`).expect(404);
    const [{ nota }] = await source.query('SELECT nota FROM entrenamiento WHERE id=$1', [entId]);
    expect(nota).toBeNull();
  });

  it('rechaza operaciones de registro sin sesión', async () => {
    await cliente().post('/api/entrenamientos').send({ id: '20000000-0000-4000-8000-000000000008', inicio: '2026-11-10T18:00:00Z', zonaHoraria: 'UTC' }).expect(401);
  });
});
