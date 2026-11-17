import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../backend/src/database/data-source';

const contrasena = 'T051-solo-pruebas-2026!';
let source: DataSource;
let usuario: { id: string; email: string };
let hashPrueba: string;
let ejercicios: Array<{ id: string; nombre: string }>;

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(usuario.email);
  await page.getByLabel(/^contraseña$/i).fill(contrasena);
  await page.getByRole('button', { name: /^iniciar sesión$|^entrar$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
}

async function crearRutina(page: Page, nombre: string, diaSemana: number, ejerciciosElegidos: string[]) {
  await page.getByRole('button', { name: /crear rutina/i }).click();
  await page.getByLabel(/nombre de la rutina/i).fill(nombre);
  await page.getByLabel(/día de la semana/i).selectOption(String(diaSemana));
  for (const ejercicio of ejerciciosElegidos) {
    await page.getByRole('checkbox', { name: ejercicio, exact: true }).check();
  }
  await page.getByRole('button', { name: /guardar rutina/i }).click();
  await expect(page.getByRole('heading', { name: nombre, exact: true })).toBeVisible();
}

test.use({ timezoneId: 'America/Bogota', actionTimeout: 3000, screenshot: 'off', trace: 'off', video: 'off' });

test.beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('T051 requiere NODE_ENV=test.');
  const options = databaseOptions();
  if (options.database !== 'gymtrack_test') throw new Error('T051 solo puede usar gymtrack_test.');
  source = await new DataSource(options).initialize();
  await source.runMigrations();
  hashPrueba = await hash(contrasena, { type: argon2id });
  ejercicios = await source.query<Array<{ id: string; nombre: string }>>(
    'SELECT id,nombre FROM ejercicio WHERE usuario_id IS NULL ORDER BY nombre LIMIT 4',
  );
  if (ejercicios.length < 4) throw new Error('El catálogo de pruebas requiere al menos cuatro ejercicios.');
});

test.beforeEach(async () => {
  const id = randomUUID();
  usuario = { id, email: `t051.${id}@example.invalid` };
  await source.query(
    'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
    [usuario.id, usuario.email, hashPrueba, 'America/Bogota'],
  );
});

test.afterEach(async () => {
  if (!usuario || !source?.isInitialized) return;
  if (!/^t051\.[0-9a-f-]{36}@example\.invalid$/i.test(usuario.email)) {
    throw new Error('Limpieza T051 rechazada: la cuenta no pertenece a este fixture.');
  }
  await source.query('DELETE FROM usuario WHERE id=$1 AND email=$2', [usuario.id, usuario.email]);
});

test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

test('crea y edita rutinas ordenadas, inicia sesiones independientes y confirma su eliminación', async ({ page }) => {
  await entrar(page);
  await page.goto('/rutinas');
  await expect(page.getByRole('heading', { name: /rutinas/i })).toBeVisible();

  const primerOrden = [ejercicios[2], ejercicios[0], ejercicios[1]];
  await crearRutina(page, 'Rutina Zeta T051', 1, primerOrden.map(({ nombre }) => nombre));
  const [rutina] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM rutina WHERE usuario_id=$1 AND nombre=$2',
    [usuario.id, 'Rutina Zeta T051'],
  );
  expect(Boolean(rutina)).toBe(true);
  expect(await source.query(
    'SELECT ejercicio_id FROM rutina_ejercicio WHERE rutina_id=$1 ORDER BY posicion',
    [rutina.id],
  )).toEqual(primerOrden.map(({ id }) => ({ ejercicio_id: id })));
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();

  await page.getByRole('button', { name: new RegExp(`iniciar.*Rutina Zeta T051`, 'i') }).click();
  await expect(page.getByRole('heading', { name: /entrenamiento en curso/i })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  const [sesion] = await source.query<Array<{ id: string; version: number }>>(
    'SELECT id,version FROM entrenamiento WHERE usuario_id=$1 AND estado=$2',
    [usuario.id, 'en_curso'],
  );
  expect(Boolean(sesion)).toBe(true);
  const original = await source.query(
    `SELECT e.id,e.nombre,er.posicion FROM ejercicio_realizado er
     JOIN ejercicio e ON e.id=er.ejercicio_id
     WHERE er.entrenamiento_id=$1 ORDER BY er.posicion`,
    [sesion.id],
  );
  expect(original.map((ejercicio: { id: string }) => ejercicio.id)).toEqual(primerOrden.map(({ id }) => id));

  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  const selector = page.getByRole('dialog');
  await selector.getByLabel(/buscar ejercicio/i).fill(ejercicios[3].nombre);
  await selector.getByRole('button', { name: ejercicios[3].nombre, exact: true }).click();
  await expect(page.getByRole('heading', { name: ejercicios[3].nombre, exact: true })).toBeVisible();
  expect(await source.query(
    'SELECT ejercicio_id FROM rutina_ejercicio WHERE rutina_id=$1 ORDER BY posicion',
    [rutina.id],
  )).toEqual(primerOrden.map(({ id }) => ({ ejercicio_id: id })));

  await page.goto('/rutinas');
  await page.getByRole('button', { name: /editar.*Rutina Zeta T051/i }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  const ejerciciosNuevos = [ejercicios[1], ejercicios[3]];
  await page.getByRole('checkbox', { name: ejercicios[2].nombre, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: ejercicios[0].nombre, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: ejercicios[3].nombre, exact: true }).check();
  await page.getByRole('button', { name: /guardar rutina/i }).click();
  await expect(page.getByRole('heading', { name: /^rutinas$/i })).toBeVisible();
  expect(await source.query(
    'SELECT ejercicio_id FROM rutina_ejercicio WHERE rutina_id=$1 ORDER BY posicion',
    [rutina.id],
  )).toEqual(ejerciciosNuevos.map(({ id }) => ({ ejercicio_id: id })));
  expect(await source.query(
    `SELECT e.id FROM ejercicio_realizado er JOIN ejercicio e ON e.id=er.ejercicio_id
     WHERE er.entrenamiento_id=$1 ORDER BY er.posicion`,
    [sesion.id],
  )).toEqual(primerOrden.map(({ id }) => ({ id })).concat([{ id: ejercicios[3].id }]));

  await page.getByRole('button', { name: /eliminar.*Rutina Zeta T051/i }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('button', { name: /cancelar/i })).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await dialogo.getByRole('button', { name: /eliminar rutina/i }).click();
  await expect(page.getByRole('heading', { name: 'Rutina Zeta T051', exact: true })).toHaveCount(0);
  expect(await source.query('SELECT id FROM entrenamiento WHERE id=$1', [sesion.id])).toHaveLength(1);
  expect(await source.query(
    `SELECT e.id FROM ejercicio_realizado er JOIN ejercicio e ON e.id=er.ejercicio_id
     WHERE er.entrenamiento_id=$1 ORDER BY er.posicion`,
    [sesion.id],
  )).toEqual(primerOrden.map(({ id }) => ({ id })).concat([{ id: ejercicios[3].id }]));
});

test('V11: elimina en cascada una cuenta que tiene rutina, entrenamiento y series', async ({ page }) => {
  await entrar(page);
  await page.goto('/rutinas');
  await crearRutina(page, 'Rutina cascada T056', 2, ejercicios.slice(0, 3).map(({ nombre }) => nombre));
  await page.getByRole('button', { name: /iniciar.*Rutina cascada T056/i }).click();
  await expect(page.getByRole('heading', { name: /entrenamiento en curso/i })).toBeVisible();
  const [sesion] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM entrenamiento WHERE usuario_id=$1 AND estado=$2',
    [usuario.id, 'en_curso'],
  );
  const [realizado] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM ejercicio_realizado WHERE entrenamiento_id=$1 ORDER BY posicion LIMIT 1',
    [sesion.id],
  );
  await source.query(
    `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
     VALUES ($1,$2,1,8,60,now())`,
    [randomUUID(), realizado.id],
  );

  const [antes] = await source.query<Array<{ rutinas: number; entrenamientos: number; series: number }>>(
    `SELECT
       (SELECT count(*)::int FROM rutina WHERE usuario_id=$1) AS rutinas,
       (SELECT count(*)::int FROM entrenamiento WHERE usuario_id=$1) AS entrenamientos,
       (SELECT count(*)::int FROM serie s
         JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id
         JOIN entrenamiento t ON t.id=er.entrenamiento_id WHERE t.usuario_id=$1) AS series`,
    [usuario.id],
  );
  expect(antes).toEqual({ rutinas: 1, entrenamientos: 1, series: 1 });

  await page.getByRole('link', { name: /^cuenta$/i }).click();
  await page.getByRole('button', { name: /^eliminar cuenta$/i }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/contraseña/i).fill(contrasena);
  await dialogo.getByRole('button', { name: /confirmar|eliminar definitivamente/i }).click();
  await expect(page.getByRole('heading', { name: /^iniciar sesión$/i })).toBeVisible();

  const [despues] = await source.query<Array<{ usuarios: number; rutinas: number; entrenamientos: number; ejercicios: number; series: number }>>(
    `SELECT
       (SELECT count(*)::int FROM usuario WHERE id=$1) AS usuarios,
       (SELECT count(*)::int FROM rutina WHERE usuario_id=$1) AS rutinas,
       (SELECT count(*)::int FROM entrenamiento WHERE usuario_id=$1) AS entrenamientos,
       (SELECT count(*)::int FROM ejercicio_realizado er
         JOIN entrenamiento t ON t.id=er.entrenamiento_id WHERE t.usuario_id=$1) AS ejercicios,
       (SELECT count(*)::int FROM serie s
         JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id
         JOIN entrenamiento t ON t.id=er.entrenamiento_id WHERE t.usuario_id=$1) AS series`,
    [usuario.id],
  );
  expect(despues).toEqual({ usuarios: 0, rutinas: 0, entrenamientos: 0, ejercicios: 0, series: 0 });
});
