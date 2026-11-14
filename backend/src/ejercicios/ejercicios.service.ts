import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizarNombre } from '@gymtrack/domain';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { esUuid, validarActualizacion, validarConsulta, validarEjercicio, type EntradaEjercicio } from './ejercicios.validation';

/** Ejercicio tal como lo devuelve la API (contracts/api.md, «Ejercicios»). */
export interface ItemEjercicio {
  id: string;
  nombre: string;
  grupoMuscular: EntradaEjercicio['grupoMuscular'];
  propio: boolean;
  ultimoUso: Date | null;
}

const noEncontrado = () => new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el ejercicio.', campos: null, actual: null });
const duplicado = (actual: ItemEjercicio) => new ConflictException({
  codigo: 'EJERCICIO_DUPLICADO', mensaje: `Ya existe el ejercicio «${actual.nombre}». Puedes usarlo en su lugar.`, campos: null, actual,
});
const esViolacion = (error: unknown, code: string) => {
  const pg = error as { code?: string; driverError?: { code?: string } };
  return pg.code === code || pg.driverError?.code === code;
};

// Catálogo global y propios del usuario; ultimoUso = última serie del usuario con ese ejercicio (R-14).
const SELECT_ITEM = `SELECT e.id, e.nombre, e.grupo_muscular AS "grupoMuscular", (e.usuario_id IS NOT NULL) AS propio, uso.ultimo AS "ultimoUso"
FROM ejercicio e
LEFT JOIN (
  SELECT er.ejercicio_id, max(s.registrada_en) AS ultimo
  FROM serie s
  JOIN ejercicio_realizado er ON er.id = s.ejercicio_realizado_id
  JOIN entrenamiento en ON en.id = er.entrenamiento_id
  WHERE en.usuario_id = $1
  GROUP BY er.ejercicio_id
) uso ON uso.ejercicio_id = e.id
WHERE (e.usuario_id IS NULL OR e.usuario_id = $1)`;

@Injectable()
export class EjerciciosService {
  constructor(private readonly source: DataSource) {}

  /** Recientes primero y después alfabéticamente; con q, filtrado sin mayúsculas, tildes ni espacios repetidos. */
  async listar(usuarioId: string, consulta: { q?: unknown; limite?: unknown }): Promise<ItemEjercicio[]> {
    const { q, limite } = validarConsulta(consulta);
    const patron = q === null ? null : `%${normalizarNombre(q).replace(/[\\%_]/g, '\\$&')}%`;
    return this.source.query(`${SELECT_ITEM}
  AND ($2::text IS NULL OR e.nombre_normalizado LIKE $2 ESCAPE '\\')
ORDER BY uso.ultimo DESC NULLS LAST, e.nombre_normalizado COLLATE "C", e.id
LIMIT $3`, [usuarioId, patron, limite]);
  }

  async crear(usuarioId: string, entrada: unknown): Promise<ItemEjercicio> {
    const { nombre, grupoMuscular } = validarEjercicio(entrada);
    const normalizado = normalizarNombre(nombre);
    await this.rechazarDuplicado(usuarioId, normalizado);
    const id = randomUUID();
    try {
      await this.source.query('INSERT INTO ejercicio (id, usuario_id, nombre, nombre_normalizado, grupo_muscular) VALUES ($1, $2, $3, $4, $5)',
        [id, usuarioId, nombre, normalizado, grupoMuscular]);
    } catch (error) {
      // Creación simultánea con el mismo nombre: gana la primera y la otra recibe el existente.
      if (esViolacion(error, '23505')) await this.rechazarDuplicado(usuarioId, normalizado);
      throw error;
    }
    return { id, nombre, grupoMuscular, propio: true, ultimoUso: null };
  }

  /** Solo ejercicios propios: los del catálogo y los de otros usuarios responden NO_ENCONTRADO (R-04). */
  async actualizar(usuarioId: string, id: string, entrada: unknown): Promise<ItemEjercicio> {
    await this.exigirPropio(this.source.manager, usuarioId, id);
    const cambios = validarActualizacion(entrada);
    const normalizado = cambios.nombre === undefined ? undefined : normalizarNombre(cambios.nombre);
    if (normalizado !== undefined) await this.rechazarDuplicado(usuarioId, normalizado, id);
    try {
      await this.source.query(`UPDATE ejercicio SET nombre = COALESCE($3, nombre), nombre_normalizado = COALESCE($4, nombre_normalizado),
  grupo_muscular = COALESCE($5::grupo_muscular_enum, grupo_muscular) WHERE id = $1 AND usuario_id = $2`,
      [id, usuarioId, cambios.nombre ?? null, normalizado ?? null, cambios.grupoMuscular ?? null]);
    } catch (error) {
      if (esViolacion(error, '23505') && normalizado !== undefined) await this.rechazarDuplicado(usuarioId, normalizado, id);
      throw error;
    }
    const [item] = await this.source.query(`${SELECT_ITEM} AND e.id = $2`, [usuarioId, id]);
    return item;
  }

  /** Bloquea el borrado si el ejercicio aparece en entrenamientos o rutinas (FR-005, FR-028). */
  async eliminar(usuarioId: string, id: string): Promise<void> {
    try {
      await this.source.transaction(async (manager) => {
        await this.exigirPropio(manager, usuarioId, id, true);
        await this.rechazarEnUso(manager, id);
        await manager.query('DELETE FROM ejercicio WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
      });
    } catch (error) {
      // Añadido a un entrenamiento o rutina entre la comprobación y el commit (FK diferida).
      if (esViolacion(error, '23503')) await this.rechazarEnUso(this.source.manager, id);
      throw error;
    }
  }

  private async exigirPropio(manager: EntityManager, usuarioId: string, id: string, bloquear = false) {
    if (!esUuid(id)) throw noEncontrado();
    const filas = await manager.query(`SELECT id FROM ejercicio WHERE id = $1 AND usuario_id = $2${bloquear ? ' FOR UPDATE' : ''}`, [id, usuarioId]);
    if (!filas.length) throw noEncontrado();
  }

  private async rechazarDuplicado(usuarioId: string, normalizado: string, excluirId: string | null = null) {
    const [existente] = await this.source.query(`${SELECT_ITEM} AND e.nombre_normalizado = $2 AND ($3::uuid IS NULL OR e.id <> $3)
ORDER BY propio LIMIT 1`, [usuarioId, normalizado, excluirId]);
    if (existente) throw duplicado(existente);
  }

  private async rechazarEnUso(manager: EntityManager, id: string) {
    const [{ entrenamientos }] = await manager.query('SELECT count(DISTINCT entrenamiento_id)::int AS entrenamientos FROM ejercicio_realizado WHERE ejercicio_id = $1', [id]);
    const rutinas: { nombre: string }[] = await manager.query(`SELECT DISTINCT r.nombre FROM rutina_ejercicio re JOIN rutina r ON r.id = re.rutina_id
WHERE re.ejercicio_id = $1 ORDER BY r.nombre`, [id]);
    if (entrenamientos > 0 || rutinas.length) {
      throw new ConflictException({
        codigo: 'EJERCICIO_EN_USO', mensaje: 'No se puede eliminar un ejercicio que aparece en entrenamientos o rutinas. Puedes renombrarlo.',
        campos: null, actual: { entrenamientos, rutinas: rutinas.map((r) => r.nombre) },
      });
    }
  }
}
