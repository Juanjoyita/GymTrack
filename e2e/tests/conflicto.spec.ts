import { expect, test, type Browser, type Page } from '@playwright/test';
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

async function iniciarSesion(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(fixture.email);
  await page.getByLabel(/^contraseña$/i).fill(fixture.contrasena);
  await page.getByRole('button', { name: /^iniciar sesión$|^entrar$/i }).click();
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

async function agregarSerie(page: Page, peso: number) {
  await page.getByLabel(/repeticiones/i).last().fill('8');
  await page.getByLabel(/peso/i).last().fill(String(peso));
  await page.getByRole('button', { name: /añadir serie|guardar serie|registrar serie/i }).last().click();
}

async function editarPrimeraSerie(page: Page, peso: number) {
  await page.getByRole('button', { name: /editar serie 1/i }).click();
  await page.getByLabel(/peso/i).last().fill(String(peso));
  await page.getByRole('button', { name: /guardar cambios/i }).click();
}

async function crearSegundoDispositivo(browser: Browser) {
  return browser.newContext({
    baseURL: 'https://localhost:5173',
    viewport: { width: 360, height: 800 },
    timezoneId: 'America/Bogota',
    ignoreHTTPSErrors: false
  });
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

test('conserva series nuevas de ambos dispositivos y resuelve un cambio offline tardío', async ({ page, browser }) => {
  await registrarCuenta(page);
  await iniciarEntrenamiento(page);
  await agregarSerie(page, 60);

  const segundoDispositivo = await crearSegundoDispositivo(browser);
  try {
    const paginaB = await segundoDispositivo.newPage();
    await iniciarSesion(paginaB);
    await expect(paginaB.getByRole('button', { name: /editar serie 1/i })).toBeVisible();

    await agregarSerie(page, 80);
    await agregarSerie(paginaB, 90);

    const antesDelCambio = await source.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total
         FROM serie s
         JOIN ejercicio_realizado er ON er.id = s.ejercicio_realizado_id
         JOIN entrenamiento e ON e.id = er.entrenamiento_id
         JOIN usuario u ON u.id = e.usuario_id
        WHERE u.email = $1`,
      [fixture.email]
    );
    expect(antesDelCambio[0].total).toBe(3);

    await segundoDispositivo.setOffline(true);
    await editarPrimeraSerie(paginaB, 70);
    await expect(paginaB.getByText(/1 cambio pendiente de sincronizar/i)).toBeVisible();

    await editarPrimeraSerie(page, 65);
    await segundoDispositivo.setOffline(false);
    const conflicto = paginaB.getByRole('alert');
    await expect(conflicto).toContainText('65');
    await expect(conflicto).toContainText(/conflicto/i);
    await conflicto.getByRole('button', { name: /repetir mi cambio/i }).click();
    await expect(paginaB.getByText(/0 cambios pendientes de sincronizar/i)).toBeVisible();

    const filas = await source.query<Array<{ orden: number; peso_kg: string; repeticiones: number }>>(
      `SELECT s.orden, s.peso_kg, s.repeticiones
         FROM serie s
         JOIN ejercicio_realizado er ON er.id = s.ejercicio_realizado_id
         JOIN entrenamiento e ON e.id = er.entrenamiento_id
         JOIN usuario u ON u.id = e.usuario_id
        WHERE u.email = $1
        ORDER BY s.orden`,
      [fixture.email]
    );
    expect(filas).toHaveLength(3);
    expect(filas.map(({ orden, peso_kg, repeticiones }) => ({
      orden, pesoKg: Number(peso_kg), repeticiones
    }))).toEqual([
      { orden: 1, pesoKg: 70, repeticiones: 8 },
      { orden: 2, pesoKg: 80, repeticiones: 8 },
      { orden: 3, pesoKg: 90, repeticiones: 8 }
    ]);
  } finally {
    await segundoDispositivo.close();
  }
});
