import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { conectarBaseRegistro, crearFixtureRegistro, limpiarCuentaFixture } from '../../backend/test/utils/registro-fixtures';

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

async function sembrarHistorial() {
  const [usuario] = await source.query<Array<{ id: string }>>('SELECT id FROM usuario WHERE email=$1', [fixture.email]);
  if (!usuario) throw new Error('No se encontró la cuenta de fixture del historial.');
  const [press] = await source.query<Array<{ id: string }>>("SELECT id FROM ejercicio WHERE nombre='Press de banca' AND usuario_id IS NULL");
  const [sentadilla] = await source.query<Array<{ id: string }>>("SELECT id FROM ejercicio WHERE nombre='Sentadilla' AND usuario_id IS NULL");
  if (!press || !sentadilla) throw new Error('Faltan ejercicios del catálogo para el fixture del historial.');

  async function sesion(inicio: string, ejercicios: Array<{ ejercicioId: string; posicion: number; series: Array<{ orden: number; peso: number; repeticiones: number }> }>) {
    const id = randomUUID();
    const fin = new Date(new Date(inicio).getTime() + 60 * 60_000);
    await source.query(
      `INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
       VALUES ($1,$2,'finalizado',$3,$4,$5,$3)`,
      [id, usuario.id, inicio, fin, fixture.zonaHoraria],
    );
    for (const ejercicio of ejercicios) {
      const realizado = randomUUID();
      await source.query(
        'INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,$4)',
        [realizado, id, ejercicio.ejercicioId, ejercicio.posicion],
      );
      for (const serie of ejercicio.series) {
        await source.query(
          `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), realizado, serie.orden, serie.repeticiones, serie.peso, inicio],
        );
      }
    }
    return id;
  }

  const antigua = await sesion('2026-11-10T04:30:00.000Z', [
    { ejercicioId: press.id, posicion: 1, series: [{ orden: 1, peso: 50, repeticiones: 10 }] },
  ]);
  const reciente = await sesion('2026-11-12T18:00:00.000Z', [
    { ejercicioId: press.id, posicion: 1, series: [
      { orden: 1, peso: 62.5, repeticiones: 8 },
      { orden: 2, peso: 60, repeticiones: 8 },
    ] },
    { ejercicioId: sentadilla.id, posicion: 2, series: [{ orden: 1, peso: 100, repeticiones: 5 }] },
  ]);
  return { antigua, reciente };
}

test.beforeAll(async () => { source = await conectarBaseRegistro(); });
test.beforeEach(() => { fixture = crearFixtureRegistro(); });
test.afterEach(async () => { if (fixture && source?.isInitialized) await limpiarCuentaFixture(source, fixture.email); });
test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

test('consulta, filtra, pagina, corrige y elimina sesiones pasadas con confirmación accesible', async ({ page }) => {
  await registrarCuenta(page);
  const sesiones = await sembrarHistorial();
  const inicioBusqueda = Date.now();
  await page.getByRole('link', { name: /historial/i }).click();
  await expect(page.getByRole('heading', { name: /historial/i })).toBeVisible();
  await expect(page.getByText(/2 ejercicios/i).first()).toBeVisible();
  await expect(page.getByText(/3 series/i).first()).toBeVisible();
  await expect(page.getByText(/1[.\s]?480/).first()).toBeVisible();
  await expect(page.getByText(/60 min/i).first()).toBeVisible();

  const encontrar = page.getByRole('link', { name: /ver entrenamiento del/i }).first();
  await encontrar.click();
  await expect(page).toHaveURL(new RegExp(`/historial/${sesiones.reciente}`));
  await expect(page.getByRole('heading', { name: /detalle del entrenamiento/i })).toBeVisible();
  const tiempoBusquedaMs = Date.now() - inicioBusqueda;
  console.info(`[SC-007] Historial a detalle: ${tiempoBusquedaMs} ms`);
  expect(tiempoBusquedaMs).toBeLessThan(15_000);
  const ejercicios = page.getByRole('heading', { level: 2 });
  await expect(ejercicios.nth(0)).toHaveText('Press de banca');
  await expect(ejercicios.nth(1)).toHaveText('Sentadilla');
  const { AxeBuilder } = await import('@axe-core/playwright');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const serie = page.getByRole('button', { name: /editar serie 1/i }).first();
  await serie.click();
  await page.getByLabel(/repeticiones/i).last().fill('9');
  await page.getByRole('button', { name: /guardar cambios/i }).click();
  await expect(page.getByRole('status')).toHaveText('Cambios de la serie guardados.');
  await expect(page.getByRole('button', { name: /editar serie 1/i }).first()).toBeVisible();
  await expect(page.getByText(/62,5 kg × 9/)).toBeVisible();
  const [seriePersistida] = await source.query<Array<{ repeticiones: number }>>(
    `SELECT s.repeticiones FROM serie s
     JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id
     WHERE er.entrenamiento_id=$1 ORDER BY er.posicion,s.orden LIMIT 1`,
    [sesiones.reciente],
  );
  expect(seriePersistida?.repeticiones).toBe(9);
  await page.getByLabel(/nota del entrenamiento/i).fill('Corrección en historial');
  await page.getByRole('button', { name: /guardar nota/i }).click();
  await expect(page.getByRole('status')).toHaveText('Nota guardada.');
  await expect(page.getByLabel(/nota del entrenamiento/i)).toHaveValue('Corrección en historial');
  await expect(page.getByRole('button', { name: /guardar nota/i })).toBeDisabled();
  const [notaPersistida] = await source.query<Array<{ nota: string | null }>>(
    'SELECT nota FROM entrenamiento WHERE id=$1',
    [sesiones.reciente],
  );
  expect(notaPersistida?.nota).toBe('Corrección en historial');

  await page.getByRole('link', { name: /volver al historial/i }).click();
  await page.getByLabel(/ejercicio/i).selectOption({ label: 'Press de banca' });
  await page.getByLabel(/desde/i).fill('2026-11-09');
  await page.getByLabel(/hasta/i).fill('2026-11-09');
  await page.getByRole('button', { name: /aplicar filtros/i }).click();
  await expect(page).toHaveURL(/ejercicioId=.*desde=2026-11-09.*hasta=2026-11-09/);
  await expect(page.getByText(/50/)).toBeVisible();
  await expect(page.getByText(/100/)).toHaveCount(0);
  await page.getByRole('button', { name: /limpiar filtros/i }).click();
  await page.getByRole('link', { name: /ver entrenamiento del/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/historial/${sesiones.reciente}`));

  await page.getByRole('button', { name: /eliminar entrenamiento/i }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Cancelar', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Eliminar entrenamiento', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Eliminar entrenamiento', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialogoConfirmar = page.getByRole('dialog');
  await dialogoConfirmar.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: /detalle del entrenamiento/i })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar entrenamiento', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /eliminar entrenamiento/i }).click();
  await expect(page).toHaveURL(/\/historial$/);
  await expect(page.getByRole('link', { name: new RegExp(sesiones.reciente) })).toHaveCount(0);
  const eliminada = await source.query<Array<{ id: string }>>('SELECT id FROM entrenamiento WHERE id=$1', [sesiones.reciente]);
  expect(eliminada).toHaveLength(0);
  await page.getByRole('link', { name: /registrar un entrenamiento pasado/i }).click();
  await expect(page.getByLabel('Fecha')).toBeVisible();
});

test('muestra estado vacío y filtros mediante URL y supera axe', async ({ page }) => {
  await registrarCuenta(page);
  await page.goto('/historial?desde=2026-11-09&hasta=2026-11-09');
  await expect(page.getByRole('heading', { name: /historial/i })).toBeVisible();
  await expect(page.getByText(/no hay entrenamientos/i)).toBeVisible();
  const { AxeBuilder } = await import('@axe-core/playwright');
  const resultado = await new AxeBuilder({ page }).analyze();
  expect(resultado.violations).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
