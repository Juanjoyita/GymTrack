import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface SerieAnterior {
  orden: number;
  repeticiones: number;
  pesoKg: number;
}

export interface UltimaSesion {
  entrenamientoId: string;
  fecha: Date;
  series: SerieAnterior[];
}

const missing = () => new NotFoundException({
  codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null,
});

@Injectable()
export class UltimaSesionService {
  constructor(private readonly source: DataSource) {}

  /** Devuelve las series ordenadas de la sesión finalizada más reciente del usuario. */
  async obtener(usuarioId: string, ejercicioId: string, entrenamientoActualId?: string): Promise<UltimaSesion | null> {
    const filas: { entrenamientoId: string; fecha: Date; orden: number; repeticiones: number; pesoKg: string | number }[] =
      await this.source.query(
        `WITH ultima AS (
           SELECT t.id, t.inicio
           FROM entrenamiento t
           JOIN ejercicio_realizado er ON er.entrenamiento_id=t.id
           JOIN ejercicio e ON e.id=er.ejercicio_id
           JOIN serie s ON s.ejercicio_realizado_id=er.id
           WHERE er.ejercicio_id=$1 AND t.usuario_id=$2 AND t.estado='finalizado'
             AND (e.usuario_id IS NULL OR e.usuario_id=$2)
             AND ($3::uuid IS NULL OR t.id <> $3)
           ORDER BY t.inicio DESC, t.id DESC
           LIMIT 1
         )
         SELECT u.id AS "entrenamientoId", u.inicio AS fecha, s.orden, s.repeticiones, s.peso_kg AS "pesoKg"
         FROM ultima u
         JOIN ejercicio_realizado er ON er.entrenamiento_id=u.id AND er.ejercicio_id=$1
         JOIN serie s ON s.ejercicio_realizado_id=er.id
         ORDER BY s.orden, s.id`,
        [ejercicioId, usuarioId, entrenamientoActualId ?? null],
      );
    if (!filas.length) {
      const [ejercicio] = await this.source.query(
        'SELECT id FROM ejercicio WHERE id=$1 AND (usuario_id IS NULL OR usuario_id=$2)', [ejercicioId, usuarioId],
      );
      if (!ejercicio) throw missing();
      return null;
    }
    return {
      entrenamientoId: filas[0].entrenamientoId,
      fecha: new Date(filas[0].fecha),
      series: filas.map(({ orden, repeticiones, pesoKg }) => ({ orden, repeticiones, pesoKg: Number(pesoKg) })),
    };
  }
}
