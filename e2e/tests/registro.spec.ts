import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import {
  conectarBaseRegistro,
  crearFixtureRegistro,
  fixtureEntrenamientoVacio,
  fixtureMedianoche,
  limpiarCuentaFixture,
  sembrarEntrenamientoInactivo,
  valoresV4
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
  await expect(page.getByRole('heading', { name: /entrenamiento en curso/i })).toBeVisible();
}

async function anadirEjercicio(page: Page, nombre: string) {
  await page.getByRole('button', { name: /añadir ejercicio/i }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/buscar ejercicio/i).fill(nombre);
  await dialogo.getByRole('button', { name: new RegExp(nombre, 'i') }).click();
  await expect(page.getByRole('heading', { name: nombre, exact: true })).toBeVisible();
}

async function agregarSerie(page: Page, peso: number, repeticiones: number) {
  let interacciones = 0;
  await page.getByLabel(/repeticiones/i).last().fill(String(repeticiones));
  interacciones += 1;
  await page.getByLabel(/peso/i).last().fill(String(peso));
  interacciones += 1;
  await page.getByRole('button', { name: /añadir serie|guardar serie|registrar serie/i }).last().click();
  interacciones += 1;
  expect(interacciones).toBeLessThanOrEqual(3);
}

async function agregarSeriePrellenada(page: Page, peso: number, repeticiones: number) {
  await expect(page.getByLabel(/repeticiones/i).last()).toHaveValue(String(repeticiones));
  await expect(page.getByLabel(/peso/i).last()).toHaveValue(String(peso));
  let interacciones = 0;
  await page.getByRole('button', { name: /añadir serie|guardar serie|registrar serie/i }).last().click();
  interacciones += 1;
  expect(interacciones).toBeLessThanOrEqual(3);
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

test('registra dos ejercicios, edita y deshace una eliminación, y conserva el resumen exacto', async ({ page }) => {
  await registrarCuenta(page);
  const inicioSolicitado = Date.now();
  await iniciarEntrenamiento(page);
  await anadirEjercicio(page, fixture.ejercicios[0].nombre);

  await agregarSerie(page, 60, 8);

  for (const serie of fixture.ejercicios[0].series.slice(1)) {
    await agregarSeriePrellenada(page, serie.peso, serie.repeticiones);
  }

  await page.getByRole('button', { name: /editar serie 1/i }).click();
  await page.getByLabel(/peso/i).last().fill(String(fixture.ejercicios[0].series[0].peso));
  await page.getByRole('button', { name: /guardar cambios/i }).click();

  await page.getByRole('button', { name: /eliminar serie 3/i }).click();
  await page.getByRole('button', { name: /deshacer/i }).click();
  await expect(page.getByRole('button', { name: /editar serie 3/i })).toBeVisible();

  await anadirEjercicio(page, fixture.ejercicios[1].nombre);
  await agregarSerie(page, fixture.ejercicios[1].series[0].peso, fixture.ejercicios[1].series[0].repeticiones);
  for (const serie of fixture.ejercicios[1].series.slice(1)) {
    await agregarSeriePrellenada(page, serie.peso, serie.repeticiones);
  }
  await page.getByLabel(/nota del entrenamiento/i).fill(fixture.nota);
  await page.getByRole('button', { name: /finalizar entrenamiento/i }).click();
  await expect(page.getByText(/2 ejercicios/i)).toBeVisible();
  await expect(page.getByText(/5 series/i)).toBeVisible();
  await expect(page.getByText(/2460/)).toBeVisible();

  const filas = await source.query<Array<{
    inicio: Date | string;
    fin: Date | string;
    zona_horaria: string;
    nota_entrenamiento: string | null;
    nombre: string;
    posicion: number;
    nota_ejercicio: string | null;
    orden: number;
    repeticiones: number;
    peso_kg: string;
  }>>(
    `SELECT e.inicio, e.fin, e.zona_horaria, e.nota AS nota_entrenamiento,
            ej.nombre, er.posicion, er.nota AS nota_ejercicio,
            s.orden, s.repeticiones, s.peso_kg
       FROM usuario u
       JOIN entrenamiento e ON e.usuario_id = u.id
       JOIN ejercicio_realizado er ON er.entrenamiento_id = e.id
       JOIN ejercicio ej ON ej.id = er.ejercicio_id
       JOIN serie s ON s.ejercicio_realizado_id = er.id
      WHERE u.email = $1
      ORDER BY er.posicion, s.orden`,
    [fixture.email]
  );
  expect(filas).toHaveLength(5);
  expect(filas.map(({ nombre, posicion, orden, repeticiones, peso_kg }) => ({
    nombre, posicion, orden, repeticiones, pesoKg: Number(peso_kg)
  }))).toEqual([
    { nombre: 'Press de banca', posicion: 1, orden: 1, repeticiones: 8, pesoKg: 62.5 },
    { nombre: 'Press de banca', posicion: 1, orden: 2, repeticiones: 8, pesoKg: 60 },
    { nombre: 'Press de banca', posicion: 1, orden: 3, repeticiones: 8, pesoKg: 60 },
    { nombre: 'Sentadilla', posicion: 2, orden: 1, repeticiones: 5, pesoKg: 100 },
    { nombre: 'Sentadilla', posicion: 2, orden: 2, repeticiones: 5, pesoKg: 100 }
  ]);
  expect(new Date(filas[0].inicio).getTime()).toBeGreaterThanOrEqual(inicioSolicitado - 1000);
  expect(new Date(filas[0].inicio).getTime()).toBeLessThanOrEqual(Date.now());
  expect(filas[0].fin).not.toBeNull();
  expect(filas[0].zona_horaria).toBe(fixture.zonaHoraria);
  expect(filas.every(({ nota_entrenamiento }) => nota_entrenamiento === fixture.nota)).toBe(true);
  expect(filas.every(({ nota_ejercicio }) => nota_ejercicio === null)).toBe(true);
});

test('rechaza un entrenamiento vacío y no lo guarda', async ({ page }) => {
  await registrarCuenta(page);
  await iniciarEntrenamiento(page);
  await page.getByRole('button', { name: /finalizar entrenamiento/i }).click();
  expect(fixtureEntrenamientoVacio.series).toHaveLength(0);
  await expect(page.getByRole('alert')).toContainText(/sin series|vacío/i);
  const filas = await source.query<Array<{ total: number }>>(
    `SELECT count(*)::int AS total
       FROM entrenamiento e JOIN usuario u ON u.id = e.usuario_id
      WHERE u.email = $1`,
    [fixture.email]
  );
  expect(filas[0].total).toBe(0);
});

test('ofrece finalizar un entrenamiento inactivo y usa la hora de la última serie', async ({ page }) => {
  await registrarCuenta(page);
  const datos = await sembrarEntrenamientoInactivo(source, fixture.email);
  await page.goto('/');
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText(/13 horas/i);
  await dialogo.getByRole('button', { name: /finalizar/i }).click();

  const filas = await source.query<Array<{ fin: Date | string; estado: string }>>(
    'SELECT fin, estado FROM entrenamiento WHERE id = $1',
    [datos.entrenamientoId]
  );
  expect(filas).toHaveLength(1);
  expect(filas[0].estado).toBe('finalizado');
  expect(new Date(filas[0].fin).toISOString()).toBe(datos.finEsperado.toISOString());
});

test('conserva la fecha local de un inicio cercano a medianoche', async ({ page }) => {
  await registrarCuenta(page);
  const inicio = new Date(fixtureMedianoche.inicio);
  const respuesta = await page.request.post('/api/entrenamientos', {
    data: {
      id: randomUUID(),
      inicio: fixtureMedianoche.inicio,
      zonaHoraria: fixtureMedianoche.zonaHoraria
    }
  });
  expect(respuesta.status()).toBe(201);
  const partesLocales = new Intl.DateTimeFormat('en-CA', {
    timeZone: fixtureMedianoche.zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(inicio);
  const local = `${partesLocales.find(({ type }) => type === 'year')?.value}-${partesLocales.find(({ type }) => type === 'month')?.value}-${partesLocales.find(({ type }) => type === 'day')?.value}`;
  expect(local).toBe(fixtureMedianoche.diaLocal);

  const filas = await source.query<Array<{ inicio: Date | string; zona_horaria: string }>>(
    `SELECT e.inicio, e.zona_horaria
       FROM entrenamiento e JOIN usuario u ON u.id = e.usuario_id
      WHERE u.email = $1`,
    [fixture.email]
  );
  expect(filas).toHaveLength(1);
  expect(new Date(filas[0].inicio).toISOString()).toBe(inicio.toISOString());
  expect(filas[0].zona_horaria).toBe(fixtureMedianoche.zonaHoraria);
});

test('valida en la API los límites V4 y solo persiste las series aceptadas', async ({ page }) => {
  await registrarCuenta(page);
  const [usuario] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM usuario WHERE email = $1',
    [fixture.email]
  );
  const ejercicioId = randomUUID();
  const ejercicioRealizadoId = randomUUID();
  await source.query(
    `INSERT INTO ejercicio (id, usuario_id, nombre, nombre_normalizado, grupo_muscular)
     VALUES ($1, $2, 'Prueba V4 T015', 'prueba v4 t015', 'pecho')`,
    [ejercicioId, usuario.id]
  );
  const entrenamiento = await page.request.post('/api/entrenamientos', {
    data: { id: fixture.entrenamientoId, inicio: new Date().toISOString(), zonaHoraria: fixture.zonaHoraria }
  });
  expect(entrenamiento.status()).toBe(201);
  const ejercicio = await page.request.post(`/api/entrenamientos/${fixture.entrenamientoId}/ejercicios`, {
    data: { id: ejercicioRealizadoId, ejercicioId, posicion: 1 }
  });
  expect(ejercicio.status()).toBe(201);

  for (const [indice, caso] of valoresV4.entries()) {
    const respuesta = await page.request.post(
      `/api/entrenamientos/${fixture.entrenamientoId}/ejercicios/${ejercicioRealizadoId}/series`,
      {
        data: {
          id: randomUUID(),
          orden: indice + 1,
          repeticiones: caso.repeticiones,
          pesoEntrada: { valor: caso.peso, unidad: caso.unidad },
          registradaEn: new Date().toISOString()
        }
      }
    );
    expect(respuesta.status()).toBe(caso.valido ? 201 : 400);
    if (caso.valido) {
      const cuerpo = await respuesta.json() as { pesoKg: number };
      expect(cuerpo.pesoKg).toBeCloseTo(caso.pesoKg, 2);
    } else {
      expect(await respuesta.json()).toMatchObject({ codigo: 'VALIDACION', campos: expect.any(Object) });
    }
  }

  const filas = await source.query<Array<{ total: number }>>(
    `SELECT count(*)::int AS total
       FROM serie s
       JOIN ejercicio_realizado er ON er.id = s.ejercicio_realizado_id
      WHERE er.id = $1`,
    [ejercicioRealizadoId]
  );
  expect(filas[0].total).toBe(valoresV4.filter(({ valido }) => valido).length);
});
