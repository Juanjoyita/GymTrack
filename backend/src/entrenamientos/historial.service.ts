import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PresentacionEntrenamientos } from './presentacion';

interface FiltrosHistorial {
  ejercicioId?: unknown;
  desde?: unknown;
  hasta?: unknown;
  cursor?: unknown;
  limite?: unknown;
}

interface FilaHistorial {
  id: string;
  inicio: Date;
  fin: Date;
  zona_horaria: string;
  nota: string | null;
  ejercicios: number;
  series: number;
  volumen_kg: number | string;
  duracion_min: number | string;
}

interface CursorHistorial {
  inicio: string;
  id: string;
}

const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fechaLocalValida = /^\d{4}-\d{2}-\d{2}$/;
const errorValidacion = (campo: string, mensaje: string) => new BadRequestException({
  codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: { [campo]: mensaje }, actual: null,
});
const noEncontrado = () => new NotFoundException({
  codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el entrenamiento.', campos: null, actual: null,
});

function validarFechaLocal(valor: unknown, campo: string): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !fechaLocalValida.test(valor)) throw errorValidacion(campo, 'Usa una fecha válida con formato AAAA-MM-DD.');
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    throw errorValidacion(campo, 'Usa una fecha válida con formato AAAA-MM-DD.');
  }
  return valor;
}

function decodificarCursor(valor: unknown): CursorHistorial | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !valor || !/^[A-Za-z0-9_-]+$/.test(valor)) {
    throw errorValidacion('cursor', 'El cursor de paginación no es válido.');
  }
  try {
    const texto = Buffer.from(valor, 'base64url').toString('utf8');
    const cursor = JSON.parse(texto) as Record<string, unknown>;
    if (typeof cursor.inicio !== 'string' || !Number.isFinite(Date.parse(cursor.inicio))
      || typeof cursor.id !== 'string' || !uuidValido.test(cursor.id)) {
      throw new Error('Cursor inválido.');
    }
    return { inicio: new Date(cursor.inicio).toISOString(), id: cursor.id };
  } catch {
    throw errorValidacion('cursor', 'El cursor de paginación no es válido.');
  }
}

function codificarCursor(fila: FilaHistorial): string {
  return Buffer.from(JSON.stringify({ inicio: new Date(fila.inicio).toISOString(), id: fila.id }), 'utf8').toString('base64url');
}

@Injectable()
export class HistorialService {
  constructor(private readonly source: DataSource, private readonly presentacion: PresentacionEntrenamientos) {}

  async listar(usuarioId: string, filtros: FiltrosHistorial) {
    const limite = filtros.limite === undefined ? 20
      : typeof filtros.limite === 'string' && /^\d+$/.test(filtros.limite) ? Number(filtros.limite) : NaN;
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw errorValidacion('limite', 'Debe ser un entero entre 1 y 100.');
    }

    let ejercicioId: string | undefined;
    if (filtros.ejercicioId !== undefined) {
      if (typeof filtros.ejercicioId !== 'string' || !uuidValido.test(filtros.ejercicioId)) {
        throw errorValidacion('ejercicioId', 'Debe ser un identificador válido.');
      }
      ejercicioId = filtros.ejercicioId;
    }
    const desde = validarFechaLocal(filtros.desde, 'desde');
    const hasta = validarFechaLocal(filtros.hasta, 'hasta');
    if (desde && hasta && desde > hasta) throw errorValidacion('hasta', 'Debe ser igual o posterior a la fecha desde.');
    const cursor = decodificarCursor(filtros.cursor);
    const [usuario] = await this.source.query<Array<{ zona_horaria: string }>>(
      'SELECT zona_horaria FROM usuario WHERE id = $1', [usuarioId],
    );
    if (!usuario) throw new NotFoundException();

    const parametros: unknown[] = [usuarioId];
    const condiciones = ["e.usuario_id = $1", "e.estado = 'finalizado'"];
    if (desde) {
      parametros.push(desde);
      condiciones.push(`e.inicio >= ($${parametros.length}::date::timestamp AT TIME ZONE $${parametros.length + 1})`);
      parametros.push(usuario.zona_horaria);
    }
    if (hasta) {
      parametros.push(hasta);
      condiciones.push(`e.inicio < (($${parametros.length}::date + 1)::timestamp AT TIME ZONE $${parametros.length + 1})`);
      parametros.push(usuario.zona_horaria);
    }
    if (ejercicioId) {
      parametros.push(ejercicioId);
      condiciones.push(`EXISTS (
        SELECT 1 FROM ejercicio_realizado filtrado
         WHERE filtrado.entrenamiento_id = e.id AND filtrado.ejercicio_id = $${parametros.length}
      )`);
    }
    if (cursor) {
      parametros.push(cursor.inicio, cursor.id);
      condiciones.push(`(e.inicio, e.id) < ($${parametros.length - 1}::timestamptz, $${parametros.length}::uuid)`);
    }
    parametros.push(limite + 1);

    const filas = await this.source.query<FilaHistorial[]>(
      `SELECT e.id, e.inicio, e.fin, e.zona_horaria, e.nota,
              count(DISTINCT er.id)::int AS ejercicios,
              count(s.id)::int AS series,
              COALESCE(sum(s.peso_kg * s.repeticiones), 0)::float8 AS volumen_kg,
              extract(epoch FROM (e.fin - e.inicio)) / 60 AS duracion_min
         FROM entrenamiento e
         LEFT JOIN ejercicio_realizado er ON er.entrenamiento_id = e.id
         LEFT JOIN serie s ON s.ejercicio_realizado_id = er.id
        WHERE ${condiciones.join(' AND ')}
        GROUP BY e.id
        ORDER BY e.inicio DESC, e.id DESC
        LIMIT $${parametros.length}`,
      parametros,
    );

    const haySiguiente = filas.length > limite;
    const pagina = filas.slice(0, limite);
    return {
      elementos: pagina.map((fila) => ({
        id: fila.id,
        inicio: fila.inicio,
        fin: fila.fin,
        zonaHoraria: fila.zona_horaria,
        resumen: {
          ejercicios: Number(fila.ejercicios),
          series: Number(fila.series),
          volumenKg: Number(fila.volumen_kg),
          duracionMin: Number(fila.duracion_min),
        },
      })),
      siguienteCursor: haySiguiente ? codificarCursor(pagina[pagina.length - 1]) : null,
    };
  }

  async obtener(usuarioId: string, id: string) {
    const [row] = await this.source.query<Array<{ estado: string }>>(
      `SELECT estado FROM entrenamiento WHERE id = $1 AND usuario_id = $2`,
      [id, usuarioId],
    );
    if (!row || row.estado !== 'finalizado') throw noEncontrado();
    return this.presentacion.entrenamiento(usuarioId, id);
  }
}
