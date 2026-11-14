import { normalizarNombre } from '@gymtrack/domain';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { EjerciciosService } from '../../src/ejercicios/ejercicios.service';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

// Servicio aislado (sin controladores ni rutas, que se registran en T023) sobre PostgreSQL real
// con el catálogo de T018. Datos sintéticos.
const usuarioA = '00000000-0000-4000-8000-000000000191';
const usuarioB = '00000000-0000-4000-8000-000000000192';
const pressBanca = 'c0000000-0000-4000-8000-000000000001';
const remoBarra = 'c0000000-0000-4000-8000-000000000009';
const propioA = { id: '19000000-0000-4000-8000-000000000001', nombre: 'Mi press T019', grupo: 'pecho' };
const propioB = { id: '19000000-0000-4000-8000-000000000002', nombre: 'Remo de B T019', grupo: 'espalda' };

describe('T019: EjerciciosService', () => {
  let source: DataSource;
  let ownsSchema = false;
  let service: EjerciciosService;

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    await source.query("INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,'t019.a@example.invalid','hash-sintetico','UTC'),($2,'t019.b@example.invalid','hash-sintetico','UTC')", [usuarioA, usuarioB]);
    for (const [e, usuario] of [[propioA, usuarioA], [propioB, usuarioB]] as const) {
      await source.query('INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ($1,$2,$3,$4,$5)', [e.id, usuario, e.nombre, normalizarNombre(e.nombre), e.grupo]);
    }
    service = new EjerciciosService(source);
  });
  afterEach(async () => {
    try { if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source); }
    finally { ownsSchema = false; if (source?.isInitialized) await source.destroy(); }
  });

  async function registrarSerie(usuarioId: string, ejercicioId: string, registradaEn: string, conSerie = true) {
    const entrenamiento = randomUUID(); const realizado = randomUUID();
    await source.query(`INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en) VALUES ($1,$2,'finalizado',$3,$3,'UTC',$3)`, [entrenamiento, usuarioId, registradaEn]);
    await source.query('INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)', [realizado, entrenamiento, ejercicioId]);
    if (conSerie) await source.query('INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en) VALUES ($1,$2,1,8,60,$3)', [randomUUID(), realizado, registradaEn]);
  }
  const ids = (lista: { id: string }[]) => lista.map((e) => e.id);
  const error = (status: number, codigo: string, extra: object = {}) => ({ status, response: expect.objectContaining({ codigo, ...extra }) });

  describe('listar', () => {
    it('devuelve el catálogo y los propios con la forma del contrato, sin propios ajenos', async () => {
      const lista = await service.listar(usuarioA, { limite: '100' });
      expect(lista).toHaveLength(51);
      expect(lista).toContainEqual({ id: pressBanca, nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null });
      expect(lista).toContainEqual({ id: propioA.id, nombre: propioA.nombre, grupoMuscular: 'pecho', propio: true, ultimoUso: null });
      expect(ids(lista)).not.toContain(propioB.id);
    });

    it('limita a 20 por defecto y respeta limite', async () => {
      expect(await service.listar(usuarioA, {})).toHaveLength(20);
      expect(await service.listar(usuarioA, { limite: '3' })).toHaveLength(3);
    });

    it('busca sin mayúsculas, tildes ni espacios repetidos y trata % y _ como texto', async () => {
      for (const q of ['EXTENSIÓN DE TRICEPS', 'extension   de  tríceps']) {
        const lista = await service.listar(usuarioA, { q });
        expect(lista.map((e) => e.nombre).sort()).toEqual(['Extensión de tríceps en polea', 'Extensión de tríceps sobre la cabeza']);
      }
      expect(ids(await service.listar(usuarioA, { q: 'mi PRESS' }))).toEqual([propioA.id]);
      expect(await service.listar(usuarioA, { q: 'remo de b' })).toEqual([]);
      expect(await service.listar(usuarioA, { q: '%' })).toEqual([]);
      expect(await service.listar(usuarioA, { q: 'press_de' })).toEqual([]);
      expect(await service.listar(usuarioA, { q: '   ' })).toHaveLength(20);
    });

    it('ordena por uso reciente del propio usuario y después alfabéticamente', async () => {
      await registrarSerie(usuarioA, remoBarra, '2026-11-01T18:00:00.000Z');
      await registrarSerie(usuarioA, propioA.id, '2026-11-08T18:00:00.000Z');
      await registrarSerie(usuarioA, remoBarra, '2026-11-05T18:00:00.000Z');
      await registrarSerie(usuarioB, pressBanca, '2026-11-10T18:00:00.000Z');
      const lista = await service.listar(usuarioA, { limite: '100' });
      expect(ids(lista.slice(0, 2))).toEqual([propioA.id, remoBarra]);
      expect(lista[0].ultimoUso?.toISOString()).toBe('2026-11-08T18:00:00.000Z');
      expect(lista[1].ultimoUso?.toISOString()).toBe('2026-11-05T18:00:00.000Z');
      const resto = lista.slice(2).map((e) => normalizarNombre(e.nombre));
      expect(resto).toEqual([...resto].sort());
      expect(lista.find((e) => e.id === pressBanca)?.ultimoUso).toBeNull();
    });

    it.each([{ limite: '0' }, { limite: '101' }, { limite: 'abc' }, { limite: '2.5' }, { q: 'x'.repeat(81) }])('rechaza la consulta %o con VALIDACION', async (consulta) => {
      await expect(service.listar(usuarioA, consulta)).rejects.toMatchObject(error(400, 'VALIDACION', { campos: expect.any(Object) }));
    });
  });

  describe('crear', () => {
    it('crea un ejercicio propio con el nombre recortado y el normalizado compactado', async () => {
      const creado = await service.crear(usuarioA, { nombre: '  Press   en máquina Hammer  ', grupoMuscular: 'pecho' });
      expect(creado).toEqual({ id: expect.any(String), nombre: 'Press   en máquina Hammer', grupoMuscular: 'pecho', propio: true, ultimoUso: null });
      const [fila] = await source.query('SELECT usuario_id, nombre_normalizado FROM ejercicio WHERE id=$1', [creado.id]);
      expect(fila).toEqual({ usuario_id: usuarioA, nombre_normalizado: 'press en maquina hammer' });
      expect(ids(await service.listar(usuarioB, { q: 'hammer' }))).toEqual([]);
    });

    it('rechaza duplicados propios y del catálogo con el existente en actual', async () => {
      await expect(service.crear(usuarioA, { nombre: 'MI  PRÉSS t019', grupoMuscular: 'pecho' }))
        .rejects.toMatchObject(error(409, 'EJERCICIO_DUPLICADO', { actual: expect.objectContaining({ id: propioA.id, propio: true }) }));
      await expect(service.crear(usuarioA, { nombre: 'press DE  banca', grupoMuscular: 'pecho' }))
        .rejects.toMatchObject(error(409, 'EJERCICIO_DUPLICADO', { actual: { id: pressBanca, nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null } }));
      await expect(service.crear(usuarioA, { nombre: propioB.nombre, grupoMuscular: 'espalda' })).resolves.toMatchObject({ propio: true });
    });

    it('rechaza entrada inválida con VALIDACION por campo', async () => {
      await expect(service.crear(usuarioA, { nombre: ' ', grupoMuscular: 'cardio' }))
        .rejects.toMatchObject(error(400, 'VALIDACION', { campos: { nombre: expect.any(String), grupoMuscular: expect.any(String) } }));
      await expect(service.crear(usuarioA, null)).rejects.toMatchObject(error(400, 'VALIDACION'));
    });
  });

  describe('actualizar', () => {
    it('renombra y cambia el grupo de un propio aunque tenga series', async () => {
      await registrarSerie(usuarioA, propioA.id, '2026-11-08T18:00:00.000Z');
      const actualizado = await service.actualizar(usuarioA, propioA.id, { nombre: ' Press inclinado T019 ', grupoMuscular: 'hombros' });
      expect(actualizado).toEqual({ id: propioA.id, nombre: 'Press inclinado T019', grupoMuscular: 'hombros', propio: true, ultimoUso: new Date('2026-11-08T18:00:00.000Z') });
      const [fila] = await source.query('SELECT nombre_normalizado FROM ejercicio WHERE id=$1', [propioA.id]);
      expect(fila.nombre_normalizado).toBe('press inclinado t019');
      await expect(service.actualizar(usuarioA, propioA.id, { nombre: 'PRESS INCLINADO t019' })).resolves.toMatchObject({ nombre: 'PRESS INCLINADO t019' });
    });

    it('rechaza renombrar a un nombre existente', async () => {
      await expect(service.actualizar(usuarioA, propioA.id, { nombre: 'Remo  con BARRA' }))
        .rejects.toMatchObject(error(409, 'EJERCICIO_DUPLICADO', { actual: expect.objectContaining({ id: remoBarra }) }));
    });

    it('responde NO_ENCONTRADO para catálogo, ajenos, inexistentes e id no UUID', async () => {
      for (const id of [pressBanca, propioB.id, randomUUID(), 'no-uuid']) {
        await expect(service.actualizar(usuarioA, id, { nombre: 'Otro T019' })).rejects.toMatchObject(error(404, 'NO_ENCONTRADO'));
      }
      const [fila] = await source.query('SELECT nombre FROM ejercicio WHERE id=$1', [pressBanca]);
      expect(fila.nombre).toBe('Press de banca');
    });

    it('rechaza actualizaciones vacías o inválidas', async () => {
      for (const entrada of [{}, { nombre: '' }, { grupoMuscular: 'cardio' }]) {
        await expect(service.actualizar(usuarioA, propioA.id, entrada)).rejects.toMatchObject(error(400, 'VALIDACION'));
      }
    });
  });

  describe('eliminar', () => {
    it('elimina un propio sin uso', async () => {
      await service.eliminar(usuarioA, propioA.id);
      expect(await source.query('SELECT id FROM ejercicio WHERE id=$1', [propioA.id])).toEqual([]);
      await expect(service.eliminar(usuarioA, propioA.id)).rejects.toMatchObject(error(404, 'NO_ENCONTRADO'));
    });

    it('bloquea el borrado con series indicando en cuántos entrenamientos aparece', async () => {
      await registrarSerie(usuarioA, propioA.id, '2026-11-01T18:00:00.000Z');
      await registrarSerie(usuarioA, propioA.id, '2026-11-08T18:00:00.000Z');
      await expect(service.eliminar(usuarioA, propioA.id))
        .rejects.toMatchObject(error(409, 'EJERCICIO_EN_USO', { actual: { entrenamientos: 2, rutinas: [] } }));
    });

    it('bloquea el borrado si aparece en un entrenamiento aunque aún no tenga series', async () => {
      await registrarSerie(usuarioA, propioA.id, '2026-11-08T18:00:00.000Z', false);
      await expect(service.eliminar(usuarioA, propioA.id))
        .rejects.toMatchObject(error(409, 'EJERCICIO_EN_USO', { actual: { entrenamientos: 1, rutinas: [] } }));
    });

    it('bloquea el borrado si está en rutinas indicando cuáles', async () => {
      for (const nombre of ['Pecho y tríceps', 'Empuje']) {
        const rutina = randomUUID();
        await source.query('INSERT INTO rutina (id,usuario_id,nombre,dia_semana) VALUES ($1,$2,$3,1)', [rutina, usuarioA, nombre]);
        await source.query('INSERT INTO rutina_ejercicio (rutina_id,posicion,ejercicio_id) VALUES ($1,1,$2)', [rutina, propioA.id]);
      }
      await expect(service.eliminar(usuarioA, propioA.id))
        .rejects.toMatchObject(error(409, 'EJERCICIO_EN_USO', { actual: { entrenamientos: 0, rutinas: ['Empuje', 'Pecho y tríceps'] } }));
      expect(await source.query('SELECT id FROM ejercicio WHERE id=$1', [propioA.id])).toHaveLength(1);
    });

    it('responde NO_ENCONTRADO para catálogo, ajenos e id no UUID', async () => {
      for (const id of [pressBanca, propioB.id, 'no-uuid']) {
        await expect(service.eliminar(usuarioA, id)).rejects.toMatchObject(error(404, 'NO_ENCONTRADO'));
      }
      expect(await source.query('SELECT id FROM ejercicio WHERE id = ANY($1::uuid[])', [[pressBanca, propioB.id]])).toHaveLength(2);
    });
  });
});
