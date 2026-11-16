import { expect, test, type Page } from '@playwright/test';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../backend/src/database/data-source';

interface SerieFixture {
  pesoKg: number;
  repeticiones: number;
}

interface SesionFixture {
  id: string;
  ejercicioId: string;
  fecha: string;
  series: SerieFixture[];
  esperado: { pesoMaxKg: number; volumenKg: number; unoRmKg: number | null };
}

interface EjercicioFixture {
  id: string;
  nombre: string;
  grupoMuscular: string;
}

interface FixtureProgreso {
  ejercicios: EjercicioFixture[];
  sesiones: SesionFixture[];
  periodos: Record<string, string[]>;
  escenariosAvisos: {
    primeraSesion: { series: SerieFixture[]; avisosEsperados: string[] };
    igualarRecord: { series: SerieFixture[]; avisosEsperados: string[] };
    superarPeso: { series: SerieFixture[]; avisosInmediatosEsperados: string[] };
    primeraMetricaUnoRm: {
      sesionAnterior: { series: SerieFixture[] };
      serieNueva: SerieFixture;
      avisosInmediatosEsperados: string[];
    };
    volumen: {
      series: SerieFixture[];
      avisoAntesDeTerminar: boolean;
      reabrirSinCambios: { aviso: boolean };
      reabrirConSerie: { serie: SerieFixture; aviso: boolean };
      finalizarEntrenamientoSinTerminar: { avisoEnResumen: boolean };
    };
  };
}

const fixture = JSON.parse(readFileSync(
  resolve(__dirname, '../../packages/domain/test/fixtures/progreso-referencia.json'),
  'utf8'
)) as FixtureProgreso;
const contrasena = 'T036-solo-pruebas-2026!';
const avisos = (page: Page) => page.locator('[aria-live="polite"]');

let source: DataSource;
let cuenta: { id: string; email: string };
let hashPrueba: string;

async function login(page: Page) {
  await expect.poll(async () => (await page.request.get('/api/auth/yo')).status(), {
    timeout: 30000
  }).toBe(401);
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(cuenta.email);
  await page.getByLabel(/^contraseña$/i).fill(contrasena);
  await page.getByRole('button', { name: /^iniciar sesión$|^entrar$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
}

async function iniciarYAnadirEjercicio(page: Page, ejercicio: EjercicioFixture) {
  await page.getByRole('button', { name: /iniciar entrenamiento/i }).click();
  await expect(page.getByRole('heading', { name: /entrenamiento en curso/i })).toBeVisible();
  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/buscar ejercicio/i).fill(ejercicio.nombre);
  await dialogo.getByRole('button', { name: ejercicio.nombre, exact: true, description: /Propio/ }).click();
  await expect(page.getByRole('heading', { name: ejercicio.nombre, exact: true })).toBeVisible();
}

async function agregarSerie(page: Page, serie: SerieFixture) {
  await page.getByLabel(/repeticiones/i).last().fill(String(serie.repeticiones));
  await page.getByLabel(/peso/i).last().fill(String(serie.pesoKg));
  await page.getByRole('button', { name: /añadir serie/i }).last().click();
}

async function sembrarEjercicio(ejercicio: EjercicioFixture) {
  await source.query(
    `INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular)
     VALUES ($1,$2,$3,$4,$5)`,
    [ejercicio.id, cuenta.id, ejercicio.nombre, ejercicio.nombre.toLocaleLowerCase('es'), ejercicio.grupoMuscular]
  );
}

async function sembrarSesiones(sesiones: SesionFixture[]) {
  for (const ejercicio of fixture.ejercicios) await sembrarEjercicio(ejercicio);
  for (const sesion of sesiones) {
    const ejercicioRealizadoId = randomUUID();
    await source.query(
      `INSERT INTO entrenamiento
         (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
       VALUES ($1,$2,'finalizado',$3,$4,'America/Bogota',$4)`,
      [sesion.id, cuenta.id, `${sesion.fecha}T18:00:00.000Z`, `${sesion.fecha}T19:00:00.000Z`]
    );
    await source.query(
      `INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion)
       VALUES ($1,$2,$3,1)`,
      [ejercicioRealizadoId, sesion.id, sesion.ejercicioId]
    );
    for (const [index, serie] of sesion.series.entries()) {
      await source.query(
        `INSERT INTO serie
           (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), ejercicioRealizadoId, index + 1, serie.repeticiones, serie.pesoKg, `${sesion.fecha}T18:${String(index + 1).padStart(2, '0')}:00.000Z`]
      );
    }
  }
}

test.use({ timezoneId: 'America/Bogota', actionTimeout: 3000 });

test.beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('T036 requiere NODE_ENV=test.');
  const options = databaseOptions();
  if (options.database !== 'gymtrack_test') throw new Error('T036 solo puede usar gymtrack_test.');
  source = await new DataSource(options).initialize();
  await source.runMigrations();
  hashPrueba = await hash(contrasena, { type: argon2id });
});

test.beforeEach(async () => {
  const id = randomUUID();
  cuenta = { id, email: `t036.${id}@example.invalid` };
  await source.query(
    'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
    [cuenta.id, cuenta.email, hashPrueba, 'America/Bogota']
  );
});

test.afterEach(async () => {
  if (!cuenta || !source?.isInitialized) return;
  if (!/^t036\.[0-9a-f-]{36}@example\.invalid$/i.test(cuenta.email)) {
    throw new Error('Limpieza T036 rechazada: la cuenta no pertenece a este fixture.');
  }
  await source.query('DELETE FROM usuario WHERE id=$1', [cuenta.id]);
});

test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

test('muestra la evolución manual por periodo en un gráfico y una tabla equivalente', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  await sembrarSesiones(fixture.sesiones.filter((sesion) => sesion.ejercicioId === ejercicio.id));
  await login(page);
  await page.goto('/progreso');

  await expect(page.getByRole('heading', { name: /progreso/i })).toBeVisible();
  const periodo = page.getByRole('combobox', { name: /periodo/i });
  for (const [nombre, ids] of Object.entries(fixture.periodos)) {
    await periodo.selectOption(nombre);
    const filas = page.getByRole('table').getByRole('row');
    await expect(filas).toHaveCount(ids.length + 1);
    for (const id of ids) {
      const sesion = fixture.sesiones.find((item) => item.id === id);
      if (!sesion) throw new Error(`Sesión ${id} ausente del fixture manual.`);
      await expect(page.getByRole('table')).toContainText(sesion.fecha);
      await expect(page.getByRole('table')).toContainText(String(sesion.esperado.pesoMaxKg));
      await expect(page.getByRole('table')).toContainText(String(sesion.esperado.volumenKg));
      if (sesion.esperado.unoRmKg !== null) {
        await expect(page.getByRole('table')).toContainText(String(Number(sesion.esperado.unoRmKg.toFixed(2))));
      } else {
        await expect(page.getByRole('table')).toContainText(/sin 1rm/i);
      }
    }
  }
  await expect(page.getByRole('img', { name: /gráfico de progreso/i })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('no avisa por varias series crecientes en la primera sesión del ejercicio', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  await sembrarEjercicio(ejercicio);
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);

  for (const serie of fixture.escenariosAvisos.primeraSesion.series) await agregarSerie(page, serie);
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord/i);
  await page.getByRole('button', { name: /terminar ejercicio/i }).click();
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord/i);
});

test('avisa de inmediato al superar los récords de peso máximo y 1RM', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  await sembrarSesiones(fixture.sesiones.filter((sesion) => sesion.ejercicioId === ejercicio.id));
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);

  await agregarSerie(page, fixture.escenariosAvisos.superarPeso.series[0]);
  await expect(avisos(page)).toContainText(/récord.*peso máximo/i);
  await expect(avisos(page)).toContainText(/récord.*1rm/i);
});

test('no avisa al igualar un récord', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  const escenario = fixture.escenariosAvisos;
  await sembrarSesiones(fixture.sesiones.filter((sesion) => sesion.ejercicioId === ejercicio.id));
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);
  await agregarSerie(page, escenario.igualarRecord.series[0]);
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord/i);
});

test('difiere el récord de volumen hasta terminar y evita repetirlo al reabrir', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  const escenario = fixture.escenariosAvisos;
  await sembrarSesiones(fixture.sesiones.filter((sesion) => sesion.ejercicioId === ejercicio.id));
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);

  for (const serie of escenario.volumen.series) await agregarSerie(page, serie);
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord.*volumen/i);

  await page.getByRole('button', { name: /terminar ejercicio/i }).click();
  await expect(avisos(page)).toContainText(/récord.*volumen/i);
  await page.getByRole('button', { name: /reabrir ejercicio/i }).click();
  await page.getByRole('button', { name: /terminar ejercicio/i }).click();
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord.*volumen/i);

  await page.getByRole('button', { name: /reabrir ejercicio/i }).click();
  await agregarSerie(page, escenario.volumen.reabrirConSerie.serie);
  await page.getByRole('button', { name: /terminar ejercicio/i }).click();
  await expect(avisos(page)).toContainText(/récord.*volumen/i);
});

test('notifica el récord de volumen al finalizar el entrenamiento sin terminar el ejercicio', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  const escenario = fixture.escenariosAvisos.volumen;
  await sembrarSesiones(fixture.sesiones.filter((sesion) => sesion.ejercicioId === ejercicio.id));
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);

  for (const serie of escenario.series) await agregarSerie(page, serie);
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord.*volumen/i);
  await page.getByRole('button', { name: /finalizar entrenamiento/i }).click();
  await expect(avisos(page)).toContainText(/récord.*volumen/i);
});

test('notifica el primer 1RM solo como referencia y muestra volumen al finalizar la sesión', async ({ page }) => {
  const ejercicio = fixture.ejercicios[1];
  const escenario = fixture.escenariosAvisos;
  const sesionCero = fixture.sesiones.find((sesion) => sesion.ejercicioId === ejercicio.id);
  if (!sesionCero) throw new Error('Falta la sesión de peso cero en el fixture manual.');
  await sembrarSesiones([sesionCero]);
  await login(page);
  await iniciarYAnadirEjercicio(page, ejercicio);

  await agregarSerie(page, escenario.primeraMetricaUnoRm.serieNueva);
  await expect(avisos(page)).toContainText(/récord.*peso máximo/i);
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord.*1rm/i);
  await page.getByRole('button', { name: /finalizar entrenamiento/i }).click();
  await expect(avisos(page)).toContainText(/récord.*volumen/i);
});
