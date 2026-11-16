import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import {
  fuenteDatosIntegracion,
  limpiarEsquemaIntegracion,
  prepararEsquemaIntegracion,
} from '../utils/infraestructura';

const password = 'T039-recalculo-pruebas-2026!';

describe('T039: récords recalculados desde el estado persistido', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let ownsSchema = false;
  let usuarioId: string;
  let ejercicioId: string;
  let serieFinalizadaId: string;
  let entrenamientoActualId: string;

  beforeEach(async () => {
    source = fuenteDatosIntegracion();
    await source.initialize();
    await prepararEsquemaIntegracion(source);
    ownsSchema = true;
    await source.runMigrations();
    usuarioId = randomUUID();
    ejercicioId = randomUUID();
    serieFinalizadaId = randomUUID();
    entrenamientoActualId = randomUUID();
    const hashPrueba = await hash(password, { type: argon2id });
    await source.query(
      'INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
      [usuarioId, `t039.${usuarioId}@example.invalid`, hashPrueba, 'America/Bogota'],
    );
    await source.query(
      `INSERT INTO ejercicio (id,nombre,nombre_normalizado,grupo_muscular,usuario_id)
       VALUES ($1,'Sentadilla T039','sentadilla t039','cuadriceps',$2)`,
      [ejercicioId, usuarioId],
    );

    const entrenamientoFinalizadoId = randomUUID();
    const ejercicioFinalizadoId = randomUUID();
    const ejercicioActualId = randomUUID();
    const serieActualId = randomUUID();
    await source.query(
      `INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
       VALUES ($1,$2,'finalizado',now()-interval '1 day',now()-interval '23 hours','UTC',now()),
              ($3,$2,'en_curso',now(),NULL,'UTC',now())`,
      [entrenamientoFinalizadoId, usuarioId, entrenamientoActualId],
    );
    await source.query(
      `INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion)
       VALUES ($1,$2,$3,1),($4,$5,$3,1)`,
      [ejercicioFinalizadoId, entrenamientoFinalizadoId, ejercicioId, ejercicioActualId, entrenamientoActualId],
    );
    await source.query(
      `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
       VALUES ($1,$2,1,5,50,now()-interval '23 hours'),($3,$4,1,5,100,now())`,
      [serieFinalizadaId, ejercicioFinalizadoId, serieActualId, ejercicioActualId],
    );

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app);
    await app.init();
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

  it('excluye la sesión activa y recalcula récords al editar y eliminar una serie', async () => {
    if (!app) throw new Error('Aplicación de prueba no inicializada.');
    const agent = peticionHttps(app);
    await agent.post('/api/auth/login')
      .send({ email: `t039.${usuarioId}@example.invalid`, contrasena: password }).expect(200);

    const url = `/api/progreso/${ejercicioId}/records?excluirEntrenamientoId=${entrenamientoActualId}`;
    await agent.get(url).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({
        sesionesAnteriores: 1,
        pesoMax: { valorKg: 50 },
        unoRm: { valorKg: 50 * (1 + 5 / 30) },
        volumenSesion: { valorKg: 250 },
      });
    });

    await source.query('UPDATE serie SET peso_kg=70, version=version+1 WHERE id=$1', [serieFinalizadaId]);
    await agent.get(url).expect(200).expect(({ body }) => {
      expect(body.pesoMax.valorKg).toBe(70);
      expect(body.unoRm.valorKg).toBe(70 * (1 + 5 / 30));
      expect(body.volumenSesion.valorKg).toBe(350);
    });

    await source.query('DELETE FROM serie WHERE id=$1', [serieFinalizadaId]);
    await agent.get(url).expect(200).expect(({ body }) => {
      expect(body).toEqual({ sesionesAnteriores: 0, pesoMax: null, unoRm: null, volumenSesion: null });
    });
  });
});
