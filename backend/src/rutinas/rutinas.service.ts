import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { errorRutinaNoEncontrada, errorVersionRutina, validarActualizacionRutina, validarRutina } from './rutinas.validation';

export interface EjercicioRutina {
  posicion: number;
  ejercicioId: string;
  nombre: string;
}

export interface RutinaDto {
  id: string;
  nombre: string;
  diaSemana: number;
  version: number;
  ejercicios: EjercicioRutina[];
}

const SELECT_RUTINAS = `SELECT r.id, r.nombre, r.dia_semana AS "diaSemana", r.version,
  COALESCE(json_agg(json_build_object('posicion', re.posicion, 'ejercicioId', e.id, 'nombre', e.nombre)
    ORDER BY re.posicion) FILTER (WHERE re.posicion IS NOT NULL), '[]'::json) AS ejercicios
FROM rutina r
LEFT JOIN rutina_ejercicio re ON re.rutina_id = r.id
LEFT JOIN ejercicio e ON e.id = re.ejercicio_id`;

@Injectable()
export class RutinasService {
  constructor(private readonly source: DataSource) {}

  async listar(usuarioId: string): Promise<RutinaDto[]> {
    return this.source.query<RutinaDto[]>(`${SELECT_RUTINAS}
      WHERE r.usuario_id = $1
      GROUP BY r.id
      ORDER BY r.dia_semana, lower(r.nombre) COLLATE "C", r.nombre COLLATE "C", r.id`, [usuarioId]);
  }

  async obtener(usuarioId: string, id: string): Promise<RutinaDto> {
    const [rutina] = await this.source.query<RutinaDto[]>(`${SELECT_RUTINAS}
      WHERE r.usuario_id = $1 AND r.id = $2
      GROUP BY r.id`, [usuarioId, id]);
    if (!rutina) throw errorRutinaNoEncontrada();
    return rutina;
  }

  async crear(usuarioId: string, entrada: unknown): Promise<RutinaDto> {
    const datos = validarRutina(entrada);
    const id = randomUUID();
    return this.source.transaction(async (manager) => {
      await this.validarPropiedadEjercicios(manager, usuarioId, datos.ejercicioIds);
      await manager.query(
        'INSERT INTO rutina (id, usuario_id, nombre, dia_semana) VALUES ($1, $2, $3, $4)',
        [id, usuarioId, datos.nombre, datos.diaSemana],
      );
      await this.insertarEjercicios(manager, id, datos.ejercicioIds);
      return this.obtenerConManager(manager, usuarioId, id);
    });
  }

  async actualizar(usuarioId: string, id: string, entrada: unknown): Promise<RutinaDto> {
    const cambios = validarActualizacionRutina(entrada);
    return this.source.transaction(async (manager) => {
      const [actual] = await manager.query<Array<{ id: string; version: number }>>(
        'SELECT id, version FROM rutina WHERE id = $1 AND usuario_id = $2 FOR UPDATE', [id, usuarioId],
      );
      if (!actual) throw errorRutinaNoEncontrada();
      if (actual.version !== cambios.version) {
        throw errorVersionRutina(await this.obtenerConManager(manager, usuarioId, id));
      }

      if (cambios.ejercicioIds !== undefined) {
        await this.validarPropiedadEjercicios(manager, usuarioId, cambios.ejercicioIds);
      }
      await manager.query(
        `UPDATE rutina
            SET nombre = COALESCE($3, nombre),
                dia_semana = COALESCE($4, dia_semana),
                version = version + 1
          WHERE id = $1 AND usuario_id = $2 AND version = $5`,
        [id, usuarioId, cambios.nombre ?? null, cambios.diaSemana ?? null, cambios.version],
      );
      if (cambios.ejercicioIds !== undefined) {
        await manager.query('DELETE FROM rutina_ejercicio WHERE rutina_id = $1', [id]);
        await this.insertarEjercicios(manager, id, cambios.ejercicioIds);
      }
      return this.obtenerConManager(manager, usuarioId, id);
    });
  }

  async eliminar(usuarioId: string, id: string, version: number): Promise<void> {
    await this.source.transaction(async (manager) => {
      const [actual] = await manager.query<Array<{ id: string; version: number }>>(
        'SELECT id, version FROM rutina WHERE id = $1 AND usuario_id = $2 FOR UPDATE', [id, usuarioId],
      );
      if (!actual) throw errorRutinaNoEncontrada();
      if (actual.version !== version) {
        throw errorVersionRutina(await this.obtenerConManager(manager, usuarioId, id));
      }
      await manager.query('DELETE FROM rutina WHERE id = $1 AND usuario_id = $2 AND version = $3', [id, usuarioId, version]);
    });
  }

  private async validarPropiedadEjercicios(manager: EntityManager, usuarioId: string, ejercicioIds: string[]) {
    const filas = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM ejercicio
        WHERE id = ANY($1::uuid[]) AND (usuario_id IS NULL OR usuario_id = $2)`,
      [ejercicioIds, usuarioId],
    );
    const disponibles = new Set(filas.map(({ id }) => id));
    if (ejercicioIds.some((ejercicioId) => !disponibles.has(ejercicioId))) throw errorRutinaNoEncontrada();
  }

  private async insertarEjercicios(manager: EntityManager, rutinaId: string, ejercicioIds: string[]) {
    await manager.query(
      `INSERT INTO rutina_ejercicio (rutina_id, posicion, ejercicio_id)
       SELECT $1, posicion::integer, ejercicio_id
         FROM unnest($2::uuid[]) WITH ORDINALITY AS lista(ejercicio_id, posicion)`,
      [rutinaId, ejercicioIds],
    );
  }

  private async obtenerConManager(manager: EntityManager, usuarioId: string, id: string): Promise<RutinaDto> {
    const [rutina] = await manager.query<RutinaDto[]>(`${SELECT_RUTINAS}
      WHERE r.usuario_id = $1 AND r.id = $2
      GROUP BY r.id`, [usuarioId, id]);
    if (!rutina) throw errorRutinaNoEncontrada();
    return rutina;
  }
}
