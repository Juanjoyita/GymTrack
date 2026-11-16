import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calcularMetricasProgreso, detectarRecordsPersonales } from '@gymtrack/domain';
import { DataSource } from 'typeorm';

type PeriodoProgreso = '1m' | '3m' | '1a' | 'todo';
interface FilaSerieProgreso {
  entrenamientoId: string;
  fecha: string;
  pesoKg: string | number;
  repeticiones: number;
}

const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorValidacion = (campo: string) => new BadRequestException({
  codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.',
  campos: { [campo]: 'El valor no es válido.' }, actual: null,
});
const noEncontrado = () => new NotFoundException({
  codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null,
});

@Injectable()
export class ProgresoService {
  constructor(private readonly source: DataSource) {}

  async obtener(usuarioId: string, ejercicioId: string, periodoSolicitado?: string) {
    this.validarUuid(ejercicioId, 'ejercicioId');
    const periodo = this.validarPeriodo(periodoSolicitado);
    await this.comprobarAccesoEjercicio(usuarioId, ejercicioId);
    const sesiones = await this.consultarSesiones(usuarioId, ejercicioId, periodo);
    return {
      ejercicioId,
      periodo,
      sesiones: sesiones.map(({ entrenamientoId, fecha, ...metricas }) => ({
        entrenamientoId, fecha, ...metricas,
      })),
      suficientesParaTendencia: sesiones.length > 1,
    };
  }

  async records(usuarioId: string, ejercicioId: string, excluirEntrenamientoId?: string) {
    this.validarUuid(ejercicioId, 'ejercicioId');
    if (excluirEntrenamientoId !== undefined) this.validarUuid(excluirEntrenamientoId, 'excluirEntrenamientoId');
    await this.comprobarAccesoEjercicio(usuarioId, ejercicioId);
    const sesiones = await this.consultarSesiones(usuarioId, ejercicioId, 'todo', excluirEntrenamientoId);
    return detectarRecordsPersonales(sesiones);
  }

  private validarUuid(valor: string, campo: string): void {
    if (!uuidValido.test(valor)) throw errorValidacion(campo);
  }

  private validarPeriodo(periodo?: string): PeriodoProgreso {
    const valor = periodo ?? 'todo';
    if (valor !== '1m' && valor !== '3m' && valor !== '1a' && valor !== 'todo') throw errorValidacion('periodo');
    return valor;
  }

  private async comprobarAccesoEjercicio(usuarioId: string, ejercicioId: string): Promise<void> {
    const filas = await this.source.query<Array<{ id: string }>>(
      'SELECT id FROM ejercicio WHERE id = $1 AND (usuario_id IS NULL OR usuario_id = $2)',
      [ejercicioId, usuarioId],
    );
    if (!filas.length) throw noEncontrado();
  }

  private async consultarSesiones(
    usuarioId: string,
    ejercicioId: string,
    periodo: PeriodoProgreso,
    excluirEntrenamientoId?: string,
  ) {
    const parametros: unknown[] = [ejercicioId, usuarioId];
    const condiciones = [
      'er.ejercicio_id = $1',
      't.usuario_id = $2',
      "t.estado = 'finalizado'",
      '(e.usuario_id IS NULL OR e.usuario_id = $2)',
    ];
    const intervalo: Record<Exclude<PeriodoProgreso, 'todo'>, string> = {
      '1m': '1 month',
      '3m': '3 months',
      '1a': '1 year',
    };
    if (periodo !== 'todo') {
      parametros.push(intervalo[periodo]);
      condiciones.push(`t.inicio >= now() - ($${parametros.length}::text)::interval`);
    }
    if (excluirEntrenamientoId !== undefined) {
      parametros.push(excluirEntrenamientoId);
      condiciones.push(`t.id <> $${parametros.length}`);
    }

    const filas = await this.source.query<FilaSerieProgreso[]>(
      `SELECT t.id AS "entrenamientoId",
              to_char(t.inicio AT TIME ZONE t.zona_horaria, 'YYYY-MM-DD') AS fecha,
              s.peso_kg AS "pesoKg", s.repeticiones
         FROM entrenamiento t
         JOIN ejercicio_realizado er ON er.entrenamiento_id = t.id
         JOIN ejercicio e ON e.id = er.ejercicio_id
         JOIN serie s ON s.ejercicio_realizado_id = er.id
        WHERE ${condiciones.join(' AND ')}
        ORDER BY t.inicio ASC, t.id ASC, er.posicion ASC, s.orden ASC, s.id ASC`,
      parametros,
    );
    const porSesion = new Map<string, {
      entrenamientoId: string;
      fecha: string;
      series: Array<{ pesoKg: number; repeticiones: number }>;
    }>();
    for (const fila of filas) {
      let sesion = porSesion.get(fila.entrenamientoId);
      if (!sesion) {
        sesion = { entrenamientoId: fila.entrenamientoId, fecha: fila.fecha, series: [] };
        porSesion.set(fila.entrenamientoId, sesion);
      }
      sesion.series.push({
        pesoKg: Number(fila.pesoKg), repeticiones: Number(fila.repeticiones),
      });
    }
    return calcularMetricasProgreso([...porSesion.values()]);
  }
}
