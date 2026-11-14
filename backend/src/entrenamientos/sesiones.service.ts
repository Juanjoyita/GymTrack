import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { Entrenamiento, type EntrenamientoRow } from '../database/entities/entrenamiento';
import { EjercicioRealizado } from '../database/entities/ejercicio_realizado';
import { Serie } from '../database/entities/serie';

const conflictoActivo = () => new ConflictException({ codigo: 'ENTRENAMIENTO_EN_CURSO', mensaje: 'Ya existe un entrenamiento en curso.', campos: null, actual: null });
const noEncontrado = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el entrenamiento.', campos: null, actual: null });

@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(Entrenamiento) private readonly entrenamientos: Repository<EntrenamientoRow>,
    private readonly source: DataSource,
  ) {}

  async iniciar(usuarioId: string, entrada: { id?: string; inicio?: string | Date; zonaHoraria: string; fin?: string | Date; nota?: string | null }) {
    const inicio = entrada.inicio ? new Date(entrada.inicio) : new Date();
    const fin = entrada.fin ? new Date(entrada.fin) : null;
    let zonaValida = true;
    try { new Intl.DateTimeFormat('en', { timeZone: entrada.zonaHoraria }).format(inicio); } catch { zonaValida = false; }
    if (!Number.isFinite(inicio.getTime()) || !zonaValida || (fin && (!Number.isFinite(fin.getTime()) || fin < inicio || fin > new Date()))) {
      throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Fechas de entrenamiento inválidas.', campos: { inicio: 'Revisa inicio y fin.' }, actual: null });
    }
    try {
      const row = this.entrenamientos.create({ id: entrada.id ?? randomUUID(), usuario_id: usuarioId,
        estado: fin ? 'finalizado' : 'en_curso', inicio, fin, zona_horaria: entrada.zonaHoraria,
        ultima_actividad_en: inicio, nota: entrada.nota ?? null, rutina_origen_id: null });
      return await this.entrenamientos.save(row);
    } catch (error) {
      const pg = error as { driverError?: { code?: string; constraint?: string }; code?: string; constraint?: string };
      if ((pg.driverError?.code === '23505' && pg.driverError.constraint === 'uq_entrenamiento_en_curso') || (pg.code === '23505' && pg.constraint === 'uq_entrenamiento_en_curso')) throw conflictoActivo();
      throw error;
    }
  }

  async actualizarNota(usuarioId: string, id: string, nota: string | null, version: number) {
    const result = await this.entrenamientos.createQueryBuilder()
      .update(Entrenamiento)
      .set({ nota, version: () => 'version + 1' })
      .where('id = :id AND usuario_id = :usuarioId AND version = :version', { id, usuarioId, version })
      .returning('*')
      .execute();
    if (result.affected === 1) return result.raw[0] as EntrenamientoRow;

    const current = await this.entrenamientos.findOne({ where: { id, usuario_id: usuarioId } });
    if (!current) throw noEncontrado();
    throw new ConflictException({ codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual: current });
  }

  async recuperar(usuarioId: string) {
    const row = await this.entrenamientos.findOne({ where: { usuario_id: usuarioId, estado: 'en_curso' } });
    if (!row) return null;
    return { ...row, inactivo: Date.now() - row.ultima_actividad_en.getTime() > 12 * 60 * 60 * 1000 };
  }

  async finalizar(usuarioId: string, id: string, fin?: string | Date) {
    return this.source.transaction(async (manager) => {
      const repo = manager.getRepository(Entrenamiento);
      const row = await repo.findOne({ where: { id, usuario_id: usuarioId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw noEncontrado();
      const tieneSeries = await manager.getRepository(Serie).createQueryBuilder('s')
        .innerJoin('ejercicio_realizado', 'er', 'er.id = s.ejercicio_realizado_id')
        .where('er.entrenamiento_id = :id', { id }).getExists();
      if (!tieneSeries) { await repo.remove(row); return { descartado: true as const }; }
      const horaFin = fin ? new Date(fin) : (Date.now() - row.ultima_actividad_en.getTime() > 12 * 60 * 60 * 1000
        ? row.ultima_actividad_en : new Date());
      if (!Number.isFinite(horaFin.getTime()) || horaFin < row.inicio) throw new ConflictException('Fecha de fin inválida.');
      row.estado = 'finalizado'; row.fin = horaFin;
      return repo.save(row);
    });
  }

  async descartar(usuarioId: string, id: string) {
    const row = await this.entrenamientos.findOne({ where: { id, usuario_id: usuarioId } });
    if (!row) throw noEncontrado();
    // Descartar es una eliminación explícita iniciada por el usuario; la cascada elimina sus detalles.
    await this.entrenamientos.remove(row);
  }
}
