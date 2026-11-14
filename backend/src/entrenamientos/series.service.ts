import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { esquemaSerie, lbAKg } from '@gymtrack/domain';
import { Serie, type SerieRow } from '../database/entities/serie';

const missing = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null });
const invalid = (fields: Record<string, string>) => new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: fields, actual: null });
const conflict = (actual: unknown) => new ConflictException({ codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual });
const sameOperation = (row: SerieRow, esperado: { ejercicioRealizadoId: string; orden: number; repeticiones: number; pesoKg: number; registradaEn: Date }) =>
  row.ejercicio_realizado_id === esperado.ejercicioRealizadoId && row.orden === esperado.orden &&
  row.repeticiones === esperado.repeticiones && Number(row.peso_kg) === Number(esperado.pesoKg.toFixed(4)) &&
  new Date(row.registrada_en).getTime() === esperado.registradaEn.getTime();

@Injectable()
export class SeriesService {
  constructor(
    @InjectRepository(Serie) private readonly series: Repository<SerieRow>,
    private readonly source: DataSource,
  ) {}

  async crear(usuarioId: string, entrenamientoId: string, ejercicioRealizadoId: string, input: { id: string; orden: number; repeticiones: number; pesoEntrada: { valor: number; unidad: 'kg' | 'lb' }; registradaEn: string | Date }) {
    const parsed = esquemaSerie.safeParse({ repeticiones: input.repeticiones, pesoEntrada: input.pesoEntrada });
    if (!parsed.success) throw invalid(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'serie', 'Valor inválido.'])));
    if (!Number.isInteger(input.orden) || input.orden < 1 || !Number.isFinite(new Date(input.registradaEn).getTime())) throw invalid({ orden: 'Valor inválido.' });
    return this.source.transaction(async (manager) => {
      const [session] = await manager.query('SELECT id FROM entrenamiento WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [entrenamientoId, usuarioId]);
      if (!session) throw missing();
      const [er] = await manager.query('SELECT id FROM ejercicio_realizado WHERE id=$1 AND entrenamiento_id=$2', [ejercicioRealizadoId, entrenamientoId]);
      if (!er) throw missing();
      const pesoKg = input.pesoEntrada.unidad === 'kg' ? input.pesoEntrada.valor : lbAKg(input.pesoEntrada.valor);
      const registradaEn = new Date(input.registradaEn);
      const esperado = { ejercicioRealizadoId, orden: input.orden, repeticiones: input.repeticiones, pesoKg, registradaEn };
      const [insertada] = await manager.query(
        `INSERT INTO serie (id, ejercicio_realizado_id, orden, repeticiones, peso_kg, registrada_en)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [input.id, ejercicioRealizadoId, input.orden, input.repeticiones, pesoKg.toFixed(4), registradaEn],
      );
      if (!insertada) {
        const [existente] = await manager.query(
          `SELECT s.* FROM serie s JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id
           JOIN entrenamiento t ON t.id=er.entrenamiento_id
           WHERE s.id=$1 AND er.id=$2 AND er.entrenamiento_id=$3 AND t.usuario_id=$4`,
          [input.id, ejercicioRealizadoId, entrenamientoId, usuarioId],
        );
        if (!existente || !sameOperation(existente as SerieRow, esperado)) throw missing();
        return { serie: existente as SerieRow, creado: false };
      }
      await manager.query(
        'UPDATE entrenamiento SET ultima_actividad_en=GREATEST(ultima_actividad_en,$1) WHERE id=$2 AND usuario_id=$3',
        [registradaEn, entrenamientoId, usuarioId],
      );
      return { serie: insertada as SerieRow, creado: true };
    });
  }

  async actualizar(usuarioId: string, entrenamientoId: string, erId: string, id: string, patch: { orden?: number; repeticiones?: number; pesoEntrada?: { valor: number; unidad: 'kg' | 'lb' }; version: number }) {
    if (!Number.isInteger(patch.version) || patch.version < 1) throw invalid({ version: 'Valor inválido.' });
    const row = await this.owned(usuarioId, entrenamientoId, erId, id);
    const repeticiones = patch.repeticiones ?? row.repeticiones;
    const entrada = patch.pesoEntrada ?? { valor: Number(row.peso_kg), unidad: 'kg' as const };
    const parsed = esquemaSerie.safeParse({ repeticiones, pesoEntrada: entrada });
    if (!parsed.success || (patch.orden !== undefined && (!Number.isInteger(patch.orden) || patch.orden < 1))) throw invalid({ serie: 'Valor inválido.' });
    const pesoKg = entrada.unidad === 'kg' ? entrada.valor : lbAKg(entrada.valor);
    const [filasActualizadas] = await this.source.query(
      `UPDATE serie s SET orden=CASE WHEN $5::boolean THEN $6::integer ELSE s.orden END,
       repeticiones=$7, peso_kg=$8, version=s.version+1
       WHERE s.id=$1 AND s.ejercicio_realizado_id=$2 AND s.version=$3
       AND EXISTS (SELECT 1 FROM ejercicio_realizado er JOIN entrenamiento t ON t.id=er.entrenamiento_id
         WHERE er.id=s.ejercicio_realizado_id AND er.id=$2 AND er.entrenamiento_id=$4 AND t.usuario_id=$9)
       RETURNING s.*`,
      [id, erId, patch.version, entrenamientoId, patch.orden !== undefined, patch.orden ?? null, repeticiones, pesoKg.toFixed(4), usuarioId],
    );
    const actualizado = (filasActualizadas as SerieRow[])[0];
    if (actualizado) return actualizado;
    const actual = await this.owned(usuarioId, entrenamientoId, erId, id);
    throw conflict(actual);
  }

  async eliminar(usuarioId: string, entrenamientoId: string, erId: string, id: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw invalid({ version: 'Valor inválido.' });
    const [filasEliminadas] = await this.source.query(
      `DELETE FROM serie s USING ejercicio_realizado er, entrenamiento t
       WHERE s.id=$1 AND s.ejercicio_realizado_id=$2 AND s.version=$3 AND er.id=s.ejercicio_realizado_id
       AND er.entrenamiento_id=$4 AND t.id=er.entrenamiento_id AND t.usuario_id=$5 RETURNING s.id`,
      [id, erId, version, entrenamientoId, usuarioId],
    );
    if ((filasEliminadas as { id: string }[]).length) return;
    const actual = await this.owned(usuarioId, entrenamientoId, erId, id);
    throw conflict(actual);
  }

  private async owned(usuarioId: string, entrenamientoId: string, erId: string, id: string) {
    const row = await this.series.createQueryBuilder('s').innerJoin('ejercicio_realizado', 'er', 'er.id=s.ejercicio_realizado_id')
      .innerJoin('entrenamiento', 't', 't.id=er.entrenamiento_id')
      .where('s.id=:id AND er.id=:erId AND er.entrenamiento_id=:entrenamientoId AND t.usuario_id=:usuarioId', { id, erId, entrenamientoId, usuarioId }).getOne();
    if (!row) throw missing();
    return row;
  }
}
