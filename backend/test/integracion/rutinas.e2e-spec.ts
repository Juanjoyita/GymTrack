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
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

const contrasena = 'T051-solo-pruebas-2026!';

describe('T051: aceptación REST US5', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let usuarioA: { id: string; email: string; ejercicioPropio: string };
  let usuarioB: { id: string; email: string; ejercicioPropio: string };
  let ejerciciosCatalogo: string[];
  let hashPrueba: string;

  const cliente = () => {
    if (!app) throw new Error('Aplicación de prueba no inicializada.');
    return peticionHttps(app);
  };

  async function login(usuario: { email: string }) {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email: usuario.email, contrasena }).expect(200);
    return agent;
  }

  async function crearRutina(
    agent: ReturnType<typeof cliente>,
    nombre: string,
    diaSemana: number,
    ejercicioIds: string[],
  ) {
    return agent.post('/api/rutinas').send({ nombre, diaSemana, ejercicioIds }).expect(201);
  }

  beforeAll(async () => { hashPrueba = await hash(contrasena, { type: argon2id }); });

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();

    usuarioA = { id: randomUUID(), email: `t051.a.${randomUUID()}@example.invalid`, ejercicioPropio: randomUUID() };
    usuarioB = { id: randomUUID(), email: `t051.b.${randomUUID()}@example.invalid`, ejercicioPropio: randomUUID() };
    await source.query(
      'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4),($5,$6,$3,$4)',
      [usuarioA.id, usuarioA.email, hashPrueba, 'America/Bogota', usuarioB.id, usuarioB.email],
    );
    for (const usuario of [usuarioA, usuarioB]) {
      await source.query(
        `INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular)
         VALUES ($1,$2,$3,$4,'pecho')`,
        [usuario.ejercicioPropio, usuario.id, `Ejercicio privado ${usuario.id}`, `ejercicio privado ${usuario.id}`],
      );
    }
    const catalogo = await source.query<Array<{ id: string }>>(
      'SELECT id FROM ejercicio WHERE usuario_id IS NULL ORDER BY nombre LIMIT 4',
    );
    if (catalogo.length < 4) throw new Error('El catálogo de pruebas requiere al menos cuatro ejercicios.');
    ejerciciosCatalogo = catalogo.map(({ id }) => id);

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

  it('valida días y rutinas no vacías; ejecuta CRUD, orden y aislamiento por propietario', async () => {
    const agentA = await login(usuarioA);
    const agentB = await login(usuarioB);

    await cliente().get('/api/rutinas').expect(401);
    for (const diaSemana of [0, 8]) {
      const invalid = await agentA.post('/api/rutinas')
        .send({ nombre: 'Día inválido', diaSemana, ejercicioIds: [ejerciciosCatalogo[0]] })
        .expect(400);
      expect(invalid.body.codigo).toBe('VALIDACION');
    }
    const vacia = await agentA.post('/api/rutinas')
      .send({ nombre: 'Vacía', diaSemana: 1, ejercicioIds: [] })
      .expect(400);
    expect(vacia.body.codigo).toBe('VALIDACION');

    const zeta = await crearRutina(agentA, 'Zeta', 1, [
      ejerciciosCatalogo[2], usuarioA.ejercicioPropio, ejerciciosCatalogo[0],
    ]);
    expect(zeta.body.ejercicios.map((ejercicio: { ejercicioId: string; posicion: number }) =>
      [ejercicio.posicion, ejercicio.ejercicioId]))
      .toEqual([[1, ejerciciosCatalogo[2]], [2, usuarioA.ejercicioPropio], [3, ejerciciosCatalogo[0]]]);

    const alfa = await crearRutina(agentA, 'Alfa', 1, [ejerciciosCatalogo[1]]);
    const jueves = await crearRutina(agentA, 'Jueves', 4, [ejerciciosCatalogo[3]]);
    const rutinaAjena = await crearRutina(agentB, 'Privada', 2, [ejerciciosCatalogo[0]]);
    const listaA = await agentA.get('/api/rutinas').expect(200);
    expect(listaA.body.map((rutina: { nombre: string }) => rutina.nombre)).toEqual(['Alfa', 'Zeta', 'Jueves']);
    expect((await agentB.get('/api/rutinas').expect(200)).body.map((rutina: { id: string }) => rutina.id))
      .toEqual([rutinaAjena.body.id]);

    const actualizada = await agentA.patch(`/api/rutinas/${zeta.body.id}`).send({
      nombre: 'Zeta editada',
      diaSemana: 7,
      ejercicioIds: [ejerciciosCatalogo[0], ejerciciosCatalogo[2]],
      version: zeta.body.version,
    }).expect(200);
    expect(actualizada.body).toMatchObject({ nombre: 'Zeta editada', diaSemana: 7 });
    expect(actualizada.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId))
      .toEqual([ejerciciosCatalogo[0], ejerciciosCatalogo[2]]);
    expect((await agentA.get(`/api/rutinas/${zeta.body.id}`).expect(200)).body.version)
      .toBe(actualizada.body.version);

    for (const response of [
      agentB.get(`/api/rutinas/${zeta.body.id}`),
      agentB.patch(`/api/rutinas/${zeta.body.id}`).send({ nombre: 'Acceso ajeno', version: actualizada.body.version }),
      agentB.delete(`/api/rutinas/${zeta.body.id}?version=${actualizada.body.version}`),
    ]) await response.expect(404);

    await agentA.delete(`/api/rutinas/${zeta.body.id}?version=${actualizada.body.version}`).expect(204);
    await agentA.get(`/api/rutinas/${zeta.body.id}`).expect(404);
    expect((await agentB.get(`/api/rutinas/${rutinaAjena.body.id}`).expect(200)).body.nombre).toBe('Privada');
    expect(alfa.body.id).not.toBe(jueves.body.id);
  });

  it('inicia con ejercicios ordenados y mantiene independientes las rutinas y sesiones', async () => {
    const agentA = await login(usuarioA);
    const rutina = await crearRutina(agentA, 'Empuje', 1, [
      ejerciciosCatalogo[2], ejerciciosCatalogo[0], ejerciciosCatalogo[1],
    ]);
    const inicio = new Date().toISOString();
    const creada = await agentA.post('/api/entrenamientos').send({
      id: randomUUID(), inicio, zonaHoraria: 'America/Bogota', rutinaId: rutina.body.id,
    }).expect(201);
    expect(creada.body.rutinaOrigenId).toBe(rutina.body.id);
    expect(creada.body.ejercicios.map((ejercicio: { ejercicioId: string; posicion: number }) =>
      [ejercicio.posicion, ejercicio.ejercicioId]))
      .toEqual([[1, ejerciciosCatalogo[2]], [2, ejerciciosCatalogo[0]], [3, ejerciciosCatalogo[1]]]);
    expect(await source.query(
      `SELECT s.id FROM serie s
       JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id
       WHERE er.entrenamiento_id=$1`,
      [creada.body.id],
    )).toHaveLength(0);

    await agentA.post(`/api/entrenamientos/${creada.body.id}/ejercicios`).send({
      id: randomUUID(), ejercicioId: ejerciciosCatalogo[3], posicion: 4,
    }).expect(201);
    expect((await agentA.get(`/api/rutinas/${rutina.body.id}`).expect(200)).body.ejercicios)
      .toHaveLength(3);

    const editada = await agentA.patch(`/api/rutinas/${rutina.body.id}`).send({
      diaSemana: 5,
      ejercicioIds: [ejerciciosCatalogo[1], ejerciciosCatalogo[2]],
      version: rutina.body.version,
    }).expect(200);
    const detalleAntesDeBorrar = await agentA.get(`/api/entrenamientos/${creada.body.id}`).expect(200);
    expect(detalleAntesDeBorrar.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId))
      .toEqual([...rutina.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId), ejerciciosCatalogo[3]]);

    await agentA.delete(`/api/rutinas/${rutina.body.id}?version=${editada.body.version}`).expect(204);
    const detalleTrasBorrar = await agentA.get(`/api/entrenamientos/${creada.body.id}`).expect(200);
    expect(detalleTrasBorrar.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId))
      .toEqual(detalleAntesDeBorrar.body.ejercicios.map((ejercicio: { ejercicioId: string }) => ejercicio.ejercicioId));

    const agentB = await login(usuarioB);
    const rutinaB = await crearRutina(agentB, 'Tirón', 2, [ejerciciosCatalogo[0], ejerciciosCatalogo[1]]);
    const entrenamientoB = await agentB.post('/api/entrenamientos').send({
      id: randomUUID(), inicio: new Date().toISOString(), zonaHoraria: 'America/Bogota', rutinaId: rutinaB.body.id,
    }).expect(201);
    await agentB.delete(`/api/entrenamientos/${entrenamientoB.body.id}?version=${entrenamientoB.body.version}`).expect(204);
    expect((await agentB.get(`/api/rutinas/${rutinaB.body.id}`).expect(200)).body.ejercicios)
      .toHaveLength(2);
  });
});
