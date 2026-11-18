import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { DataSource } from 'typeorm';
import { conectarBaseRegistro } from '../../backend/test/utils/registro-fixtures';
import { sembrarCuenta, limpiarCuenta, snapshotCuenta, contrasenaCuenta, contrasenaNueva, contieneSecretos, leerCsv, type CuentaFixture } from '../../backend/test/utils/cuenta-fixtures';
import { listarCorreos, esperarCorreo, eliminarCorreo } from '../../backend/test/utils/correo';

// No capturar pantallas de enlaces de recuperación, descargas ni contraseñas.
// Los selectores nombran controles accesibles; T049 decidirá la composición visual.
test.use({ timezoneId: 'America/Bogota', actionTimeout: 3000, screenshot: 'off', trace: 'off', video: 'off' });
let source: DataSource;
let propio: CuentaFixture, ajeno: CuentaFixture;

test.beforeAll(async () => { source = await conectarBaseRegistro(); });
test.beforeEach(async () => {
  propio = await sembrarCuenta(source); ajeno = await sembrarCuenta(source);
  await listarCorreos(propio.email);
});
test.afterEach(async () => {
  for (const cuenta of [propio, ajeno].filter(Boolean)) {
    for (const correo of await listarCorreos(cuenta.email)) await eliminarCorreo(correo.ID);
    await limpiarCuenta(source, cuenta);
  }
});
test.afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/correo electrónico|email/i).fill(propio.email);
  await page.getByLabel(/^contraseña$/i).fill(contrasenaCuenta);
  await page.getByRole('button', { name: /^iniciar sesión$/i }).click();
  await expect(page.getByRole('heading', { name: /^entrenar$/i })).toBeVisible();
  expect((await page.request.get('/api/auth/yo')).status()).toBe(200);
  await page.getByRole('link', { name: /^cuenta$/i }).click();
  await expect(page.getByRole('heading', { name: /^cuenta$/i })).toBeVisible();
}
async function pedirRecuperacion(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: /olvid|recuperar/i }).click();
  await page.getByLabel(/correo electrónico|email/i).fill(email);
  await page.getByRole('button', { name: /enviar enlace|recuperar contraseña/i }).click();
  const aviso = page.getByText('Si el email está registrado, recibirás un enlace en unos minutos.', { exact: true });
  await expect(aviso).toBeVisible();
  return aviso.textContent();
}
async function restablecer(page: Page, token: string) {
  // No imprimir ni adjuntar el token en aserciones.
  await page.goto(`/restablecer?token=${encodeURIComponent(token)}`);
  await page.getByLabel(/^nueva contraseña$/i).fill(contrasenaNueva);
  await page.getByRole('button', { name: /guardar contraseña|restablecer contraseña/i }).click();
}

test('V10: kg → lb → kg muestra conversión y conserva las series exactas', async ({ page }) => {
  await entrar(page);
  const antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
  for (const [unidad, peso] of [['lb', /132[,.]55\s*lb/], ['kg', /60[,.]13\s*kg/]] as const) {
    await page.getByLabel(/unidad de peso/i).selectOption(unidad);
    await page.getByRole('button', { name: /guardar preferencias/i }).click();
    await expect.poll(async () => (await page.request.get('/api/auth/yo')).json().then((r) => r.unidadPeso)).toBe(unidad);
    await page.reload();
    await expect(page.getByLabel(/unidad de peso/i)).toHaveValue(unidad);
    await page.goto(`/historial/${propio.ids.entrenamiento}`);
    await expect(page.getByText(peso).first()).toBeVisible();
    expect((await snapshotCuenta(source, propio)).serie).toEqual(antes.serie);
    await page.goto('/cuenta');
  }
  expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
});

test('V10: descarga JSON y CSV reales completos, propios y sin secretos', async ({ page }) => {
  await entrar(page);
  for (const formato of ['JSON', 'CSV']) {
    const [archivo] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: new RegExp(`exportar.*${formato}`, 'i') }).click()
    ]);
    expect(archivo.suggestedFilename()).toMatch(new RegExp(`^gymtrack-\\d{4}-\\d{2}-\\d{2}\\.${formato.toLowerCase()}$`));
    const ruta = await archivo.path();
    if (!ruta) throw new Error('La descarga no se guardó.');
    const texto = await readFile(ruta, 'utf8');
    expect(contieneSecretos(texto, [propio, ajeno])).toBe(false);
    expect(texto.includes(ajeno.ids.usuario) || texto.includes(ajeno.email)).toBe(false);
    if (formato === 'JSON') {
      const documento = JSON.stringify(JSON.parse(texto));
      for (const id of [propio.ids.usuario, propio.ids.ejercicio, propio.ids.rutina, propio.ids.entrenamiento, propio.ids.entrenamientoVacio, propio.ids.serie, propio.ids.serieCero]) {
        expect(documento.includes(id)).toBe(true);
      }
    } else {
      const filas = leerCsv(texto);
      expect(filas).toHaveLength(3);
      expect(filas[1]).toHaveLength(filas[0].length);
      const filaSerie = filas.slice(1).find((fila) => fila.includes('60.125'));
      expect(Boolean(filaSerie)).toBe(true);
      expect(filaSerie!.includes('Nota, con "comillas"\ny salto T044')).toBe(true);
    }
  }
});

test('V10: cancelar eliminación conserva cuenta; confirmar con contraseña borra todos sus datos', async ({ page }) => {
  await entrar(page);
  const antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
  await page.getByRole('button', { name: /^eliminar cuenta$/i }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: /cancelar/i }).click();
  expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
  await page.getByRole('button', { name: /^eliminar cuenta$/i }).click();
  await dialogo.getByLabel(/contraseña/i).fill(contrasenaCuenta);
  await dialogo.getByRole('button', { name: /confirmar|eliminar definitivamente/i }).click();
  await expect(page.getByRole('heading', { name: /^iniciar sesión$/i })).toBeVisible();
  expect((await page.request.get('/api/auth/yo')).status()).toBe(401);
  for (const filas of Object.values(await snapshotCuenta(source, propio))) expect(filas.length).toBe(0);
  expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
});

test('V10: recuperación indistinguible, correo solo al registrado y enlace usable una vez', async ({ page }) => {
  const desconocido = `t044.desconocido.${propio.ids.usuario}@example.invalid`;
  const primero = await pedirRecuperacion(page, propio.email);
  expect(await pedirRecuperacion(page, desconocido)).toBe(primero);
  const correo = await esperarCorreo(propio.email);
  const enlace = correo.Text.match(/https:\/\/[^\s<>]+\/restablecer\?token=[^\s<>]+/)?.[0];
  expect(Boolean(enlace)).toBe(true);
  await page.waitForTimeout(500);
  expect(await listarCorreos(desconocido)).toHaveLength(0);
  const token = new URL(enlace!).searchParams.get('token')!;
  await restablecer(page, token);
  await expect(page.getByRole('heading', { name: /^iniciar sesión$/i })).toBeVisible();
  expect((await page.request.post('/api/auth/login', { data: { email: propio.email, contrasena: contrasenaNueva } })).status()).toBe(200);
  await restablecer(page, token);
  await expect(page.getByRole('alert')).toContainText(/enlace.*(válido|usado|caducado)/i);
  await expect(page.getByRole('link', { name: /solicitar.*enlace|recuperar/i })).toBeVisible();
});

test('V10: enlace caducado muestra rechazo claro y permite pedir otro', async ({ page }) => {
  await source.query(`UPDATE token_recuperacion SET creado_en=now()-interval '2 hours', expira_en=now()-interval '1 second' WHERE id=$1`, [propio.ids.token]);
  const antes = await snapshotCuenta(source, propio);
  await restablecer(page, propio.token);
  await expect(page.getByRole('alert')).toContainText(/enlace.*(válido|caducado)/i);
  await expect(page.getByRole('link', { name: /solicitar.*enlace|recuperar/i })).toBeVisible();
  expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
});

test('US4: preferencias y formularios de recuperación tienen etiquetas, foco, tamaño táctil y axe AA', async ({ page }) => {
  await entrar(page);
  const unidad = page.getByLabel(/unidad de peso/i);
  await expect(unidad).toBeVisible();
  await unidad.focus(); await expect(unidad).toBeFocused();
  const caja = await unidad.boundingBox();
  expect(Boolean(caja && caja.width >= 44 && caja.height >= 44)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.goto('/recuperar');
  await expect(page.getByLabel(/correo electrónico|email/i)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
