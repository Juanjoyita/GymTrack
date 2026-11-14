import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { normalizarNombre } from '@gymtrack/domain';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

// Datos sintéticos. Los nombres llevan «T014» para no coincidir con el catálogo de 50 ejercicios de T018.
const password = 'T014-solo-pruebas-2026!';
const usuarioA = { id: '00000000-0000-4000-8000-000000000141', email: 't014.a@example.invalid' };
const usuarioB = { id: '00000000-0000-4000-8000-000000000142', email: 't014.b@example.invalid' };
const catalogo = {
  elevacion: { id: '14000000-0000-4000-8000-000000000001', nombre: 'Elevación lateral T014', grupo: 'hombros' },
  remo: { id: '14000000-0000-4000-8000-000000000002', nombre: 'Remo T014 en polea', grupo: 'espalda' },
  curl: { id: '14000000-0000-4000-8000-000000000003', nombre: 'Curl T014 catálogo', grupo: 'biceps' },
};
const propioA = { id: '14000000-0000-4000-8000-000000000011', nombre: 'Mi press T014', grupo: 'pecho' };
const propioB = { id: '14000000-0000-4000-8000-000000000021', nombre: 'Sentadilla T014 de B', grupo: 'cuadriceps' };

describe('T014: aceptación REST del catálogo de ejercicios (rojo hasta T023)', () => {
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
      [usuarioA.id, usuarioA.email, hashPrueba, 'America/Bogota', usuarioB.id, usuarioB.email]);
    for (const ejercicio of Object.values(catalogo)) await insertarEjercicio(ejercicio, null);
    await insertarEjercicio(propioA, usuarioA.id);
    await insertarEjercicio(propioB, usuarioB.id);
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
  function insertarEjercicio(e: { id: string; nombre: string; grupo: string }, usuarioId: string | null) {
    return source.query('INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ($1,$2,$3,$4,$5)',
      [e.id, usuarioId, e.nombre, normalizarNombre(e.nombre), e.grupo]);
  }
  /** Entrenamiento finalizado con una serie del ejercicio; devuelve el id del entrenamiento. */
  async function registrarSerie(usuarioId: string, ejercicioId: string, registradaEn: string) {
    const entrenamientoId = randomUUID(); const realizadoId = randomUUID();
    const fin = new Date(new Date(registradaEn).getTime() + 30 * 60_000).toISOString();
    await source.query(`INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
      VALUES ($1,$2,'finalizado',$3,$4,'America/Bogota',$4)`, [entrenamientoId, usuarioId, registradaEn, fin]);
    await source.query('INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)', [realizadoId, entrenamientoId, ejercicioId]);
    await source.query('INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en) VALUES ($1,$2,1,8,60,$3)', [randomUUID(), realizadoId, registradaEn]);
    return entrenamientoId;
  }
  async function incluirEnRutina(usuarioId: string, nombre: string, ejercicioId: string) {
    const rutinaId = randomUUID();
    await source.query('INSERT INTO rutina (id,usuario_id,nombre,dia_semana) VALUES ($1,$2,$3,1)', [rutinaId, usuarioId, nombre]);
    await source.query('INSERT INTO rutina_ejercicio (rutina_id,posicion,ejercicio_id) VALUES ($1,1,$2)', [rutinaId, ejercicioId]);
  }
  async function existe(id: string) {
    const [{ total }] = await source.query('SELECT count(*)::int AS total FROM ejercicio WHERE id=$1', [id]);
    return total === 1;
  }
  type ItemEjercicio = { id: string; nombre: string; grupoMuscular: string; propio: boolean; ultimoUso: string | null };
  const ids = (lista: ItemEjercicio[]) => lista.map((e) => e.id);

  it('lista el catálogo global y los ejercicios propios del usuario con la forma del contrato', async () => {
    const a = await login(usuarioA.email);
    const { body } = await a.get('/api/ejercicios').expect(200);
    expect(body).toEqual(expect.arrayContaining([
      { id: catalogo.elevacion.id, nombre: catalogo.elevacion.nombre, grupoMuscular: 'hombros', propio: false, ultimoUso: null },
      { id: propioA.id, nombre: propioA.nombre, grupoMuscular: 'pecho', propio: true, ultimoUso: null },
    ]));
    expect(ids(body)).not.toContain(propioB.id);
  });

  it('busca sin distinguir mayúsculas ni tildes y solo devuelve coincidencias', async () => {
    const a = await login(usuarioA.email);
    for (const q of ['ELEVACIÓN', 'elevacion', 'eLeVaCiOn LaTeRaL t014']) {
      const { body } = await a.get('/api/ejercicios').query({ q }).expect(200);
      expect(ids(body)).toContain(catalogo.elevacion.id);
      for (const e of body as ItemEjercicio[]) expect(normalizarNombre(e.nombre)).toContain(normalizarNombre(q));
    }
    const propios = await a.get('/api/ejercicios').query({ q: 'MÍ PRESS' }).expect(200);
    expect(ids(propios.body)).toEqual([propioA.id]);
    const ajenos = await a.get('/api/ejercicios').query({ q: 'sentadilla t014' }).expect(200);
    expect(ajenos.body).toEqual([]);
  });

  it('respeta el parámetro limite', async () => {
    const a = await login(usuarioA.email);
    const { body } = await a.get('/api/ejercicios').query({ q: 't014', limite: 2 }).expect(200);
    expect(body).toHaveLength(2);
  });

  it('ordena primero los usados recientemente por el usuario y después alfabéticamente', async () => {
    await registrarSerie(usuarioA.id, catalogo.remo.id, '2026-11-01T18:00:00.000Z');
    await registrarSerie(usuarioA.id, propioA.id, '2026-11-08T18:00:00.000Z');
    await registrarSerie(usuarioA.id, catalogo.remo.id, '2026-11-05T18:00:00.000Z');
    // El uso de otro usuario no cuenta como reciente para A.
    await registrarSerie(usuarioB.id, catalogo.curl.id, '2026-11-10T18:00:00.000Z');
    const a = await login(usuarioA.email);
    const { body } = await a.get('/api/ejercicios').expect(200) as { body: ItemEjercicio[] };
    expect(ids(body.slice(0, 2))).toEqual([propioA.id, catalogo.remo.id]);
    expect(new Date(body[0].ultimoUso ?? '').toISOString()).toBe('2026-11-08T18:00:00.000Z');
    expect(new Date(body[1].ultimoUso ?? '').toISOString()).toBe('2026-11-05T18:00:00.000Z');
    const resto = body.slice(2);
    expect(resto.every((e) => e.ultimoUso === null)).toBe(true);
    // Comparación por inicial normalizada: independiente de la colación de PostgreSQL.
    const iniciales = resto.map((e) => normalizarNombre(e.nombre)[0]);
    expect(iniciales).toEqual([...iniciales].sort());
    const deB = await (await login(usuarioB.email)).get('/api/ejercicios').query({ q: 'curl t014' }).expect(200);
    expect(new Date(deB.body[0].ultimoUso).toISOString()).toBe('2026-11-10T18:00:00.000Z');
  });

  it('crea un ejercicio propio visible solo para su dueño y buscable de inmediato', async () => {
    const a = await login(usuarioA.email);
    const created = await a.post('/api/ejercicios').send({ nombre: '  Press en máquina Hammer T014  ', grupoMuscular: 'pecho' }).expect(201);
    expect(created.body).toEqual({ id: expect.any(String), nombre: 'Press en máquina Hammer T014', grupoMuscular: 'pecho', propio: true, ultimoUso: null });
    const [row] = await source.query('SELECT usuario_id, nombre_normalizado FROM ejercicio WHERE id=$1', [created.body.id]);
    expect(row).toEqual({ usuario_id: usuarioA.id, nombre_normalizado: normalizarNombre('Press en máquina Hammer T014') });
    const found = await a.get('/api/ejercicios').query({ q: 'maquina hammer' }).expect(200);
    expect(ids(found.body)).toEqual([created.body.id]);
    const b = await login(usuarioB.email);
    const ajeno = await b.get('/api/ejercicios').query({ q: 'maquina hammer' }).expect(200);
    expect(ajeno.body).toEqual([]);
  });

  it('rechaza nombre o grupo muscular inválidos con VALIDACION por campo', async () => {
    const a = await login(usuarioA.email);
    const casos = [
      { cuerpo: { nombre: '', grupoMuscular: 'pecho' }, campo: 'nombre' },
      { cuerpo: { nombre: '    ', grupoMuscular: 'pecho' }, campo: 'nombre' },
      { cuerpo: { nombre: 'x'.repeat(81), grupoMuscular: 'pecho' }, campo: 'nombre' },
      { cuerpo: { grupoMuscular: 'pecho' }, campo: 'nombre' },
      { cuerpo: { nombre: 'Cardio T014', grupoMuscular: 'cardio' }, campo: 'grupoMuscular' },
      { cuerpo: { nombre: 'Sin grupo T014' }, campo: 'grupoMuscular' },
    ];
    for (const { cuerpo, campo } of casos) {
      const response = await a.post('/api/ejercicios').send(cuerpo).expect(400);
      expect(response.body).toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) }, actual: null });
    }
    const limite = await a.post('/api/ejercicios').send({ nombre: 'y'.repeat(80), grupoMuscular: 'abdomen' }).expect(201);
    expect(limite.body.nombre).toHaveLength(80);
  });

  it('rechaza duplicados sin distinguir mayúsculas ni tildes y sugiere el existente', async () => {
    const a = await login(usuarioA.email);
    const propio = await a.post('/api/ejercicios').send({ nombre: 'MI PRÉSS t014', grupoMuscular: 'pecho' }).expect(409);
    expect(propio.body).toMatchObject({ codigo: 'EJERCICIO_DUPLICADO', actual: { id: propioA.id, nombre: propioA.nombre, propio: true } });
    const delCatalogo = await a.post('/api/ejercicios').send({ nombre: 'elevacion LATERAL t014', grupoMuscular: 'hombros' }).expect(409);
    expect(delCatalogo.body).toMatchObject({ codigo: 'EJERCICIO_DUPLICADO', actual: { id: catalogo.elevacion.id, nombre: catalogo.elevacion.nombre, propio: false } });
    const renombrar = await a.patch(`/api/ejercicios/${propioA.id}`).send({ nombre: 'Remo t014 EN POLEA' }).expect(409);
    expect(renombrar.body).toMatchObject({ codigo: 'EJERCICIO_DUPLICADO', actual: { id: catalogo.remo.id } });
    const [{ total }] = await source.query('SELECT count(*)::int AS total FROM ejercicio WHERE usuario_id=$1', [usuarioA.id]);
    expect(total).toBe(1);
    // Los propios de otro usuario no cuentan como duplicado.
    await a.post('/api/ejercicios').send({ nombre: propioB.nombre, grupoMuscular: 'cuadriceps' }).expect(201);
  });

  it('renombra y cambia el grupo de un ejercicio propio, aunque ya tenga series', async () => {
    await registrarSerie(usuarioA.id, propioA.id, '2026-11-08T18:00:00.000Z');
    const a = await login(usuarioA.email);
    const { body } = await a.patch(`/api/ejercicios/${propioA.id}`).send({ nombre: 'Press inclinado T014', grupoMuscular: 'hombros' }).expect(200);
    expect(body).toMatchObject({ id: propioA.id, nombre: 'Press inclinado T014', grupoMuscular: 'hombros', propio: true });
    const [row] = await source.query('SELECT nombre, nombre_normalizado, grupo_muscular FROM ejercicio WHERE id=$1', [propioA.id]);
    expect(row).toEqual({ nombre: 'Press inclinado T014', nombre_normalizado: normalizarNombre('Press inclinado T014'), grupo_muscular: 'hombros' });
    const found = await a.get('/api/ejercicios').query({ q: 'INCLINADO t014' }).expect(200);
    expect(ids(found.body)).toEqual([propioA.id]);
    const invalid = await a.patch(`/api/ejercicios/${propioA.id}`).send({ nombre: ' ' }).expect(400);
    expect(invalid.body.codigo).toBe('VALIDACION');
  });

  it('elimina un ejercicio propio sin series ni rutinas', async () => {
    const a = await login(usuarioA.email);
    await a.delete(`/api/ejercicios/${propioA.id}`).expect(204);
    expect(await existe(propioA.id)).toBe(false);
    const { body } = await a.get('/api/ejercicios').query({ q: 'mi press' }).expect(200);
    expect(body).toEqual([]);
    await a.delete(`/api/ejercicios/${propioA.id}`).expect(404);
  });

  it('bloquea eliminar un ejercicio propio con series e indica en cuántos entrenamientos aparece', async () => {
    await registrarSerie(usuarioA.id, propioA.id, '2026-11-01T18:00:00.000Z');
    await registrarSerie(usuarioA.id, propioA.id, '2026-11-08T18:00:00.000Z');
    const a = await login(usuarioA.email);
    const response = await a.delete(`/api/ejercicios/${propioA.id}`).expect(409);
    expect(response.body).toEqual({ codigo: 'EJERCICIO_EN_USO', mensaje: expect.any(String), campos: null, actual: { entrenamientos: 2, rutinas: [] } });
    expect(await existe(propioA.id)).toBe(true);
  });

  it('bloquea eliminar un ejercicio propio incluido en rutinas e indica cuáles', async () => {
    await incluirEnRutina(usuarioA.id, 'Pecho y tríceps', propioA.id);
    const a = await login(usuarioA.email);
    const response = await a.delete(`/api/ejercicios/${propioA.id}`).expect(409);
    expect(response.body).toEqual({ codigo: 'EJERCICIO_EN_USO', mensaje: expect.any(String), campos: null, actual: { entrenamientos: 0, rutinas: ['Pecho y tríceps'] } });
    expect(await existe(propioA.id)).toBe(true);
  });

  it('no permite modificar ni eliminar ejercicios del catálogo global', async () => {
    await registrarSerie(usuarioA.id, catalogo.curl.id, '2026-11-08T18:00:00.000Z');
    const a = await login(usuarioA.email);
    for (const id of [catalogo.elevacion.id, catalogo.curl.id]) {
      const patch = await a.patch(`/api/ejercicios/${id}`).send({ nombre: 'Renombrado T014', grupoMuscular: 'abdomen' }).expect(404);
      expect(patch.body.codigo).toBe('NO_ENCONTRADO');
      const del = await a.delete(`/api/ejercicios/${id}`).expect(404);
      expect(del.body.codigo).toBe('NO_ENCONTRADO');
    }
    const filas = await source.query('SELECT id, nombre, grupo_muscular, usuario_id FROM ejercicio WHERE usuario_id IS NULL ORDER BY id');
    expect(filas).toEqual(Object.values(catalogo).map((e) => ({ id: e.id, nombre: e.nombre, grupo_muscular: e.grupo, usuario_id: null })));
  });

  it('impide ver, renombrar o eliminar ejercicios propios de otro usuario', async () => {
    const b = await login(usuarioB.email);
    const lista = await b.get('/api/ejercicios').expect(200);
    expect(ids(lista.body)).not.toContain(propioA.id);
    const patch = await b.patch(`/api/ejercicios/${propioA.id}`).send({ nombre: 'Ajeno T014' }).expect(404);
    expect(patch.body.codigo).toBe('NO_ENCONTRADO');
    await b.delete(`/api/ejercicios/${propioA.id}`).expect(404);
    const [row] = await source.query('SELECT nombre, usuario_id FROM ejercicio WHERE id=$1', [propioA.id]);
    expect(row).toEqual({ nombre: propioA.nombre, usuario_id: usuarioA.id });
  });

  it('rechaza todas las operaciones del catálogo sin sesión', async () => {
    const anonimo = cliente();
    const respuestas = [
      await anonimo.get('/api/ejercicios'),
      await anonimo.post('/api/ejercicios').send({ nombre: 'Anónimo T014', grupoMuscular: 'pecho' }),
      await anonimo.patch(`/api/ejercicios/${propioA.id}`).send({ nombre: 'Anónimo T014' }),
      await anonimo.delete(`/api/ejercicios/${propioA.id}`),
    ];
    expect(respuestas.map((r) => [r.status, r.body.codigo])).toEqual(Array(4).fill([401, 'NO_AUTENTICADO']));
    expect(await existe(propioA.id)).toBe(true);
  });
});
