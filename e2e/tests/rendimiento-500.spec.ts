import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARGA_EMAIL, CARGA_EJERCICIO_ID, CARGA_PASSWORD, SESIONES_CARGA } from '../../backend/src/database/seeds/carga';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('historial y progreso responden con 500 entrenamientos sembrados', async ({ page }) => {
  if (process.env.NODE_ENV !== 'test') throw new Error('La medición de carga solo puede usar NODE_ENV=test.');
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(CARGA_EMAIL);
  await page.getByLabel(/^contraseña$/i).fill(CARGA_PASSWORD);
  await page.getByRole('button', { name: /^iniciar sesión$|^entrar$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();

  const historial = await page.evaluate(async () => {
    const inicio = performance.now();
    const respuesta = await fetch('/api/entrenamientos?limite=100');
    const datos = await respuesta.json() as { elementos?: unknown[] };
    return { status: respuesta.status, elapsedMs: performance.now() - inicio, count: datos.elementos?.length ?? 0 };
  });
  expect(historial.status).toBe(200);
  expect(historial.count).toBe(100);

  const progreso = await page.evaluate(async (ejercicioId) => {
    const inicio = performance.now();
    const respuesta = await fetch(`/api/progreso/${ejercicioId}?periodo=todo`);
    const datos = await respuesta.json() as { sesiones?: unknown[] };
    return { status: respuesta.status, elapsedMs: performance.now() - inicio, count: datos.sesiones?.length ?? 0 };
  }, CARGA_EJERCICIO_ID);
  expect(progreso.status).toBe(200);
  expect(progreso.count).toBe(SESIONES_CARGA);

  const medicion = {
    sessionCount: SESIONES_CARGA,
    historyMs: Number(historial.elapsedMs.toFixed(2)),
    progressMs: Number(progreso.elapsedMs.toFixed(2)),
  };
  const salida = resolve(__dirname, '../../test-results/perf/consultas-500.json');
  mkdirSync(resolve(salida, '..'), { recursive: true });
  writeFileSync(salida, `${JSON.stringify(medicion, null, 2)}\n`);
  console.log(`Consultas con ${SESIONES_CARGA} entrenamientos: historial ${medicion.historyMs} ms; progreso ${medicion.progressMs} ms.`);
  expect(historial.elapsedMs).toBeLessThan(2000);
  expect(progreso.elapsedMs).toBeLessThan(2000);
});
