import { normalizarNombre } from '@gymtrack/domain';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';

const GRUPOS = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'antebrazos', 'cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'abdomen'];
const usuario = '00000000-0000-4000-8000-000000000181';

interface FilaCatalogo { id: string; nombre: string; nombre_normalizado: string; grupo_muscular: string; usuario_id: string | null }

/** Catálogo esperado leído de la tabla «Catálogo inicial» de data-model.md (R-20), no de la migración. */
function catalogoDeDataModel() {
  const doc = readFileSync(resolve(__dirname, '../../../specs/001-registro-entrenamientos/data-model.md'), 'utf8');
  const seccion = doc.slice(doc.indexOf('## Catálogo inicial'));
  const esperado: { nombre: string; grupo: string }[] = [];
  for (const [, grupo, total, lista] of seccion.matchAll(/^\| ([^|(]+?) \((\d+)\) \| (.+?) \|$/gm)) {
    // «Pájaros (deltoides posterior)» contiene una coma solo fuera del paréntesis: se separa por «, » de nivel superior.
    const nombres = lista.split(/, (?![^(]*\))/);
    expect(nombres).toHaveLength(Number(total));
    for (const nombre of nombres) esperado.push({ nombre, grupo: normalizarNombre(grupo) });
  }
  return esperado;
}

describe('T018: migración idempotente del catálogo inicial', () => {
  let source: DataSource;
  let ownsSchema = false;

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
  });
  afterEach(async () => {
    try { if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source); }
    finally { ownsSchema = false; if (source?.isInitialized) await source.destroy(); }
  });

  const catalogo = (): Promise<FilaCatalogo[]> =>
    source.query('SELECT id, nombre, nombre_normalizado, grupo_muscular::text, usuario_id FROM ejercicio WHERE usuario_id IS NULL ORDER BY id');
  const migracionCatalogo = () => {
    const migracion = source.migrations.find((m) => /^Catalogo/.test(m.name ?? m.constructor.name));
    if (!migracion) throw new Error('Migración del catálogo no registrada en data-source.');
    return migracion;
  };

  it('en una base limpia carga exactamente los 50 ejercicios de data-model como catálogo global', async () => {
    const esperado = catalogoDeDataModel();
    expect(esperado).toHaveLength(50);
    const aplicadas = await source.runMigrations();
    expect(aplicadas.map((m) => m.name)).toEqual(['EsquemaInicial1794441600000', expect.stringMatching(/^Catalogo/)]);

    const filas = await catalogo();
    expect(filas).toHaveLength(50);
    expect(filas.map(({ nombre, grupo_muscular }) => ({ nombre, grupo: grupo_muscular })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      .toEqual([...esperado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    expect(await source.query('SELECT * FROM ejercicio WHERE usuario_id IS NOT NULL')).toEqual([]);
  });

  it('usa UUID únicos y fijos, nombres normalizados como el dominio y solo grupos aprobados', async () => {
    await source.runMigrations();
    const filas = await catalogo();
    expect(new Set(filas.map((f) => f.id)).size).toBe(50);
    for (const fila of filas) {
      expect(fila.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(fila.nombre_normalizado).toBe(normalizarNombre(fila.nombre));
      expect(GRUPOS).toContain(fila.grupo_muscular);
      expect(fila.usuario_id).toBeNull();
    }
    expect(new Set(filas.map((f) => f.grupo_muscular))).toEqual(new Set(GRUPOS));
  });

  it('repetir las migraciones o la carga no crea duplicados ni cambia el catálogo', async () => {
    await source.runMigrations();
    const antes = await catalogo();
    expect(await source.runMigrations()).toHaveLength(0);

    // Reejecuta la carga de datos aunque ya esté registrada (p. ej., registro de migraciones perdido).
    const runner = source.createQueryRunner();
    try { await migracionCatalogo().up(runner); await migracionCatalogo().up(runner); } finally { await runner.release(); }
    expect(await catalogo()).toEqual(antes);

    await source.query('DELETE FROM ejercicio WHERE id=$1', [antes[0].id]);
    const runner2 = source.createQueryRunner();
    try { await migracionCatalogo().up(runner2); } finally { await runner2.release(); }
    expect(await catalogo()).toEqual(antes);
  });

  it('no altera ejercicios propios existentes, aunque compartan nombre con el catálogo', async () => {
    await source.runMigrations();
    await source.query("INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,'t018@example.invalid','hash-sintetico-t018','UTC')", [usuario]);
    const propios = [
      { id: '18000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupo: 'hombros' },
      { id: '18000000-0000-4000-8000-000000000002', nombre: 'Mi remo T018', grupo: 'espalda' },
    ];
    for (const p of propios) {
      await source.query('INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ($1,$2,$3,$4,$5)',
        [p.id, usuario, p.nombre, normalizarNombre(p.nombre), p.grupo]);
    }
    const snapshot = () => source.query('SELECT * FROM ejercicio WHERE usuario_id IS NOT NULL ORDER BY id');
    const antes = await snapshot();

    const runner = source.createQueryRunner();
    try { await migracionCatalogo().up(runner); } finally { await runner.release(); }

    expect(await snapshot()).toEqual(antes);
    expect(await catalogo()).toHaveLength(50);
  });

  it('revertir la carga elimina solo el catálogo y conserva los ejercicios propios', async () => {
    await source.runMigrations();
    await source.query("INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,'t018@example.invalid','hash-sintetico-t018','UTC')", [usuario]);
    await source.query("INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular) VALUES ('18000000-0000-4000-8000-000000000003',$1,'Mi curl T018','mi curl t018','biceps')", [usuario]);
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await migracionCatalogo().down(runner);
      expect(await runner.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL')).toHaveLength(0);
      expect(await runner.query('SELECT id FROM ejercicio WHERE usuario_id IS NOT NULL')).toEqual([{ id: '18000000-0000-4000-8000-000000000003' }]);
      await migracionCatalogo().up(runner);
      expect(await runner.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL')).toHaveLength(50);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
