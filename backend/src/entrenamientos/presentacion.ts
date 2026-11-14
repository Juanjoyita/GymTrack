import { Injectable, NotFoundException } from '@nestjs/common';
import { calcularVolumen } from '@gymtrack/domain';
import { DataSource } from 'typeorm';
import { Entrenamiento, type EntrenamientoRow } from '../database/entities/entrenamiento';
import { EjercicioRealizado, type EjercicioRealizadoRow } from '../database/entities/ejercicio_realizado';
import { Serie, type SerieRow } from '../database/entities/serie';
import { Ejercicio } from '../database/entities/ejercicio';

export const serieDto = (row: SerieRow) => ({ id: row.id, orden: row.orden, repeticiones: row.repeticiones,
  pesoKg: Number(row.peso_kg), registradaEn: row.registrada_en, version: row.version });

@Injectable()
export class PresentacionEntrenamientos {
  constructor(private readonly source: DataSource) {}

  async ejercicio(row: EjercicioRealizadoRow) {
    const ejercicio = await this.source.getRepository(Ejercicio).findOneByOrFail({ id: row.ejercicio_id });
    const series = await this.source.getRepository(Serie).find({ where: { ejercicio_realizado_id: row.id }, order: { orden: 'ASC', id: 'ASC' } });
    return { id: row.id, ejercicioId: row.ejercicio_id, nombre: ejercicio.nombre, posicion: row.posicion,
      nota: row.nota, terminadoEn: row.terminado_en, volumenNotificadoKg: row.volumen_notificado_kg === null ? null : Number(row.volumen_notificado_kg),
      version: row.version, series: series.map(serieDto) };
  }

  async entrenamiento(usuarioId: string, id: string) {
    const row = await this.source.getRepository(Entrenamiento).findOne({ where: { id, usuario_id: usuarioId } });
    if (!row) throw new NotFoundException();
    const realizados = await this.source.getRepository(EjercicioRealizado).find({ where: { entrenamiento_id: id }, order: { posicion: 'ASC', id: 'ASC' } });
    const ejercicios = await Promise.all(realizados.map((r) => this.ejercicio(r)));
    return this.dto(row, ejercicios);
  }

  private dto(row: EntrenamientoRow, ejercicios: Awaited<ReturnType<PresentacionEntrenamientos['ejercicio']>>[]) {
    const series = ejercicios.flatMap((e) => e.series);
    return { id: row.id, estado: row.estado, inicio: row.inicio, fin: row.fin, zonaHoraria: row.zona_horaria,
      nota: row.nota, rutinaOrigenId: row.rutina_origen_id,
      inactivo: row.estado === 'en_curso' && Date.now() - row.ultima_actividad_en.getTime() > 12 * 60 * 60 * 1000,
      version: row.version, ejercicios, resumen: { ejercicios: ejercicios.length, series: series.length,
        volumenKg: calcularVolumen(series),
        duracionMin: row.fin ? (row.fin.getTime() - row.inicio.getTime()) / 60000 : null } };
  }
}
