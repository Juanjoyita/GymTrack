import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const campos: Record<string, string> = Object.create(null);
    for (const issue of result.error.issues) {
      const campo = issue.path.map(String).join('.') || '_raiz';
      // No reflejar mensajes de librerías/esquemas que puedan incluir valores de entrada.
      campos[campo] ??= 'Valor inválido. Revisa el formato y los límites del campo.';
    }
    throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos, actual: null });
  }
}
