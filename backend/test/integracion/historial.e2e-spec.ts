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

const password = 'T030-solo-pruebas-2026!';
const usuarioA = '00000000-0000-4000-8000-000000000030';
const usuarioB = '00000000-0000-4000-8000-000000000031';

describe('T030: aceptación REST del historial', () => {
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
    await source.query(
      'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4),($5,$6,$3,$4)',
      [usuarioA, 't030.a@example.invalid', hashPrueba, 'America/Bogota', usuarioB, 't030.b@example.invalid'],
    );
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

  async function sembrarSesion(usuarioId: string, inicio: string, ejercicios: Array<{
    nombre: string; posicion: number; series: Array<{ orden: number; peso: number; repeticiones: number }>;
  }>, opciones: { estado?: 'finalizado' | 'en_curso'; fin?: string | null; id?: string } = {}) {
    const id = opciones.id ?? randomUUID();
    const fin = opciones.fin === undefined ? new Date(new Date(inicio).getTime() + 60 * 60_000).toISOString() : opciones.fin;
    await source.query(
      `INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
       VALUES ($1,$2,$3,$4,$5,'America/Bogota',$4)`,
      [id, usuarioId, opciones.estado ?? 'finalizado', inicio, opciones.estado === 'en_curso' ? null : fin],
    );
    for (const ejercicio of ejercicios) {
      const [catalogo] = await source.query<Array<{ id: string }>>('SELECT id FROM ejercicio WHERE nombre=$1 AND usuario_id IS NULL', [ejercicio.nombre]);
      if (!catalogo) throw new Error(`Ejercicio de fixture no encontrado: ${ejercicio.nombre}`);
      const ejercicioRealizadoId = randomUUID();
      await source.query(
        'INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,$4)',
        [ejercicioRealizadoId, id, catalogo.id, ejercicio.posicion],
      );
      for (const serie of ejercicio.series) {
        await source.query(
          `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), ejercicioRealizadoId, serie.orden, serie.repeticiones, serie.peso, inicio],
        );
      }
    }
    return id;
  }

  it('lista solo sesiones propias finalizadas, ordena y pagina con cursor estable y resumen exacto', async () => {
    const older = await sembrarSesion(usuarioA, '2026-11-10T04:30:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 60, repeticiones: 8 }] },
    ]);
    const sameStartA = await sembrarSesion(usuarioA, '2026-11-12T18:00:00.000Z', [
      { nombre: 'Sentadilla', posicion: 1, series: [{ orden: 1, peso: 100, repeticiones: 5 }] },
    ], { id: '00000000-0000-4000-8000-000000000032' });
    const sameStartB = await sembrarSesion(usuarioA, '2026-11-12T18:00:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [
        { orden: 2, peso: 60, repeticiones: 8 },
        { orden: 1, peso: 62.5, repeticiones: 8 },
      ] },
      { nombre: 'Sentadilla', posicion: 2, series: [{ orden: 1, peso: 100, repeticiones: 5 }] },
    ], { id: '00000000-0000-4000-8000-000000000033' });
    const inCourse = await sembrarSesion(usuarioA, '2026-11-14T18:00:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 50, repeticiones: 8 }] },
    ], { estado: 'en_curso' });
    const foreign = await sembrarSesion(usuarioB, '2026-11-15T18:00:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 200, repeticiones: 1 }] },
    ]);

    const agent = await login('t030.a@example.invalid');
    const primera = await agent.get('/api/entrenamientos?limite=2').expect(200);
    expect(primera.body.elementos.map((entrenamiento: { id: string }) => entrenamiento.id))
      .toEqual([sameStartB, sameStartA]);
    expect(primera.body.elementos[0]).toMatchObject({
      resumen: { ejercicios: 2, series: 3, volumenKg: 1480, duracionMin: 60 },
    });
    expect(primera.body.siguienteCursor).toEqual(expect.any(String));
    const segunda = await agent.get(`/api/entrenamientos?limite=2&cursor=${encodeURIComponent(primera.body.siguienteCursor)}`).expect(200);
    expect(segunda.body.elementos.map((entrenamiento: { id: string }) => entrenamiento.id)).toEqual([older]);
    expect(segunda.body.siguienteCursor).toBeNull();
    expect([inCourse, foreign]).not.toContain(primera.body.elementos[0].id);
  });

  it('combina ejercicio y días locales de Bogotá, incluido el borde de medianoche', async () => {
    const midnight = await sembrarSesion(usuarioA, '2026-11-10T04:30:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 60, repeticiones: 8 }] },
    ]);
    await sembrarSesion(usuarioA, '2026-11-10T04:30:00.000Z', [
      { nombre: 'Sentadilla', posicion: 1, series: [{ orden: 1, peso: 100, repeticiones: 5 }] },
    ]);
    await sembrarSesion(usuarioA, '2026-11-11T04:30:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 60, repeticiones: 8 }] },
    ]);

    const result = await (await login('t030.a@example.invalid'))
      .get('/api/entrenamientos?ejercicioId=c0000000-0000-4000-8000-000000000001&desde=2026-11-09&hasta=2026-11-09')
      .expect(200);
    expect(result.body.elementos.map((entrenamiento: { id: string }) => entrenamiento.id)).toEqual([midnight]);
  });

  it('devuelve detalle ordenado y oculta sesiones ajenas o inexistentes', async () => {
    const id = await sembrarSesion(usuarioA, '2026-11-12T18:00:00.000Z', [
      { nombre: 'Sentadilla', posicion: 2, series: [{ orden: 1, peso: 100, repeticiones: 5 }] },
      { nombre: 'Press de banca', posicion: 1, series: [
        { orden: 2, peso: 60, repeticiones: 8 },
        { orden: 1, peso: 62.5, repeticiones: 8 },
      ] },
    ]);
    const ajena = await sembrarSesion(usuarioB, '2026-11-12T18:00:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 200, repeticiones: 1 }] },
    ]);

    const result = await (await login('t030.a@example.invalid')).get(`/api/entrenamientos/${id}`).expect(200);
    expect(result.body).toMatchObject({
      id, estado: 'finalizado', resumen: { ejercicios: 2, series: 3, volumenKg: 1480, duracionMin: 60 },
      ejercicios: [
        { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, pesoKg: 62.5 }, { orden: 2, pesoKg: 60 }] },
        { nombre: 'Sentadilla', posicion: 2 },
      ],
    });
    const other = await login('t030.b@example.invalid');
    await other.get(`/api/entrenamientos/${id}`).expect(404);
    await other.patch(`/api/entrenamientos/${id}`).send({ nota: 'ajena', version: 1 }).expect(404);
    await other.delete(`/api/entrenamientos/${id}?version=1`).expect(404);
    await (await login('t030.a@example.invalid')).get(`/api/entrenamientos/${randomUUID()}`).expect(404);
    expect(ajena).toEqual(expect.any(String));
    const [persistida] = await source.query<Array<{ nota: string | null }>>('SELECT nota FROM entrenamiento WHERE id=$1', [id]);
    expect(persistida.nota).toBeNull();
  });

  it('edita una sesión finalizada, recalcula el resumen y borra solo la versión confirmada', async () => {
    const id = await sembrarSesion(usuarioA, '2026-11-12T18:00:00.000Z', [
      { nombre: 'Press de banca', posicion: 1, series: [{ orden: 1, peso: 60, repeticiones: 8 }] },
    ]);
    const agent = await login('t030.a@example.invalid');
    const detalle = await agent.get(`/api/entrenamientos/${id}`).expect(200);
    const serie = detalle.body.ejercicios[0].series[0];
    const actualizado = await agent.patch(`/api/entrenamientos/${id}/ejercicios/${detalle.body.ejercicios[0].id}/series/${serie.id}`)
      .send({ repeticiones: 9, version: serie.version }).expect(200);
    expect(actualizado.body).toMatchObject({ repeticiones: 9, version: serie.version + 1 });
    const ejercicioActualizado = await agent.patch(`/api/entrenamientos/${id}/ejercicios/${detalle.body.ejercicios[0].id}`)
      .send({ nota: 'Ajuste de ejercicio', version: detalle.body.ejercicios[0].version }).expect(200);
    expect(ejercicioActualizado.body).toMatchObject({
      nota: 'Ajuste de ejercicio',
      version: detalle.body.ejercicios[0].version + 1,
    });
    const nota = await agent.patch(`/api/entrenamientos/${id}`)
      .send({ nota: 'Corrección de historial', version: detalle.body.version }).expect(200);
    expect(nota.body.nota).toBe('Corrección de historial');
    const listado = await agent.get('/api/entrenamientos?limite=20').expect(200);
    expect(listado.body.elementos[0].resumen).toMatchObject({ series: 1, volumenKg: 540 });

    await agent.delete(`/api/entrenamientos/${id}?version=${nota.body.version - 1}`).expect(409);
    await agent.get(`/api/entrenamientos/${id}`).expect(200);
    await agent.delete(`/api/entrenamientos/${id}?version=${nota.body.version}`).expect(204);
    await agent.get(`/api/entrenamientos/${id}`).expect(404);
  });

  it('devuelve vacío, valida filtros/paginación y exige autenticación', async () => {
    const agent = await login('t030.a@example.invalid');
    await agent.get('/api/entrenamientos').expect(200, { elementos: [], siguienteCursor: null });
    for (const query of ['limite=0', 'limite=101', 'limite=abc', 'desde=2026-11-12&hasta=2026-11-11', 'desde=ayer']) {
      const response = await agent.get(`/api/entrenamientos?${query}`).expect(400);
      expect(response.body.codigo).toBe('VALIDACION');
    }
    await cliente().get('/api/entrenamientos').expect(401);
  });
});
