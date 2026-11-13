import { expect, test } from '@playwright/test';
import { DataSource } from 'typeorm';
import { crearDosUsuariosPrueba } from '../../backend/test/utils/factorias';
import {
  limpiarEsquemaIntegracion,
  prepararEsquemaIntegracion,
  fuenteDatosIntegracion
} from '../../backend/test/utils/infraestructura';

let source: DataSource;
let schemaCreated = false;

test.beforeAll(async () => {
  source = fuenteDatosIntegracion();
  await source.initialize();
  await prepararEsquemaIntegracion(source);
  schemaCreated = true;
  await source.runMigrations();
});

test.afterAll(async () => {
  if (source?.isInitialized) {
    try {
      if (schemaCreated && process.env.KEEP_TEST_SCHEMA !== '1') {
        await limpiarEsquemaIntegracion(source);
      }
    } finally {
      await source.destroy();
    }
  }
});

test('conecta a gymtrack_test, crea dos usuarios aislados y captura el viewport móvil', async ({ page }, testInfo) => {
  const [database] = await source.query('SELECT current_database() AS database, current_schema() AS schema');
  expect(database).toEqual({ database: 'gymtrack_test', schema: source.options.schema });

  const users = await crearDosUsuariosPrueba(source);
  expect(users.map(({ id, email }) => ({ id, email }))).toEqual([
    { id: '00000000-0000-4000-8000-000000000001', email: 't006.usuario1@example.invalid' },
    { id: '00000000-0000-4000-8000-000000000002', email: 't006.usuario2@example.invalid' }
  ]);
  expect(await source.getRepository('Usuario').count()).toBe(2);

  expect(page.viewportSize()).toEqual({ width: 360, height: 800 });
  await page.setContent('<main><h1>Infraestructura E2E</h1><p>Viewport móvil de 360 × 800.</p></main>');
  const screenshotPath = testInfo.outputPath('infraestructura-360x800.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('infraestructura-360x800.png', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});
