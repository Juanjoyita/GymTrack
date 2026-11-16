import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
      const fecha = new Intl.DateTimeFormat('es', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
      }).format(new Date(`${sesion.fecha}T00:00:00Z`));
      const numero = (valor: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(valor);
      const fila = filas.filter({ has: page.getByRole('rowheader', { name: fecha, exact: true }) });
      await expect(fila.getByRole('cell')).toHaveText([
        numero(sesion.esperado.pesoMaxKg), numero(sesion.esperado.volumenKg),
        sesion.esperado.unoRmKg === null ? 'Sin 1RM' : numero(sesion.esperado.unoRmKg)
      ]);
    }
  }
  await expect(page.getByRole('img', { name: /gráfico de progreso/i })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  const records = page.getByRole('region', { name: /récords personales/i });
  await expect(records).toContainText('75 kg');
  await expect(records).toContainText('87,5 kg');
  await expect(records).toContainText('868 kg');
  await expect(records).toContainText('10 sept 2026');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/us3-progreso-movil.png', fullPage: true });
  for (const control of await page.getByRole('combobox').all()) {
    const caja = await control.boundingBox();
    expect(caja?.width).toBeGreaterThanOrEqual(44);
    expect(caja?.height).toBeGreaterThanOrEqual(44);
    await control.focus();
    await expect(control).toBeFocused();
  }
  await page.getByRole('combobox', { name: 'Ejercicio', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(periodo).toBeFocused();
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
  await expect(page.getByRole('button', { name: /añadir serie/i }).last()).toBeFocused();
  await expect(avisos(page)).toHaveAttribute('aria-live', 'polite');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
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
  // Confirmar persistencia real: no basta con que la cola local haya mostrado el aviso.
  await expect.poll(async () => {
    const filas = await source.query<Array<{ volumen: string }>>(
      `SELECT er.volumen_notificado_kg AS volumen FROM ejercicio_realizado er
       JOIN entrenamiento e ON e.id=er.entrenamiento_id
       WHERE e.usuario_id=$1 AND e.estado='en_curso'`, [cuenta.id]
    );
    return Number(filas[0]?.volumen);
  }).toBe(895);
  await page.reload();
  await expect(page.getByRole('button', { name: /reabrir ejercicio/i })).toBeVisible();
  expect((await avisos(page).allTextContents()).join(' ')).not.toMatch(/récord.*volumen/i);
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


test('recalcula tabla, gráfico y récords al corregir y eliminar desde historial', async ({ page }) => {
  const ejercicio = fixture.ejercicios[0];
  await sembrarSesiones(fixture.sesiones.filter((s) => s.ejercicioId === ejercicio.id));
  await login(page);
  await page.getByRole('link', { name: /progreso/i }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
  await page.getByRole('link', { name: /historial/i }).click();
  await page.getByRole('link', { name: /ver entrenamiento del/i }).first().click();
  await page.getByRole('button', { name: /editar serie 1/i }).first().click();
  await page.getByLabel(/peso/i).last().fill('90');
  await page.getByRole('button', { name: /guardar cambios/i }).click();
  await expect(page.getByRole('status')).toHaveText('Cambios de la serie guardados.');
  await page.getByRole('link', { name: /progreso/i }).click();
  const records = page.getByRole('region', { name: /récords personales/i });
  await expect(records).toContainText('90 kg');
  await expect(records).toContainText('105 kg');
  await expect(records).toContainText('943 kg');
  await expect(page.getByRole('table').getByRole('row').last().getByRole('cell')).toHaveText(['90', '943', '105']);
  await expect(page.getByRole('img', { name: /gráfico de progreso/i })).toHaveAccessibleName(/4 sesiones/);
  await page.getByRole('link', { name: /historial/i }).click();
  await page.getByRole('link', { name: /ver entrenamiento del/i }).first().click();
  await page.getByRole('button', { name: 'Eliminar entrenamiento', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /eliminar entrenamiento/i }).click();
  await expect(page).toHaveURL(/\/historial$/);
  await page.getByRole('link', { name: /progreso/i }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  await expect(records).toContainText('75 kg');
  await expect(records).toContainText('87,5 kg');
  await expect(records).toContainText('855 kg');
  await expect(records).not.toContainText('90 kg');
  await expect(page.getByRole('img', { name: /gráfico de progreso/i })).toHaveAccessibleName(/3 sesiones/);
});


test('muestra cero, ausencia de 1RM y tendencia insuficiente con una sola sesión', async ({ page }) => {
  const sesion = fixture.sesiones.find((s) => s.ejercicioId === fixture.ejercicios[1].id);
  if (!sesion) throw new Error('Falta el fixture de dominadas.');
  await sembrarSesiones([sesion]);
  await login(page);
  await page.getByRole('link', { name: /progreso/i }).click();
  await expect(page.getByRole('table').getByRole('row').last().getByRole('cell')).toHaveText(['0', '0', 'Sin 1RM']);
  await expect(page.getByText(/con una sola sesión aún no hay tendencia/i)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
