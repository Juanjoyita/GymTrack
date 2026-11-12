import { DataSource } from 'typeorm';
import { cleanTestSchema, TEST_SCHEMA, testDataSource } from '../utils/database';

const usuario = '00000000-0000-4000-8000-000000000001';
const ejercicio = '00000000-0000-4000-8000-000000000002';
const rutina = '00000000-0000-4000-8000-000000000003';
const entrenamiento = '00000000-0000-4000-8000-000000000004';
const realizado = '00000000-0000-4000-8000-000000000005';
const serie = '00000000-0000-4000-8000-000000000006';
const token = '00000000-0000-4000-8000-000000000007';
const verifyRestart = process.env.VERIFY_PERSISTENCE === '1';

async function snapshot(source: DataSource) {
  const result: Record<string, unknown> = {};
  for (const table of ['usuario', 'ejercicio', 'rutina', 'entrenamiento', 'ejercicio_realizado', 'serie', 'rutina_ejercicio', 'token_recuperacion']) {
    result[table] = await source.query(`SELECT * FROM ${table} ORDER BY 1`);
  }
  return result;
}

async function seed(source: DataSource) {
  await source.query(`INSERT INTO usuario(id,email,hash_contrasena,zona_horaria) VALUES ($1,'fixture@example.invalid','hash-sintetico-no-credencial','America/Bogota')`, [usuario]);
  await source.query(`INSERT INTO ejercicio(id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ($1,$2,'Press prueba','press prueba','pecho')`, [ejercicio,usuario]);
  await source.query(`INSERT INTO rutina(id,usuario_id,nombre,dia_semana) VALUES ($1,$2,'Rutina prueba',1)`, [rutina,usuario]);
  await source.query(`INSERT INTO rutina_ejercicio VALUES ($1,1,$2)`, [rutina,ejercicio]);
  await source.query(`INSERT INTO entrenamiento(id,usuario_id,inicio,zona_horaria,ultima_actividad_en,rutina_origen_id) VALUES ($1,$2,'2026-11-11T23:00:00-05:00','America/Bogota','2026-11-12T04:01:00Z',$3)`, [entrenamiento,usuario,rutina]);
  await source.query(`INSERT INTO ejercicio_realizado(id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)`, [realizado,entrenamiento,ejercicio]);
  await source.query(`INSERT INTO serie(id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en) VALUES ($1,$2,1,8,60.1234,'2026-11-12T04:01:00Z')`, [serie,realizado]);
  await source.query(`INSERT INTO token_recuperacion(id,usuario_id,hash_token,expira_en) VALUES ($1,$2,$3,now() + interval '1 hour')`, [token,usuario,'a'.repeat(64)]);
}

describe('Migración inicial PostgreSQL (solo esquema T004 en gymtrack_test)', () => {
  let source: DataSource;
  let ownsSchema = verifyRestart;
  beforeAll(async () => {
    source = await testDataSource().initialize();
    if (!verifyRestart) {
      const existing = await source.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name=$1', [TEST_SCHEMA]);
      if (existing.length) throw new Error('El esquema T004 ya existe: verifica primero su persistencia o revísalo; no se borra automáticamente.');
      await source.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
      ownsSchema = true;
    }
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      if (ownsSchema && process.env.KEEP_TEST_SCHEMA !== '1') await cleanTestSchema(source);
      await source.destroy();
    }
  });

  if (verifyRestart) {
    it('conserva todas las filas, precisión, zona y migración tras reiniciar Compose', async () => {
      const data = await snapshot(source);
      for (const rows of Object.values(data)) expect(rows).toHaveLength(1);
      expect((data.serie as {peso_kg: string}[])[0].peso_kg).toBe('60.1234');
      const [row] = await source.query('SELECT inicio, zona_horaria FROM entrenamiento WHERE id=$1', [entrenamiento]);
      expect(row.inicio.toISOString()).toBe('2026-11-12T04:00:00.000Z');
      expect(row.zona_horaria).toBe('America/Bogota');
      expect(await source.runMigrations()).toHaveLength(0);
      expect(await snapshot(source)).toEqual(data);
    });
    return;
  }

  it('parte de un esquema vacío y crea las ocho tablas con una sola migración', async () => {
    expect(await source.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [TEST_SCHEMA])).toEqual([]);
    expect(await source.runMigrations()).toHaveLength(1);
    const tables = await source.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [TEST_SCHEMA]);
    expect(tables.map((r: {tablename: string}) => r.tablename)).toEqual([
      'ejercicio','ejercicio_realizado','entrenamiento','migrations','rutina','rutina_ejercicio','serie','token_recuperacion','usuario'
    ]);
    expect(await source.query('SELECT * FROM ejercicio')).toHaveLength(0);
    expect(source.options.synchronize).toBe(false);
  });
  it('segunda ejecución no aplica cambios ni altera filas existentes', async () => {
    await seed(source);
    const before = await snapshot(source);
    expect(await source.runMigrations()).toHaveLength(0);
    expect(await snapshot(source)).toEqual(before);
  });
  it('aplica las mismas entidades TypeORM sin exponer credenciales por defecto', async () => {
    const user = await source.getRepository('Usuario').findOneByOrFail({ id: usuario });
    expect(user).not.toHaveProperty('hash_contrasena');
    const saved = await source.getRepository('Serie').findOneByOrFail({ id: serie });
    expect(saved.peso_kg).toBe('60.1234');
  });
  it('impide sesiones activas duplicadas, pesos y repeticiones inválidos', async () => {
    await expect(source.query(`INSERT INTO entrenamiento(id,usuario_id,inicio,zona_horaria,ultima_actividad_en) VALUES ('00000000-0000-4000-8000-000000000099',$1,now(),'UTC',now())`,[usuario])).rejects.toMatchObject({code:'23505'});
    for (const [peso,reps] of [[-1,8],[500.0001,8],[60,0],[60,101]]) {
      await expect(source.query('UPDATE serie SET peso_kg=$1,repeticiones=$2 WHERE id=$3',[peso,reps,serie])).rejects.toMatchObject({code:'23514'});
    }
    await source.query('UPDATE serie SET peso_kg=0,repeticiones=100 WHERE id=$1',[serie]);
    await source.query('UPDATE serie SET peso_kg=500,repeticiones=1 WHERE id=$1',[serie]);
    await source.query('UPDATE serie SET peso_kg=60.1234,repeticiones=8 WHERE id=$1',[serie]);
  });
  it('impide borrar ejercicios referenciados y nombres duplicados', async () => {
    await expect(source.query('DELETE FROM ejercicio WHERE id=$1',[ejercicio])).rejects.toMatchObject({code:'23503'});
    await expect(source.query(`INSERT INTO ejercicio(id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ('00000000-0000-4000-8000-000000000098',$1,'Press prueba','press prueba','pecho')`,[usuario])).rejects.toMatchObject({code:'23505'});
  });
  it('cascadas de cuenta y SET NULL de rutina conservan otros usuarios y catálogo', async () => {
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`INSERT INTO usuario(id,email,hash_contrasena,zona_horaria) VALUES ('00000000-0000-4000-8000-000000000088','otro@example.invalid','hash-sintetico','UTC')`);
      await runner.query(`INSERT INTO ejercicio(id,nombre,nombre_normalizado,grupo_muscular) VALUES ('00000000-0000-4000-8000-000000000087','Catalogo prueba','catalogo prueba','pecho')`);
      await runner.query('DELETE FROM rutina WHERE id=$1',[rutina]);
      expect((await runner.query('SELECT rutina_origen_id FROM entrenamiento WHERE id=$1',[entrenamiento]))[0].rutina_origen_id).toBeNull();
      await runner.query('DELETE FROM usuario WHERE id=$1',[usuario]);
      for (const table of ['entrenamiento','ejercicio_realizado','serie','rutina','rutina_ejercicio','token_recuperacion']) {
        expect(await runner.query(`SELECT * FROM ${table}`)).toHaveLength(0);
      }
      expect(await runner.query('SELECT * FROM usuario')).toHaveLength(1);
      expect(await runner.query('SELECT * FROM ejercicio')).toHaveLength(1);
      await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });
  it('permite revertir y volver a aplicar en un esquema vacío sin tocar desarrollo', async () => {
    // El down es destructivo por naturaleza; solo se valida en una transacción de pruebas revertida.
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = source.migrations[0];
      await migration.down(runner);
      expect(await runner.query(`SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename <> 'migrations'`,[TEST_SCHEMA])).toHaveLength(0);
      await migration.up(runner);
      expect(await runner.query('SELECT * FROM usuario')).toHaveLength(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await source.query('SELECT id FROM usuario WHERE id=$1',[usuario])).toHaveLength(1);
  });
});
