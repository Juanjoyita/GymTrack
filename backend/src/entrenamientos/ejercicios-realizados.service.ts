import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ejercicio, type EjercicioRow } from '../database/entities/ejercicio';
import { EjercicioRealizado, type EjercicioRealizadoRow } from '../database/entities/ejercicio_realizado';
import { Entrenamiento, type EntrenamientoRow } from '../database/entities/entrenamiento';

const missing = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null });
const invalid = (campo: string) => new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: { [campo]: 'Valor inválido.' }, actual: null });
const conflict = (actual: unknown) => new ConflictException({ codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual });
@Injectable()
export class EjerciciosRealizadosService {
  constructor(
    @InjectRepository(Entrenamiento) private readonly entrenamientos: Repository<EntrenamientoRow>,
    @InjectRepository(EjercicioRealizado) private readonly realizados: Repository<EjercicioRealizadoRow>,
    @InjectRepository(Ejercicio) private readonly ejercicios: Repository<EjercicioRow>,
  ) {}

  async crear(usuarioId: string, entrenamientoId: string, input: { id: string; ejercicioId: string; posicion: number }) {
    return (await this.crearConEstado(usuarioId, entrenamientoId, input)).ejercicio;
  }

  async crearConEstado(usuarioId: string, entrenamientoId: string, input: { id: string; ejercicioId: string; posicion: number }) {
    const sesion = await this.entrenamientos.findOne({ where: { id: entrenamientoId, usuario_id: usuarioId } });
    if (!sesion) throw missing();
    if (!Number.isInteger(input.posicion) || input.posicion < 1) throw invalid('posicion');

    const existente = await this.realizados.findOne({ where: { id: input.id } });
    if (existente) return { ejercicio: await this.reintentoPropio(usuarioId, entrenamientoId, input.id, input.ejercicioId, input.posicion), creado: false };

    const ejercicio = await this.ejercicios.findOne({ where: { id: input.ejercicioId } });
    if (!ejercicio || (ejercicio.usuario_id !== null && ejercicio.usuario_id !== usuarioId)) throw missing();
    const [insertado] = await this.realizados.manager.query(
      `INSERT INTO ejercicio_realizado (id, entrenamiento_id, ejercicio_id, posicion)
       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [input.id, entrenamientoId, input.ejercicioId, input.posicion],
    );
    if (insertado) return { ejercicio: insertado as EjercicioRealizadoRow, creado: true };
    return { ejercicio: await this.reintentoPropio(usuarioId, entrenamientoId, input.id, input.ejercicioId, input.posicion), creado: false };
  }

  private async reintentoPropio(usuarioId: string, entrenamientoId: string, id: string, ejercicioId: string, posicion: number) {
    const row = await this.realizados.createQueryBuilder('er').innerJoin('entrenamiento', 't', 't.id=er.entrenamiento_id')
      .where('er.id=:id AND er.entrenamiento_id=:entrenamientoId AND er.ejercicio_id=:ejercicioId AND er.posicion=:posicion AND t.usuario_id=:usuarioId',
        { id, entrenamientoId, ejercicioId, posicion, usuarioId }).getOne();
    if (!row) throw missing();
    return row;
  }

  async actualizar(usuarioId: string, entrenamientoId: string, id: string, input: { posicion?: number; nota?: string | null; terminado?: boolean; volumenNotificadoKg?: number; version: number }) {
    if (input.posicion !== undefined && (!Number.isInteger(input.posicion) || input.posicion < 1)) throw invalid('posicion');
    if (input.nota !== undefined && input.nota !== null && input.nota.length > 1000) throw invalid('nota');
    if (!Number.isInteger(input.version) || input.version < 1) throw invalid('version');
    if (input.volumenNotificadoKg !== undefined && (!Number.isFinite(input.volumenNotificadoKg) || input.volumenNotificadoKg < 0)) throw invalid('volumenNotificadoKg');
    const [filasActualizadas] = await this.realizados.manager.query(
      `UPDATE ejercicio_realizado er SET
        posicion = CASE WHEN $4::boolean THEN $5::integer ELSE er.posicion END,
        nota = CASE WHEN $6::boolean THEN $7::varchar ELSE er.nota END,
        terminado_en = CASE WHEN $8::boolean THEN $9::timestamptz ELSE er.terminado_en END,
        volumen_notificado_kg = CASE WHEN $10::boolean THEN $11::numeric ELSE er.volumen_notificado_kg END,
        version = er.version + 1
       WHERE er.id = $1 AND er.entrenamiento_id = $2 AND er.version = $3
         AND EXISTS (SELECT 1 FROM entrenamiento t WHERE t.id = er.entrenamiento_id AND t.usuario_id = $12)
       RETURNING er.*`,
      [id, entrenamientoId, input.version, input.posicion !== undefined, input.posicion ?? null,
        input.nota !== undefined, input.nota ?? null, input.terminado !== undefined,
        input.terminado ? new Date() : null, input.volumenNotificadoKg !== undefined,
        input.volumenNotificadoKg ?? null, usuarioId],
    );
    const actualizado = (filasActualizadas as EjercicioRealizadoRow[])[0];
    if (actualizado) return actualizado;
    const actual = await this.buscarPropio(usuarioId, entrenamientoId, id);
    if (!actual) throw missing();
    throw conflict(actual);
  }

  async eliminar(usuarioId: string, entrenamientoId: string, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw invalid('version');
    const [filasEliminadas] = await this.realizados.manager.query(
      `DELETE FROM ejercicio_realizado er USING entrenamiento t
       WHERE er.id = $1 AND er.entrenamiento_id = $2 AND er.version = $3
         AND t.id = er.entrenamiento_id AND t.usuario_id = $4
       RETURNING er.id`, [id, entrenamientoId, version, usuarioId],
    );
    if ((filasEliminadas as { id: string }[]).length) return;
    const actual = await this.buscarPropio(usuarioId, entrenamientoId, id);
    if (!actual) throw missing();
    throw conflict(actual);
  }

  private async buscarPropio(usuarioId: string, entrenamientoId: string, id: string) {
    const [row] = await this.realizados.manager.query(
      `SELECT er.* FROM ejercicio_realizado er JOIN entrenamiento t ON t.id = er.entrenamiento_id
       WHERE er.id = $1 AND er.entrenamiento_id = $2 AND t.usuario_id = $3`, [id, entrenamientoId, usuarioId],
    );
    return row as EjercicioRealizadoRow | undefined;
  }
}
