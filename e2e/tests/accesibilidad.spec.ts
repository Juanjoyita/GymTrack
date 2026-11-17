import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../backend/src/database/data-source';
import { limpiarCuentaFixture, crearFixtureRegistro } from '../../backend/test/utils/registro-fixtures';

test.use({ timezoneId: 'America/Bogota', actionTimeout: 5000, screenshot: 'off', trace: 'off', video: 'off' });

let source: DataSource;
let fixture: ReturnType<typeof crearFixtureRegistro>;

async function auditarPantalla(page: Page, nombre: string) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(resultado.violations, `Violaciones axe en ${nombre}`).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus'), `Foco de teclado en ${nombre}`).toBeVisible();

  const control = page.locator('main button:visible').first();
  if (await control.count()) {
    const caja = await control.boundingBox();
    expect(caja?.width, `Ancho táctil en ${nombre}`).toBeGreaterThanOrEqual(44);
    expect(caja?.height, `Alto táctil en ${nombre}`).toBeGreaterThanOrEqual(44);
  }
}

async function registrarCuenta(page: Page) {
  await page.goto('/registro');
  await page.getByLabel(/correo electrónico|email/i).fill(fixture.email);
  await page.getByLabel(/^contraseña$/i).fill(fixture.contrasena);
  await page.getByRole('button', { name: /^crear cuenta$|^registrarse$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
}

test.beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('La auditoría requiere NODE_ENV=test.');
  const options = databaseOptions();
  if (options.database !== 'gymtrack_test') throw new Error('La auditoría solo puede usar gymtrack_test.');
  source = await new DataSource(options).initialize();
  await source.runMigrations();
});

test.beforeEach(() => { fixture = crearFixtureRegistro(); });
test.afterEach(async () => { if (fixture && source?.isInitialized) await limpiarCuentaFixture(source, fixture.email); });
test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

test('axe, teclado y controles táctiles en pantallas principales, móviles y escritorio', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/login');
  await auditarPantalla(page, 'login');
  await page.goto('/registro');
  await auditarPantalla(page, 'registro');
  await page.goto('/recuperar');
  await auditarPantalla(page, 'recuperar');
  await page.goto('/restablecer?token=token-sintetico-invalido');
  await auditarPantalla(page, 'restablecer');

  await registrarCuenta(page);
  const [usuario] = await source.query<Array<{ id: string }>>('SELECT id FROM usuario WHERE email=$1', [fixture.email]);
  const [press] = await source.query<Array<{ id: string }>>(
    "SELECT id FROM ejercicio WHERE nombre='Press de banca' AND usuario_id IS NULL",
  );
  if (!usuario || !press) throw new Error('Falta el usuario o ejercicio sintético para auditar el historial.');
  const entrenamientoId = randomUUID();
  const ejercicioRealizadoId = randomUUID();
  const inicio = new Date('2026-11-10T18:00:00.000Z');
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
  await source.query(
    `INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
     VALUES ($1,$2,'finalizado',$3,$4,'America/Bogota',$4)`,
    [entrenamientoId, usuario.id, inicio, fin],
  );
  await source.query(
    'INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)',
    [ejercicioRealizadoId, entrenamientoId, press.id],
  );
  await source.query(
    `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
     VALUES ($1,$2,1,8,60,$3)`,
    [randomUUID(), ejercicioRealizadoId, inicio],
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
  await auditarPantalla(page, 'entrenamiento vacío');
  await page.getByRole('button', { name: /iniciar entrenamiento/i }).click();
  await auditarPantalla(page, 'entrenamiento en curso');
  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  await auditarPantalla(page, 'selector de ejercicios');
  const selector = page.getByRole('dialog');
  await selector.getByLabel(/buscar ejercicio/i).fill('Press de banca');
  await selector.getByRole('button', { name: /^press de banca$/i }).click();
  await page.getByLabel(/repeticiones/i).last().fill('8');
  await page.getByLabel(/peso/i).last().fill('60');
  await page.getByRole('button', { name: /añadir serie/i }).last().click();
  await expect(page.getByRole('button', { name: /editar serie 1/i })).toBeVisible();
  await auditarPantalla(page, 'registro de series');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/historial');
  await auditarPantalla(page, 'historial móvil');
  await page.goto(`/historial/${entrenamientoId}`);
  await auditarPantalla(page, 'detalle de historial móvil');
  await page.goto('/progreso');
  await auditarPantalla(page, 'progreso móvil');
  await page.goto('/cuenta');
  await auditarPantalla(page, 'cuenta móvil');
  await page.goto('/rutinas');
  await auditarPantalla(page, 'rutinas móvil');
  await page.goto('/rutinas/nueva');
  await expect(page.getByRole('heading', { name: /nueva rutina/i })).toBeVisible();
  await auditarPantalla(page, 'editor de rutina móvil');
  await page.getByLabel(/nombre de la rutina/i).fill('Auditoría T059');
  await page.getByRole('combobox', { name: /día de la semana/i }).selectOption('3');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /guardar rutina/i }).click();
  await expect(page.getByRole('heading', { name: /^rutinas$/i })).toBeVisible();
  const [rutina] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM rutina WHERE usuario_id=$1 AND nombre=$2',
    [usuario.id, 'Auditoría T059'],
  );
  if (!rutina) throw new Error('No se guardó la rutina sintética de auditoría.');
  await page.goto(`/rutinas/${rutina.id}`);
  await auditarPantalla(page, 'editar rutina móvil');
  await page.goto('/rutinas');
  await page.getByRole('button', { name: /eliminar.*Auditoría T059/i }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('button', { name: /cancelar/i })).toBeFocused();
  await auditarPantalla(page, 'confirmación de borrado de rutina');
  await dialogo.getByRole('button', { name: /cancelar/i }).focus();
  await page.keyboard.press('Tab');
  await expect(dialogo.getByRole('button', { name: /cerrar/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialogo.getByRole('button', { name: /eliminar rutina/i })).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [ruta, nombre] of [
    ['/', 'entrenamiento escritorio'],
    ['/historial', 'historial escritorio'],
    ['/progreso', 'progreso escritorio'],
    ['/cuenta', 'cuenta escritorio'],
    ['/rutinas', 'rutinas escritorio'],
  ]) {
    await page.goto(ruta);
    await auditarPantalla(page, nombre);
  }
});
