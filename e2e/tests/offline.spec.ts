import { expect, test, type Page } from '@playwright/test';
import type { DataSource } from 'typeorm';
import {
  conectarBaseRegistro,
  crearFixtureRegistro,
  limpiarCuentaFixture
} from '../../backend/test/utils/registro-fixtures';

test.use({ timezoneId: 'America/Bogota', actionTimeout: 3000 });

let source: DataSource;
let fixture: ReturnType<typeof crearFixtureRegistro>;

async function registrarCuenta(page: Page) {
  await page.goto('/registro');
  await page.getByLabel(/correo electrónico|email/i).fill(fixture.email);
  await page.getByLabel(/^contraseña$/i).fill(fixture.contrasena);
  await page.getByRole('button', { name: /^crear cuenta$|^registrarse$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
}

async function iniciarEntrenamiento(page: Page) {
  await page.getByRole('button', { name: /iniciar entrenamiento/i }).click();
  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/buscar ejercicio/i).fill('Press de banca');
  await dialogo.getByRole('button', { name: /^press de banca$/i }).click();
  await expect(page.getByRole('heading', { name: 'Press de banca', exact: true })).toBeVisible();
}

async function agregarSerie(page: Page, repeticiones: number) {
  await page.getByLabel(/repeticiones/i).last().fill(String(repeticiones));
  await page.getByLabel(/peso/i).last().fill('60');
  await page.getByRole('button', { name: /añadir serie|guardar serie|registrar serie/i }).last().click();
}

test.beforeAll(async () => {
  source = await conectarBaseRegistro();
});

test.beforeEach(() => {
  fixture = crearFixtureRegistro();
});

test.afterEach(async () => {
  if (fixture && source?.isInitialized) await limpiarCuentaFixture(source, fixture.email);
});

test.afterAll(async () => {
  if (source?.isInitialized) await source.destroy();
});

test('mantiene la cola ante cortes, recarga y reapertura, y sincroniza sin duplicados', async ({ page }) => {
  await registrarCuenta(page);
  await iniciarEntrenamiento(page);
  await agregarSerie(page, 8);

  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.context().setOffline(true);
  await agregarSerie(page, 8);
  await expect(page.getByText(/1 cambio pendiente de sincronizar/i)).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText(/0 cambios pendientes de sincronizar/i)).toBeVisible();

  await page.context().setOffline(true);
  await agregarSerie(page, 8);
  await expect(page.getByText(/1 cambio pendiente de sincronizar/i)).toBeVisible();
  await page.reload();

  const contexto = page.context();
  await page.close();
  const reabierta = await contexto.newPage();
  await reabierta.goto('/');
  await expect(reabierta.getByRole('heading', { name: 'Press de banca', exact: true })).toBeVisible();
  await expect(reabierta.getByText(/1 cambio pendiente de sincronizar/i)).toBeVisible();

  await contexto.setOffline(false);
  await expect(reabierta.getByText(/0 cambios pendientes de sincronizar/i)).toBeVisible();
  const filas = await source.query<Array<{ total: number }>>(
    `SELECT count(*)::int AS total
       FROM serie s
       JOIN ejercicio_realizado er ON er.id = s.ejercicio_realizado_id
       JOIN entrenamiento e ON e.id = er.entrenamiento_id
       JOIN usuario u ON u.id = e.usuario_id
      WHERE u.email = $1`,
    [fixture.email]
  );
  expect(filas[0].total).toBe(3);
});
