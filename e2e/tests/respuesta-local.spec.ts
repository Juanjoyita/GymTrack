import { expect, test, type Page } from '@playwright/test';
import type { DataSource } from 'typeorm';
import {
  conectarBaseRegistro,
  crearFixtureRegistro,
  limpiarCuentaFixture,
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

test('confirma una serie y mide su respuesta visual local sin esperar la API', async ({ page }) => {
  await registrarCuenta(page);
  await page.getByRole('button', { name: /iniciar entrenamiento/i }).click();
  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/buscar ejercicio/i).fill('Press de banca');
  await dialogo.getByRole('button', { name: /^press de banca$/i }).click();

  await page.getByLabel(/repeticiones/i).last().fill('8');
  await page.getByLabel(/peso/i).last().fill('60');
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[aria-labelledby="titulo-en-curso"]');
    const boton = Array.from(root?.querySelectorAll('button') ?? [])
      .find((element) => /añadir serie|guardar serie|registrar serie/i.test(element.textContent ?? ''));
    if (!root || !boton) throw new Error('No se encontró el formulario de serie visible.');

    const antes = root.querySelectorAll('button[aria-label^="Editar serie"]').length;
    let inicio: number | undefined;
    const observador = new MutationObserver(() => {
      const visibles = Array.from(root.querySelectorAll<HTMLElement>('button[aria-label^="Editar serie"]'))
        .filter((element) => element.getBoundingClientRect().width > 0).length;
      if (inicio === undefined || visibles <= antes) return;
      observador.disconnect();
      requestAnimationFrame(() => {
        (window as Window & { __respuestaLocalMs?: number }).__respuestaLocalMs = performance.now() - inicio!;
      });
    });
    observador.observe(root, { childList: true, subtree: true });
    boton.addEventListener('click', () => { inicio = performance.now(); }, { capture: true, once: true });
  });
  await page.getByRole('button', { name: /añadir serie|guardar serie|registrar serie/i }).last().click();
  await expect(page.getByRole('button', { name: /editar serie 1/i })).toBeVisible();
  // La serie puede estar visible antes de que el siguiente frame registre la medición.
  const medicion = await page.waitForFunction(() =>
    (window as Window & { __respuestaLocalMs?: number }).__respuestaLocalMs ?? null,
    undefined,
    { timeout: 3000, polling: 20 },
  );
  const milisegundos = await medicion.jsonValue();
  await medicion.dispose();

  if (typeof milisegundos !== 'number') throw new Error('No se observó el render local tras confirmar la serie.');
  expect(milisegundos).toBeLessThan(100);
  console.log(`Respuesta visual local al confirmar serie: ${milisegundos?.toFixed(1)} ms`);
});
