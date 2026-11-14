import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { Entrenamiento, type EntrenamientoRow } from '../database/entities/entrenamiento';
import { Serie } from '../database/entities/serie';

const conflictoActivo = () => new ConflictException({ codigo: 'ENTRENAMIENTO_EN_CURSO', mensaje: 'Ya existe un entrenamiento en curso.', campos: null, actual: null });
const noEncontrado = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el entrenamiento.', campos: null, actual: null });

type EntradaSesion = { id?: string; inicio?: string | Date; zonaHoraria: string; fin?: string | Date; nota?: string | null };

@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(Entrenamiento) private readonly entrenamientos: Repository<EntrenamientoRow>,
    private readonly source: DataSource,
  ) {}

  async iniciar(usuarioId: string, entrada: EntradaSesion) {
    return (await this.iniciarConEstado(usuarioId, entrada)).entrenamiento;
  }

  async iniciarConEstado(usuarioId: string, entrada: EntradaSesion) {
    const id = entrada.id ?? randomUUID();
    const inicio = entrada.inicio ? new Date(entrada.inicio) : new Date();
    const fin = entrada.fin ? new Date(entrada.fin) : null;
    let zonaValida = true;
    try { new Intl.DateTimeFormat('en', { timeZone: entrada.zonaHoraria }).format(inicio); } catch { zonaValida = false; }
    if (!Number.isFinite(inicio.getTime()) || !zonaValida || (fin && (!Number.isFinite(fin.getTime()) || fin < inicio || fin > new Date()))) {
      throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Fechas de entrenamiento inválidas.', campos: { inicio: 'Revisa inicio y fin.' }, actual: null });
    }
    try {
      // Solo INSERT: save() puede convertir una carrera de UUID en UPDATE de la fila ajena.
      const [insertado] = await this.entrenamientos.query(
        `INSERT INTO entrenamiento (id, usuario_id, estado, inicio, fin, zona_horaria, ultima_actividad_en, nota, rutina_origen_id)
         VALUES ($1,$2,$3,$4,$5,$6,$4,$7,NULL)
         ON CONFLICT (id) DO NOTHING RETURNING *`,
        [id, usuarioId, fin ? 'finalizado' : 'en_curso', inicio, fin, entrada.zonaHoraria, entrada.nota ?? null],
      );
      if (insertado) return { entrenamiento: insertado as EntrenamientoRow, creado: true };
    } catch (error) {
      const pg = error as { driverError?: { code?: string; constraint?: string }; code?: string; constraint?: string };
      if ((pg.driverError?.code === '23505' && pg.driverError.constraint === 'uq_entrenamiento_en_curso') || (pg.code === '23505' && pg.constraint === 'uq_entrenamiento_en_curso')) {
        const existente = await this.reintento(usuarioId, id);
        if (existente) return existente;
        throw conflictoActivo();
      }
      throw error;
    }
    const existente = await this.reintento(usuarioId, id);
    if (!existente) throw noEncontrado();
    return existente;
  }

  private async reintento(usuarioId: string, id: string) {
    // Nueva sentencia tras INSERT: ve al ganador confirmado, sin modificar sus datos.
    const row = await this.entrenamientos.findOne({ where: { id } });
    if (!row) return null;
    if (row.usuario_id !== usuarioId) throw noEncontrado();
    return { entrenamiento: row, creado: false };
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

  async finalizar(usuarioId: string, id: string, fin?: string | Date, version?: number) {
    return this.source.transaction(async (manager) => {
      const repo = manager.getRepository(Entrenamiento);
      const row = await repo.findOne({ where: { id, usuario_id: usuarioId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw noEncontrado();
      if (version !== undefined && row.version !== version) throw new ConflictException({ codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual: row });
      const tieneSeries = await manager.getRepository(Serie).createQueryBuilder('s')
        .innerJoin('ejercicio_realizado', 'er', 'er.id = s.ejercicio_realizado_id')
        .where('er.entrenamiento_id = :id', { id }).getExists();
      if (!tieneSeries) { await repo.remove(row); return { descartado: true as const }; }
      const horaFin = fin ? new Date(fin) : (Date.now() - row.ultima_actividad_en.getTime() > 12 * 60 * 60 * 1000
        ? row.ultima_actividad_en : new Date());
      if (!Number.isFinite(horaFin.getTime()) || horaFin < row.inicio) throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Fecha de fin inválida.', campos: { fin: 'Debe ser posterior o igual al inicio.' }, actual: null });
      row.estado = 'finalizado'; row.fin = horaFin;
      return repo.save(row);
    });
  }

  async descartar(usuarioId: string, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) {
      throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: { version: 'Valor inválido.' }, actual: null });
    }
    const result = await this.entrenamientos.createQueryBuilder()
      .delete()
      .from(Entrenamiento)
      .where('id = :id AND usuario_id = :usuarioId AND version = :version', { id, usuarioId, version })
      .returning('*')
      .execute();
    if (result.affected === 1) return;

    const current = await this.entrenamientos.findOne({ where: { id, usuario_id: usuarioId } });
    if (!current) throw noEncontrado();
    throw new ConflictException({ codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual: current });
  }
}
