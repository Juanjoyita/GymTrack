import { expect, test, type Page } from '@playwright/test';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../backend/src/database/data-source';

// Rutas de interfaz elegidas para la aceptación; REST mantiene contracts/api.md.
// No se simulan respuestas: se requieren formularios y cookies reales por HTTPS.
test.use({ timezoneId: 'America/Bogota', actionTimeout: 3000 });
let source: DataSource;
let fixture: { id: string; email: string; nuevoEmail: string };
let hashPrueba: string;
const contrasena = 'T012-solo-pruebas-2026!';

async function rellenarLogin(page: Page, email: string, password = contrasena) {
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(email);
  await page.getByLabel(/^contraseña$/i).fill(password);
  await page.getByRole('button', { name: /^iniciar sesión$|^entrar$/i }).click();
}

async function comprobarSesion(page: Page, email: string) {
  const response = await page.request.get('/api/auth/yo');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ email, unidadPeso: 'kg', zonaHoraria: 'America/Bogota' });
  const cookie = (await page.context().cookies()).find(({ name }) => name === 'gt_sesion');
  expect(Boolean(cookie)).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(await page.evaluate(() => document.cookie.includes('gt_sesion='))).toBe(false);
  // Aserción booleana: nunca imprimir el valor del token al fallar.
  const tokenEnLocalStorage = await page.evaluate((token) =>
    Object.values(localStorage).some((value) => token.length > 0 && value.includes(token)), cookie?.value ?? '');
  expect(tokenEnLocalStorage).toBe(false);
}

test.beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('T012 requiere NODE_ENV=test.');
  const options = databaseOptions();
  if (options.database !== 'gymtrack_test') throw new Error('T012 solo puede usar gymtrack_test.');
  source = await new DataSource(options).initialize();
  const [database] = await source.query('SELECT current_database() AS nombre');
  if (database.nombre !== 'gymtrack_test') throw new Error('Base de pruebas incorrecta.');
  // El servidor E2E real usa public; migración idempotente, sin limpiar filas existentes.
  await source.runMigrations();
  hashPrueba = await hash(contrasena, { type: argon2id });
});

test.beforeEach(async () => {
  const run = randomUUID();
  fixture = { id: run, email: `t012.${run}@example.invalid`, nuevoEmail: `t012.nuevo.${run}@example.invalid` };
  await source.query('INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
    [fixture.id, fixture.email, hashPrueba, 'America/Bogota']);
});

test.afterEach(async () => {
  if (!fixture || !source?.isInitialized) return;
  if (source.options.database !== 'gymtrack_test') throw new Error('Limpieza de T012 rechazada.');
  const emails = [fixture.email, fixture.nuevoEmail];
  if (!emails.every((email) => /^t012\.(nuevo\.)?[0-9a-f-]+@example\.invalid$/.test(email))) {
    throw new Error('Limpieza rechazada: fixture ajeno a T012.');
  }
  // Borrado exacto de los dos emails UUID de este caso, nunca TRUNCATE/limpieza de public.
  await source.query('DELETE FROM usuario WHERE email = ANY($1::text[])', [emails]);
});

test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

test('registro mediante formulario crea cuenta y sesión con cookie segura', async ({ page }) => {
  await page.goto('/registro');
  await page.getByLabel(/correo electrónico|email/i).fill(fixture.nuevoEmail);
  await page.getByLabel(/^contraseña$/i).fill(contrasena);
  await page.getByRole('button', { name: /^crear cuenta$|^registrarse$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
  await comprobarSesion(page, fixture.nuevoEmail);
});

test('login de cuenta existente conserva sesión al recargar', async ({ page }) => {
  await rellenarLogin(page, fixture.email);
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
  await comprobarSesion(page, fixture.email);
  await page.reload();
  await comprobarSesion(page, fixture.email);
});

test('logout desde cuenta elimina sesión y bloquea el regreso a entrenar', async ({ page }) => {
  await rellenarLogin(page, fixture.email);
  await comprobarSesion(page, fixture.email);
  await page.getByRole('link', { name: /^cuenta$/i }).click();
  await page.getByRole('button', { name: /^cerrar sesión$/i }).click();
  expect((await page.request.get('/api/auth/yo')).status()).toBe(401);
  expect((await page.context().cookies()).some(({ name }) => name === 'gt_sesion')).toBe(false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^iniciar sesión$/i })).toBeVisible();
});

test('otra sesión de navegador accede a la misma cuenta sin compartir almacenamiento', async ({ page, browser }) => {
  await rellenarLogin(page, fixture.email);
  await comprobarSesion(page, fixture.email);
  const segundo = await browser.newContext({
    baseURL: 'https://localhost:5173', viewport: { width: 360, height: 800 },
    timezoneId: 'America/Bogota', ignoreHTTPSErrors: false,
  });
  segundo.setDefaultTimeout(3000);
  try {
    expect((await segundo.cookies()).some(({ name }) => name === 'gt_sesion')).toBe(false);
    const otraPagina = await segundo.newPage();
    await rellenarLogin(otraPagina, fixture.email);
    await comprobarSesion(otraPagina, fixture.email);
    await page.getByRole('link', { name: /^cuenta$/i }).click();
    await page.getByRole('button', { name: /^cerrar sesión$/i }).click();
    await comprobarSesion(otraPagina, fixture.email);
  } finally {
    await segundo.close();
  }
});

test('credenciales incorrectas muestran el mismo error para cuenta existente o desconocida', async ({ page }) => {
  let mensaje: string | null = null;
  for (const email of [fixture.email, `t012.desconocido.${randomUUID()}@example.invalid`]) {
    await rellenarLogin(page, email, 'T012-incorrecta!');
    const alerta = page.getByRole('alert');
    await expect(alerta).toBeVisible();
    const actual = await alerta.textContent();
    expect(Boolean(actual?.trim())).toBe(true);
    if (mensaje !== null) expect(actual).toBe(mensaje);
    mensaje = actual;
    expect((await page.request.get('/api/auth/yo')).status()).toBe(401);
    expect((await page.context().cookies()).some(({ name }) => name === 'gt_sesion')).toBe(false);
  }
});

test('sin sesión la API rechaza acceso y la interfaz solicita iniciar sesión', async ({ page }) => {
  await page.goto('/');
  await expect.soft(page.getByRole('heading', { name: /^iniciar sesión$/i })).toBeVisible({ timeout: 3000 });
  const response = await page.request.get('/api/auth/yo');
  expect.soft(response.status()).toBe(401);
  expect.soft(await response.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
});
