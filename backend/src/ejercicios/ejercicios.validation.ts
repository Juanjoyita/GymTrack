import { BadRequestException } from '@nestjs/common';
import { esquemaActualizacionEjercicio, esquemaEjercicio, type GrupoMuscular } from '@gymtrack/domain';
import { ZodValidationPipe } from '../comun/zod-validation.pipe';

export interface EntradaEjercicio { nombre: string; grupoMuscular: GrupoMuscular }
export interface ConsultaEjercicios { q: string | null; limite: number }

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validacion = (campos: Record<string, string>) =>
  new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos, actual: null });

export const validarEjercicio = (entrada: unknown) =>
  new ZodValidationPipe(esquemaEjercicio).transform(entrada ?? {}) as EntradaEjercicio;

export const validarActualizacion = (entrada: unknown) =>
  new ZodValidationPipe(esquemaActualizacionEjercicio).transform(entrada ?? {}) as Partial<EntradaEjercicio>;

/** GET /ejercicios?q=&limite= (los parámetros de consulta llegan como texto). */
export function validarConsulta(consulta: { q?: unknown; limite?: unknown }): ConsultaEjercicios {
  const campos: Record<string, string> = Object.create(null);
  const q = consulta.q === undefined ? '' : consulta.q;
  if (typeof q !== 'string' || q.length > 80) campos.q = 'La búsqueda admite hasta 80 caracteres.';
  let limite = LIMITE_POR_DEFECTO;
  if (consulta.limite !== undefined) {
    limite = typeof consulta.limite === 'string' && /^\d{1,3}$/.test(consulta.limite) ? Number(consulta.limite) : NaN;
    if (!(limite >= 1 && limite <= LIMITE_MAXIMO)) campos.limite = `Debe ser un número entero entre 1 y ${LIMITE_MAXIMO}.`;
  }
  if (Object.keys(campos).length) throw validacion(campos);
  return { q: (q as string).trim() ? (q as string) : null, limite };
}

export const esUuid = (id: string) => UUID.test(id);
