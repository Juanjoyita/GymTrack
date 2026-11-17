import { ConflictException, NotFoundException } from '@nestjs/common';
import { esquemaActualizacionRutina, esquemaRutina } from '@gymtrack/domain';
import type { z } from 'zod';
import { ZodValidationPipe } from '../comun/zod-validation.pipe';

export type EntradaRutina = z.infer<typeof esquemaRutina>;
export type EntradaActualizacionRutina = z.infer<typeof esquemaActualizacionRutina>;

export const validarRutina = (input: unknown): EntradaRutina =>
  new ZodValidationPipe(esquemaRutina).transform(input ?? {}) as EntradaRutina;
export const validarActualizacionRutina = (input: unknown): EntradaActualizacionRutina =>
  new ZodValidationPipe(esquemaActualizacionRutina).transform(input ?? {}) as EntradaActualizacionRutina;

export const errorRutinaNoEncontrada = () => new NotFoundException({
  codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null,
});

export const errorVersionRutina = (actual: unknown) => new ConflictException({
  codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual,
});
