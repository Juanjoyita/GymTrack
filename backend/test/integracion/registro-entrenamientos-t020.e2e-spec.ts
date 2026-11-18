import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { EjerciciosRealizadosService } from '../../src/entrenamientos/ejercicios-realizados.service';
import { SeriesService } from '../../src/entrenamientos/series.service';
import { SesionesService } from '../../src/entrenamientos/sesiones.service';
import { UltimaSesionService } from '../../src/ejercicios/ultima-sesion.service';
import { Ejercicio } from '../../src/database/entities/ejercicio';
import { EjercicioRealizado } from '../../src/database/entities/ejercicio_realizado';
import { Entrenamiento } from '../../src/database/entities/entrenamiento';
import { Serie } from '../../src/database/entities/serie';
import { fuenteDatosIntegracion, limpiarEsquemaIntegracion, prepararEsquemaIntegracion } from '../utils/infraestructura';

describe('T020–T022: PostgreSQL real en esquema aislado', () => {
  let source: DataSource;
  let ownsSchema = false;
  const userA = randomUUID();
  const userB = randomUUID();
  let exerciseId: string;
  let realizados: EjerciciosRealizadosService;
  let series: SeriesService;
  let sesiones: SesionesService;
  let ultimaSesion: UltimaSesionService;

  beforeAll(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    await source.query(
      `INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES
       ($1,'t020.a@example.invalid','hash-sintetico','UTC'),($2,'t020.b@example.invalid','hash-sintetico','UTC')`, [userA, userB],
    );
    exerciseId = randomUUID();
    await source.query(
      `INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular)
       VALUES ($1,$2,'Ejercicio T020','ejercicio t020','pecho')`, [exerciseId, userA],
    );
    realizados = new EjerciciosRealizadosService(
      source.getRepository(Entrenamiento), source.getRepository(EjercicioRealizado), source.getRepository(Ejercicio),
    );
    series = new SeriesService(source.getRepository(Serie), source);
    sesiones = new SesionesService(source.getRepository(Entrenamiento), source);
    ultimaSesion = new UltimaSesionService(source);
  }, 30000);

  afterAll(async () => {
    try { if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source); }
    finally { ownsSchema = false; if (source?.isInitialized) await source.destroy(); }
  });

  async function crearEntrenamiento(usuarioId = userA, estado: 'en_curso' | 'finalizado' = 'finalizado', inicioTexto = '2026-11-13T18:00:00.000Z') {
    const id = randomUUID();
    const inicio = new Date(inicioTexto);
    await source.query(
      `INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
       VALUES ($1,$2,$3,$4,$5,'UTC',$4)`,
      [id, usuarioId, estado, inicio, estado === 'finalizado' ? new Date(inicio.getTime() + 60 * 60 * 1000) : null],
    );
    return id;
  }

  async function crearER(entrenamientoId: string) {
    const id = randomUUID();
    await source.query('INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)', [id, entrenamientoId, exerciseId]);
    return id;
  }

  const entrada = (id: string, orden = 1, repeticiones = 8, peso = 60) => ({
    id, orden, repeticiones, pesoEntrada: { valor: peso, unidad: 'kg' as const }, registradaEn: '2026-11-13T18:30:00.000Z',
  });

  it('resuelve UUID concurrente solo para la misma operación y jerarquía', async () => {
    const workout = await crearEntrenamiento();
    const erId = randomUUID();
    const [first, retry] = await Promise.all([
      realizados.crear(userA, workout, { id: erId, ejercicioId: exerciseId, posicion: 1 }),
      realizados.crear(userA, workout, { id: erId, ejercicioId: exerciseId, posicion: 1 }),
    ]);
    expect([first.id, retry.id]).toEqual([erId, erId]);
    const [{ count }] = await source.query('SELECT count(*)::int AS count FROM ejercicio_realizado WHERE id=$1', [erId]);
    expect(count).toBe(1);
    const otherWorkout = await crearEntrenamiento();
    await expect(realizados.crear(userA, otherWorkout, { id: erId, ejercicioId: exerciseId, posicion: 1 }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('mantiene una serie por UUID, conserva series distintas y serializa conflictos de versión', async () => {
    const workout = await crearEntrenamiento();
    const erId = await crearER(workout);
    const sameId = randomUUID();
    const [first, retry] = await Promise.all([
      series.crear(userA, workout, erId, entrada(sameId)),
      series.crear(userA, workout, erId, entrada(sameId)),
    ]);
    expect([first.creado, retry.creado].sort()).toEqual([false, true]);
    const foreignWorkout = await crearEntrenamiento();
    const foreignER = await crearER(foreignWorkout);
    await expect(series.crear(userA, foreignWorkout, foreignER, entrada(sameId))).rejects.toMatchObject({ status: 404 });
    const ids = [randomUUID(), randomUUID()];
    await Promise.all(ids.map((id, index) => series.crear(userA, workout, erId, entrada(id, index + 2, 10 + index, 50 + index))));
    const [{ count }] = await source.query('SELECT count(*)::int AS count FROM serie WHERE ejercicio_realizado_id=$1', [erId]);
    expect(count).toBe(3);

    const results = await Promise.allSettled([
      series.actualizar(userA, workout, erId, sameId, { version: 1, repeticiones: 9 }),
      series.actualizar(userA, workout, erId, sameId, { version: 1, repeticiones: 10 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [updated] = await source.query('SELECT version,repeticiones FROM serie WHERE id=$1', [sameId]);
    expect(updated.version).toBe(2);
    await expect(series.eliminar(userA, workout, erId, sameId, 1)).rejects.toMatchObject({ status: 409 });
    await series.eliminar(userA, workout, erId, sameId, 2);
    const deleted = await source.query('SELECT id FROM serie WHERE id=$1', [sameId]);
    expect(deleted).toHaveLength(0);
    await expect(series.eliminar(userA, workout, erId, sameId, 2)).rejects.toMatchObject({ status: 404 });
  });

  it('protege PATCH/DELETE de ejercicios realizados por versión y conserva el estado ante conflictos', async () => {
    const workout = await crearEntrenamiento();
    const erId = randomUUID();
    await realizados.crear(userA, workout, { id: erId, ejercicioId: exerciseId, posicion: 1 });
    const serieId = randomUUID();
    await series.crear(userA, workout, erId, entrada(serieId));
    const results = await Promise.allSettled([
      realizados.actualizar(userA, workout, erId, { version: 1, nota: 'primera' }),
      realizados.actualizar(userA, workout, erId, { version: 1, posicion: 2 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [current] = await source.query('SELECT version FROM ejercicio_realizado WHERE id=$1', [erId]);
    expect(current.version).toBe(2);
    await expect(realizados.eliminar(userA, workout, erId, 1)).rejects.toMatchObject({ status: 409 });
    await realizados.eliminar(userA, workout, erId, 2);
    expect(await source.query('SELECT id FROM serie WHERE id=$1', [serieId])).toHaveLength(0);
    await expect(realizados.eliminar(userA, workout, erId, 2)).rejects.toMatchObject({ status: 404 });
  });

  it('actualiza y descarta entrenamientos con versión condicional y elimina cascadas', async () => {
    const workout = await crearEntrenamiento();
    await expect(sesiones.actualizarNota(userA, workout, 'nota actualizada', 1)).resolves.toMatchObject({ nota: 'nota actualizada', version: 2 });
    await expect(sesiones.actualizarNota(userA, workout, 'nota obsoleta', 1)).rejects.toMatchObject({ status: 409 });
    const [unchanged] = await source.query('SELECT nota,version FROM entrenamiento WHERE id=$1', [workout]);
    expect(unchanged).toEqual({ nota: 'nota actualizada', version: 2 });

    await expect(sesiones.descartar(userA, workout, 1)).rejects.toMatchObject({ status: 409 });
    await sesiones.descartar(userA, workout, 2);
    await expect(sesiones.descartar(userA, workout, 2)).rejects.toMatchObject({ status: 404 });
  });

  it('recupera solo la última sesión finalizada propia, excluye la actual y ordena series', async () => {
    const current = await crearEntrenamiento(userA, 'en_curso', '2026-11-14T19:00:00.000Z');
    const historical = await crearEntrenamiento(userA, 'finalizado', '2026-11-14T18:00:00.000Z');
    const currentER = await crearER(current);
    await series.crear(userA, current, currentER, entrada(randomUUID(), 1, 5, 30));
    const historicalER = await crearER(historical);
    await series.crear(userA, historical, historicalER, entrada(randomUUID(), 2, 8, 65));
    await series.crear(userA, historical, historicalER, entrada(randomUUID(), 1, 10, 60));
    const actual = await ultimaSesion.obtener(userA, exerciseId, current);
    expect(actual).toMatchObject({ entrenamientoId: historical, series: [
      { orden: 1, repeticiones: 10, pesoKg: 60 }, { orden: 2, repeticiones: 8, pesoKg: 65 },
    ] });
    await expect(ultimaSesion.obtener(userB, exerciseId)).rejects.toMatchObject({ status: 404 });
  });
});
