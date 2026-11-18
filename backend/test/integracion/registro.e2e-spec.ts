import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import type { DataSource } from 'typeorm';
import { Entrenamiento } from '../../src/database/entities/entrenamiento';
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
    const [row] = await source.query(`INSERT INTO ejercicio (id,nombre,nombre_normalizado,grupo_muscular,usuario_id) VALUES ($1,'Press T013','press t013','pecho',NULL) RETURNING id`, [ejercicioId]);
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
    const ex = await crearEjercicio();
    const erId = '30000000-0000-4000-8000-000000000099';
    await agent.post(`/api/entrenamientos/${id}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    await agent.post(`/api/entrenamientos/${id}/ejercicios/${erId}/series`).send({ id: '40000000-0000-4000-8000-000000000099', orden: 1, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: '2026-11-10T18:10:00Z' }).expect(201);
    const current = await agent.get('/api/entrenamientos/en-curso').expect(200);
    expect(current.body.resumen).toMatchObject({ ejercicios: 1, series: 1, volumenKg: 480 });
    const badFin = await agent.post(`/api/entrenamientos/${id}/finalizar`).send({ fin: '2026-11-10T17:00:00Z', version: created.body.version + 1 }).expect(400);
    expect(badFin.body).toMatchObject({ codigo: 'VALIDACION', campos: { fin: expect.any(String) } });
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
  it('no hay sesión activa devuelve 204 y finalizar vacío lo descarta', async () => {
    const agent = await login('t013.a@example.invalid');
    await agent.get('/api/entrenamientos/en-curso').expect(204);
    const id = '20000000-0000-4000-8000-000000000101';
    const created = await iniciar(agent, id).expect(201);
    await agent.post(`/api/entrenamientos/${id}/finalizar`).send({ version: created.body.version }).expect(200, { descartado: true });
    await agent.get('/api/entrenamientos/en-curso').expect(204);
    expect(await source.getRepository('Entrenamiento').count()).toBe(0);
  });

  it('los POST de sesión y ejercicio realizado repetidos responden 200 sin duplicar', async () => {
    const agent = await login('t013.a@example.invalid'), ex = await crearEjercicio();
    const id = '20000000-0000-4000-8000-000000000102', erId = '30000000-0000-4000-8000-000000000102';
    await iniciar(agent, id).expect(201);
    await iniciar(agent, id).expect(200);
    const path = `/api/entrenamientos/${id}/ejercicios`, input = { id: erId, ejercicioId: ex, posicion: 1 };
    await agent.post(path).send(input).expect(201);
    await agent.post(path).send(input).expect(200);
    expect(await source.getRepository('Entrenamiento').count()).toBe(1);
    expect(await source.getRepository('EjercicioRealizado').count()).toBe(1);
  });

  it('prellenado devuelve null o series propias finalizadas, incluso tras reingresar', async () => {
    const agent = await login('t013.a@example.invalid'), ex = await crearEjercicio();
    const initial = await agent.get(`/api/ejercicios/${ex}/ultima-sesion`).expect(200);
    expect(initial.text).toBe('null');
    const id = '20000000-0000-4000-8000-000000000103', erId = '30000000-0000-4000-8000-000000000103';
    const created = await iniciar(agent, id).expect(201);
    await agent.post(`/api/entrenamientos/${id}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    await agent.post(`/api/entrenamientos/${id}/ejercicios/${erId}/series`).send({ id: '40000000-0000-4000-8000-000000000103', orden: 1, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: '2026-11-10T18:10:00Z' }).expect(201);
    await agent.post(`/api/entrenamientos/${id}/finalizar`).send({ fin: '2026-11-10T19:00:00Z', version: created.body.version }).expect(200);
    await agent.post('/api/auth/logout').expect(204);
    const reingreso = await login('t013.a@example.invalid');
    await reingreso.get(`/api/ejercicios/${ex}/ultima-sesion`).expect(200, { entrenamientoId: id, fecha: '2026-11-10T18:00:00.000Z', series: [{ orden: 1, repeticiones: 8, pesoKg: 60 }] });
    const b = await login('t013.b@example.invalid');
    const other = await b.get(`/api/ejercicios/${ex}/ultima-sesion`).expect(200);
    expect(other.text).toBe('null');
  });

  it('conserva kg canónicos al editar solo repeticiones y expone conflictos sin nombres SQL', async () => {
    const agent = await login('t013.a@example.invalid'), ex = await crearEjercicio();
    const id = '20000000-0000-4000-8000-000000000104', erId = '30000000-0000-4000-8000-000000000104', sId = '40000000-0000-4000-8000-000000000104';
    await iniciar(agent, id).expect(201);
    const path = `/api/entrenamientos/${id}/ejercicios/${erId}`;
    await agent.post(`/api/entrenamientos/${id}/ejercicios`).send({ id: erId, ejercicioId: ex, posicion: 1 }).expect(201);
    const created = await agent.post(`${path}/series`).send({ id: sId, orden: 1, repeticiones: 8, pesoEntrada: { valor: 132.5, unidad: 'lb' }, registradaEn: '2026-11-10T18:10:00Z' }).expect(201);
    const updated = await agent.patch(`${path}/series/${sId}`).send({ repeticiones: 9, version: 1 }).expect(200);
    expect(updated.body).toMatchObject({ pesoKg: created.body.pesoKg, repeticiones: 9, version: 2 });
    const conflict = await agent.patch(`${path}/series/${sId}`).send({ repeticiones: 10, version: 1 }).expect(409);
    expect(conflict.body).toMatchObject({ codigo: 'CONFLICTO_VERSION', actual: { id: sId, pesoKg: created.body.pesoKg, version: 2 } });
    expect(conflict.body.actual).not.toHaveProperty('peso_kg');
    await agent.delete(`${path}/series/${sId}?version=1`).expect(409);
    await agent.delete(`${path}/series/${sId}?version=2`).expect(204);
    await agent.patch(path).send({ nota: 'nota', version: 1 }).expect(200);
    const erConflict = await agent.delete(`${path}?version=1`).expect(409);
    expect(erConflict.body.actual).toMatchObject({ ejercicioId: ex, nota: 'nota', version: 2 });
    await agent.delete(`${path}?version=2`).expect(204);
    const note = await agent.patch(`/api/entrenamientos/${id}`).send({ nota: 'conservada', version: 1 }).expect(200);
    const finish = await agent.post(`/api/entrenamientos/${id}/finalizar`).send({ version: 1 }).expect(409);
    expect(finish.body.actual).toMatchObject({ zonaHoraria: 'America/Bogota', nota: 'conservada', version: note.body.version });
    await agent.delete(`/api/entrenamientos/${id}?version=1`).expect(409);
    await agent.delete(`/api/entrenamientos/${id}?version=${note.body.version}`).expect(204);
  });

  it.each([false, true])('creación concurrente preserva propietario y datos (otra cuenta: %s)', async (otraCuenta) => {
    const a = await login('t013.a@example.invalid');
    const b = otraCuenta ? await login('t013.b@example.invalid') : a;
    const id = '20000000-0000-4000-8000-000000000123';
    const entradas = [
      { id, inicio: '2026-11-10T18:00:00Z', zonaHoraria: 'America/Bogota', nota: 'datos de A' },
      { id, inicio: '2026-11-09T16:00:00Z', zonaHoraria: 'UTC', nota: 'datos de B' },
    ];
    const repo = source.getRepository(Entrenamiento);
    // Fuerza la ventana peligrosa del código anterior sin simular SQL: el primer save
    // se retrasa hasta que el segundo ha insertado. La implementación atómica no usa save.
    const guardar = repo.save.bind(repo);
    let primera = true;
    let liberar!: () => void;
    const puerta = new Promise<void>((resolve) => { liberar = resolve; });
    let original: unknown;
    const save = jest.spyOn(repo, 'save').mockImplementation(async (entrada) => {
      if (primera) { primera = false; await puerta; return guardar(entrada); }
      try {
        const result = await guardar(entrada);
        [original] = await source.query('SELECT * FROM entrenamiento WHERE id=$1', [id]);
        return result;
      } finally { liberar(); }
    });
    let responses;
    try {
      responses = await Promise.all([a.post('/api/entrenamientos').send(entradas[0]), b.post('/api/entrenamientos').send(entradas[1])]);
    } finally { save.mockRestore(); }
    const [row] = await source.query('SELECT * FROM entrenamiento WHERE id=$1', [id]);
    if (original) expect(row).toEqual(original);
    expect(responses.map(({ status }) => status).sort()).toEqual(otraCuenta ? [201, 404] : [200, 201]);
    const ganador = responses.findIndex(({ status }) => status === 201);
    expect(row).toMatchObject({ usuario_id: otraCuenta && ganador === 1 ? usuarioB : usuarioA,
      inicio: new Date(entradas[ganador].inicio), ultima_actividad_en: new Date(entradas[ganador].inicio),
      zona_horaria: entradas[ganador].zonaHoraria, nota: entradas[ganador].nota,
      estado: 'en_curso', fin: null, rutina_origen_id: null, version: 1 });
    const snapshot = structuredClone(row);
    const propietario = ganador === 0 ? a : b;
    await propietario.post('/api/entrenamientos').send({ ...entradas[1 - ganador], nota: 'un reintento no debe modificar' }).expect(200);
    if (otraCuenta) {
      const ajeno = ganador === 0 ? b : a;
      await ajeno.post('/api/entrenamientos').send({ ...entradas[0], id: '20000000-0000-4000-8000-000000000124' }).expect(201);
      // El UUID ajeno sigue siendo 404 aunque esta cuenta ya tenga una sesión activa.
      await ajeno.post('/api/entrenamientos').send(entradas[ganador]).expect(404);
    }
    const [preservado] = await source.query('SELECT * FROM entrenamiento WHERE id=$1', [id]);
    expect(preservado).toEqual(snapshot);
    const [{ total }] = await source.query('SELECT count(*)::int AS total FROM entrenamiento WHERE id=$1', [id]);
    expect(total).toBe(1);
  });

});
