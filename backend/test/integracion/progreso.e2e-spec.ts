import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import {
  fuenteDatosIntegracion,
  limpiarEsquemaIntegracion,
  prepararEsquemaIntegracion
} from '../utils/infraestructura';

interface SerieFixture {
  pesoKg: number;
  repeticiones: number;
}

interface SesionFixture {
  id: string;
  ejercicioId: string;
  fecha: string;
  series: SerieFixture[];
  esperado: { pesoMaxKg: number; volumenKg: number; unoRmKg: number | null };
}

interface EjercicioFixture {
  id: string;
  nombre: string;
  grupoMuscular: string;
}

interface FixtureProgreso {
  ejercicios: EjercicioFixture[];
  sesiones: SesionFixture[];
  periodos: Record<string, string[]>;
  records: Record<string, {
    sesionesAnteriores: number;
    pesoMax: { valorKg: number; fecha: string; entrenamientoId: string } | null;
    unoRm: { valorKg: number; fecha: string; entrenamientoId: string } | null;
    volumenSesion: { valorKg: number; fecha: string; entrenamientoId: string } | null;
  }>;
}

const fixture = JSON.parse(readFileSync(
  resolve(__dirname, '../../../packages/domain/test/fixtures/progreso-referencia.json'),
  'utf8'
)) as FixtureProgreso;
const password = 'T036-solo-pruebas-2026!';
const usuarioA = '00000000-0000-4000-8000-000000000036';
const usuarioB = '00000000-0000-4000-8000-000000000037';

describe('T036: aceptación REST de progreso y récords', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let hashPrueba: string;

  beforeAll(async () => { hashPrueba = await hash(password, { type: argon2id }); });

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    await source.query(
      'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4),($5,$6,$3,$4)',
      [usuarioA, 't036.a@example.invalid', hashPrueba, 'America/Bogota', usuarioB, 't036.b@example.invalid']
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app);
    await app.init();
    await sembrarSesiones(usuarioA, fixture.sesiones);
  });

  afterEach(async () => {
    try {
      if (ownsSchema && source?.isInitialized) await limpiarEsquemaIntegracion(source);
    } finally {
      ownsSchema = false;
      await app?.close();
      app = undefined;
      if (source?.isInitialized) await source.destroy();
    }
  });

  const cliente = () => {
    if (!app) throw new Error('Aplicación de prueba no inicializada.');
    return peticionHttps(app);
  };

  async function login(email: string) {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email, contrasena: password }).expect(200);
    return agent;
  }

  async function sembrarSesiones(usuarioId: string, sesiones: SesionFixture[]) {
    for (const ejercicio of fixture.ejercicios) {
      await source.query(
        `INSERT INTO ejercicio (id,nombre,nombre_normalizado,grupo_muscular,usuario_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [ejercicio.id, ejercicio.nombre, ejercicio.nombre.toLocaleLowerCase('es'), ejercicio.grupoMuscular, usuarioId]
      );
    }
    for (const sesion of sesiones) {
      const inicio = `${sesion.fecha}T18:00:00.000Z`;
      const ejercicioRealizadoId = randomUUID();
      await source.query(
        `INSERT INTO entrenamiento
           (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
         VALUES ($1,$2,'finalizado',$3,$4,'America/Bogota',$4)`,
        [sesion.id, usuarioId, inicio, `${sesion.fecha}T19:00:00.000Z`]
      );
      await source.query(
        `INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion)
         VALUES ($1,$2,$3,1)`,
        [ejercicioRealizadoId, sesion.id, sesion.ejercicioId]
      );
      for (const [index, serie] of sesion.series.entries()) {
        await source.query(
          `INSERT INTO serie
             (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            ejercicioRealizadoId,
            index + 1,
            serie.repeticiones,
            serie.pesoKg,
            `${sesion.fecha}T18:${String(index + 1).padStart(2, '0')}:00.000Z`
          ]
        );
      }
    }
  }

  it.each(['1m', '3m', '1a', 'todo'])('filtra %s y calcula peso, volumen y 1RM contra el fixture manual', async (periodo) => {
    const agent = await login('t036.a@example.invalid');
    const ejercicio = fixture.ejercicios[0];
    const response = await agent.get(`/api/progreso/${ejercicio.id}?periodo=${periodo}`).expect(200);
    const idsEsperados = fixture.periodos[periodo];
    const sesionesEsperadas = fixture.sesiones.filter((sesion) => idsEsperados.includes(sesion.id));

    expect(response.body).toMatchObject({
      ejercicioId: ejercicio.id,
      periodo,
      suficientesParaTendencia: sesionesEsperadas.length > 1
    });
    expect(response.body.sesiones).toHaveLength(sesionesEsperadas.length);
    for (const [index, sesion] of sesionesEsperadas.entries()) {
      expect(response.body.sesiones[index]).toMatchObject({
        entrenamientoId: sesion.id,
        fecha: sesion.fecha,
        pesoMaxKg: sesion.esperado.pesoMaxKg,
        volumenKg: sesion.esperado.volumenKg
      });
      if (sesion.esperado.unoRmKg === null) {
        expect(response.body.sesiones[index].unoRmKg).toBeNull();
      } else {
        expect(response.body.sesiones[index].unoRmKg).toBeCloseTo(sesion.esperado.unoRmKg, 4);
      }
    }
  });

  it('deriva récords, conserva la primera fecha en empates y representa cero/null correctamente', async () => {
    const agent = await login('t036.a@example.invalid');
    const press = fixture.ejercicios[0];
    const dominadas = fixture.ejercicios[1];
    const pressRecords = await agent.get(`/api/progreso/${press.id}/records`).expect(200);
    expect(pressRecords.body).toMatchObject(fixture.records.pressDeBanca);

    const zeroProgress = await agent.get(`/api/progreso/${dominadas.id}?periodo=todo`).expect(200);
    expect(zeroProgress.body.sesiones).toMatchObject([{
      entrenamientoId: fixture.sesiones[4].id,
      pesoMaxKg: 0,
      volumenKg: 0,
      unoRmKg: null
    }]);
    const zeroRecords = await agent.get(`/api/progreso/${dominadas.id}/records`).expect(200);
    expect(zeroRecords.body).toMatchObject(fixture.records.dominadas);
  });

  it('no expone progreso de otro usuario ni inventa récords antes de su primera sesión', async () => {
    const ajeno = await login('t036.b@example.invalid');
    await ajeno.get(`/api/progreso/${fixture.ejercicios[0].id}`).expect(404);
    const ejercicioNuevo = {
      id: '10000000-0000-4000-8000-000000000038',
      nombre: 'Press T036 sin historial',
      grupoMuscular: 'pecho'
    };
    await source.query(
      `INSERT INTO ejercicio (id,nombre,nombre_normalizado,grupo_muscular,usuario_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [ejercicioNuevo.id, ejercicioNuevo.nombre, ejercicioNuevo.nombre.toLowerCase(), ejercicioNuevo.grupoMuscular, usuarioB]
    );
    const records = await ajeno.get(`/api/progreso/${ejercicioNuevo.id}/records`).expect(200);
    expect(records.body).toEqual({
      sesionesAnteriores: 0,
      pesoMax: null,
      unoRm: null,
      volumenSesion: null
    });
  });
});
