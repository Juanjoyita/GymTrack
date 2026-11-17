import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, limpiarEsquemaIntegracion, prepararEsquemaIntegracion } from '../utils/infraestructura';

const contrasena = 'T054-rutinas-pruebas-2026!';

describe('T054: propiedad y comienzo desde rutina', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let usuarioA: { id: string; email: string; ejercicioId: string };
  let usuarioB: { id: string; email: string; ejercicioId: string };
  let ejercicioCatalogoId: string;

  const cliente = () => {
    if (!app) throw new Error('Aplicación de prueba no inicializada.');
    return peticionHttps(app);
  };

  async function login(email: string) {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email, contrasena }).expect(200);
    return agent;
  }

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    usuarioA = { id: randomUUID(), email: `t054.a.${randomUUID()}@example.invalid`, ejercicioId: randomUUID() };
    usuarioB = { id: randomUUID(), email: `t054.b.${randomUUID()}@example.invalid`, ejercicioId: randomUUID() };
    const hashPrueba = await hash(contrasena, { type: argon2id });
    await source.query(
      `INSERT INTO usuario (id,email,hash_contrasena,zona_horaria)
       VALUES ($1,$2,$3,'America/Bogota'),($4,$5,$3,'America/Bogota')`,
      [usuarioA.id, usuarioA.email, hashPrueba, usuarioB.id, usuarioB.email],
    );
    await source.query(
      `INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular)
       VALUES ($1,$2,'Privado A T054','privado a t054','pecho'),
              ($3,$4,'Privado B T054','privado b t054','pecho')`,
      [usuarioA.ejercicioId, usuarioA.id, usuarioB.ejercicioId, usuarioB.id],
    );
    const [catalogo] = await source.query<Array<{ id: string }>>(
      'SELECT id FROM ejercicio WHERE usuario_id IS NULL ORDER BY nombre LIMIT 1',
    );
    if (!catalogo) throw new Error('El catálogo de pruebas no contiene ejercicios.');
    ejercicioCatalogoId = catalogo.id;

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

  it('oculta rutinas y ejercicios ajenos, conserva versión y referencias al ejercicio usado', async () => {
    const agentA = await login(usuarioA.email);
    const agentB = await login(usuarioB.email);
    const rutina = await agentA.post('/api/rutinas').send({
      nombre: 'Privada T054', diaSemana: 1, ejercicioIds: [usuarioA.ejercicioId],
    }).expect(201);

    await agentB.get(`/api/rutinas/${rutina.body.id}`).expect(404);
    await agentB.post('/api/rutinas').send({
      nombre: 'Con ejercicio ajeno', diaSemana: 1, ejercicioIds: [usuarioA.ejercicioId],
    }).expect(404);
    await agentA.patch(`/api/rutinas/${rutina.body.id}`).send({
      ejercicioIds: [usuarioB.ejercicioId], version: rutina.body.version,
    }).expect(404);
    expect((await agentA.get(`/api/rutinas/${rutina.body.id}`).expect(200)).body.ejercicios)
      .toMatchObject([{ ejercicioId: usuarioA.ejercicioId }]);

    const actualizada = await agentA.patch(`/api/rutinas/${rutina.body.id}`).send({
      nombre: 'Renombrada', version: rutina.body.version,
    }).expect(200);
    expect(actualizada.body.version).toBe(rutina.body.version + 1);
    const conflicto = await agentA.patch(`/api/rutinas/${rutina.body.id}`).send({
      diaSemana: 2, version: rutina.body.version,
    }).expect(409);
    expect(conflicto.body).toMatchObject({ codigo: 'CONFLICTO_VERSION', actual: { version: actualizada.body.version } });
    await agentA.delete(`/api/rutinas/${rutina.body.id}?version=${rutina.body.version}`).expect(409);

    const ejercicioEnUso = await agentA.delete(`/api/ejercicios/${usuarioA.ejercicioId}`).expect(409);
    expect(ejercicioEnUso.body).toMatchObject({
      codigo: 'EJERCICIO_EN_USO', actual: { rutinas: ['Renombrada'] },
    });
  });

  it('copia ejercicios en orden, rechaza una segunda sesión activa y conserva la copia al borrar rutina', async () => {
    const agentA = await login(usuarioA.email);
    const agenteRutinaAjena = await login(usuarioB.email);
    const rutinaAjena = await agenteRutinaAjena.post('/api/rutinas').send({
      nombre: 'Rutina B', diaSemana: 2, ejercicioIds: [ejercicioCatalogoId],
    }).expect(201);
    const noPropia = await agentA.post('/api/entrenamientos').send({
      id: randomUUID(), inicio: new Date().toISOString(), zonaHoraria: 'America/Bogota', rutinaId: rutinaAjena.body.id,
    }).expect(404);
    expect(noPropia.body.codigo).toBe('NO_ENCONTRADO');

    const rutina = await agentA.post('/api/rutinas').send({
      nombre: 'Orden T054', diaSemana: 3, ejercicioIds: [ejercicioCatalogoId, usuarioA.ejercicioId],
    }).expect(201);
    const respuestas = await Promise.all([randomUUID(), randomUUID()].map((id) => agentA.post('/api/entrenamientos').send({
      id, inicio: new Date().toISOString(), zonaHoraria: 'America/Bogota', rutinaId: rutina.body.id,
    }).ok(() => true).then((respuesta) => respuesta)));
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    const creada = respuestas.find(({ status }) => status === 201);
    const conflictoActivo = respuestas.find(({ status }) => status === 409);
    if (!creada || !conflictoActivo) throw new Error('La restricción de sesión única no rechazó exactamente una solicitud.');
    expect(creada.body.rutinaOrigenId).toBe(rutina.body.id);
    expect(creada.body.ejercicios.map((ejercicio: { ejercicioId: string; posicion: number; series: unknown[] }) => [
      ejercicio.posicion, ejercicio.ejercicioId, ejercicio.series.length,
    ])).toEqual([[1, ejercicioCatalogoId, 0], [2, usuarioA.ejercicioId, 0]]);

    expect(conflictoActivo.body).toMatchObject({
      codigo: 'ENTRENAMIENTO_EN_CURSO', actual: { id: creada.body.id },
    });
    const conteo = await source.query<Array<{ total: number }>>(
      'SELECT count(*)::int AS total FROM ejercicio_realizado WHERE entrenamiento_id=$1', [creada.body.id],
    );
    expect(conteo[0].total).toBe(2);

    await agentA.delete(`/api/rutinas/${rutina.body.id}?version=${rutina.body.version}`).expect(204);
    const activa = await agentA.get('/api/entrenamientos/en-curso').expect(200);
    expect(activa.body.rutinaOrigenId).toBeNull();
    expect(activa.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId))
      .toEqual([ejercicioCatalogoId, usuarioA.ejercicioId]);
  });
});
