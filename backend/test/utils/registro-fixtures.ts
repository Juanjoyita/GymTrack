import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../src/database/data-source';

const CONTRASENA_T015 = 'T015-solo-pruebas-2026!';
const EMAIL_T015 = /^t015\.[0-9a-f-]{36}@example\.invalid$/i;
const TRECE_HORAS = 13 * 60 * 60 * 1000;

export const valoresV4 = [
  { peso: 0, unidad: 'kg', repeticiones: 10, valido: true, pesoKg: 0 },
  { peso: 500, unidad: 'kg', repeticiones: 1, valido: true, pesoKg: 500 },
  { peso: 500.01, unidad: 'kg', repeticiones: 1, valido: false },
  { peso: 1102.31, unidad: 'lb', repeticiones: 1, valido: true, pesoKg: 499.998 },
  { peso: 1102.32, unidad: 'lb', repeticiones: 1, valido: false },
  { peso: 60.125, unidad: 'kg', repeticiones: 8, valido: false },
  { peso: -5, unidad: 'kg', repeticiones: 8, valido: false },
  { peso: 60, unidad: 'kg', repeticiones: 0, valido: false },
  { peso: 60, unidad: 'kg', repeticiones: 101, valido: false },
  { peso: 60, unidad: 'kg', repeticiones: 8.5, valido: false }
] as const;

export const fixtureMedianoche = {
  inicio: '2026-11-11T04:30:00.000Z',
  zonaHoraria: 'America/Bogota',
  diaLocal: '2026-11-10'
} as const;

export const fixtureEntrenamientoVacio = { series: [] } as const;

export function crearFixtureRegistro() {
  const cuentaId = randomUUID();
  return {
    email: `t015.${cuentaId}@example.invalid`,
    contrasena: CONTRASENA_T015,
    entrenamientoId: randomUUID(),
    zonaHoraria: 'America/Bogota',
    nota: 'Fixture de registro T015',
    ejercicios: [
      {
        nombre: 'Press de banca',
        series: [
          { peso: 62.5, repeticiones: 8 },
          { peso: 60, repeticiones: 8 },
          { peso: 60, repeticiones: 8 }
        ]
      },
      {
        nombre: 'Sentadilla',
        series: [
          { peso: 100, repeticiones: 5 },
          { peso: 100, repeticiones: 5 }
        ]
      }
    ]
  };
}

export function crearFixtureInactividad(ahora = new Date()) {
  const ultimaActividad = new Date(ahora.getTime() - TRECE_HORAS);
  return {
    inicio: new Date(ultimaActividad.getTime() - 60 * 60 * 1000),
    ultimaActividad,
    serieRegistradaEn: ultimaActividad,
    finEsperado: ultimaActividad
  };
}

function exigirBaseDePruebas(source: DataSource) {
  if (
    process.env.NODE_ENV !== 'test' ||
    source.options.type !== 'postgres' ||
    source.options.database !== 'gymtrack_test'
  ) {
    throw new Error('Fixture T015 rechazado: solo se permite gymtrack_test con NODE_ENV=test.');
  }
}

export async function conectarBaseRegistro(): Promise<DataSource> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Fixture T015 rechazado: NODE_ENV debe ser test.');
  }

  const options = databaseOptions();
  if (options.type !== 'postgres' || options.database !== 'gymtrack_test') {
    throw new Error('Fixture T015 rechazado: solo se permite conectar a gymtrack_test.');
  }
  const source = await new DataSource(options).initialize();
  exigirBaseDePruebas(source);
  const [database] = await source.query<Array<{ database: string; schema: string }>>(
    'SELECT current_database() AS database, current_schema() AS schema'
  );
  if (database?.database !== 'gymtrack_test' || database.schema !== 'public') {
    await source.destroy();
    throw new Error('Fixture T015 rechazado: se requiere gymtrack_test.public.');
  }
  await source.runMigrations();
  return source;
}

export async function limpiarCuentaFixture(source: DataSource, email: string) {
  exigirBaseDePruebas(source);
  if (!EMAIL_T015.test(email)) {
    throw new Error('Limpieza T015 rechazada: el email no pertenece a un fixture T015.');
  }
  const [database] = await source.query<Array<{ database: string; schema: string }>>(
    'SELECT current_database() AS database, current_schema() AS schema'
  );
  if (database?.database !== 'gymtrack_test' || database.schema !== 'public') {
    throw new Error('Limpieza T015 rechazada: se requiere gymtrack_test.public.');
  }
  await source.query('DELETE FROM usuario WHERE email = $1', [email]);
}

export async function sembrarEntrenamientoInactivo(source: DataSource, email: string) {
  exigirBaseDePruebas(source);
  if (!EMAIL_T015.test(email)) {
    throw new Error('Fixture T015 rechazado: el email no pertenece a un fixture T015.');
  }
  const [database] = await source.query<Array<{ database: string; schema: string }>>(
    'SELECT current_database() AS database, current_schema() AS schema'
  );
  if (database?.database !== 'gymtrack_test' || database.schema !== 'public') {
    throw new Error('Fixture T015 rechazado: se requiere gymtrack_test.public.');
  }

  const [usuario] = await source.query<Array<{ id: string }>>(
    'SELECT id FROM usuario WHERE email = $1',
    [email]
  );
  if (!usuario) throw new Error('Fixture T015 no encontrado: primero debe crearse la cuenta.');

  const datos = crearFixtureInactividad();
  const ejercicioId = randomUUID();
  const entrenamientoId = randomUUID();
  const ejercicioRealizadoId = randomUUID();
  const serieId = randomUUID();

  await source.query(
    `INSERT INTO ejercicio (id, usuario_id, nombre, nombre_normalizado, grupo_muscular)
     VALUES ($1, $2, $3, $4, $5)`,
    [ejercicioId, usuario.id, 'Press T015 inactividad', 'press t015 inactividad', 'pecho']
  );
  await source.query(
    `INSERT INTO entrenamiento
       (id, usuario_id, estado, inicio, zona_horaria, ultima_actividad_en)
     VALUES ($1, $2, 'en_curso', $3, 'America/Bogota', $4)`,
    [entrenamientoId, usuario.id, datos.inicio, datos.ultimaActividad]
  );
  await source.query(
    `INSERT INTO ejercicio_realizado (id, entrenamiento_id, ejercicio_id, posicion)
     VALUES ($1, $2, $3, 1)`,
    [ejercicioRealizadoId, entrenamientoId, ejercicioId]
  );
  await source.query(
    `INSERT INTO serie
       (id, ejercicio_realizado_id, orden, repeticiones, peso_kg, registrada_en)
     VALUES ($1, $2, 1, 8, 60, $3)`,
    [serieId, ejercicioRealizadoId, datos.serieRegistradaEn]
  );
  return { entrenamientoId, serieId, ...datos };
}
