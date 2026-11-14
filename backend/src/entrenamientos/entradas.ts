import { BadRequestException } from '@nestjs/common';
import { esquemaEntrenamiento } from '@gymtrack/domain';

export const invalido = (campo: string) => new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: { [campo]: 'Valor inválido.' }, actual: null });
export function objeto(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalido('_raiz');
  return input as Record<string, unknown>;
}
export function uuid(value: unknown, campo = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalido(campo);
  return value;
}
export function entero(value: unknown, campo: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw invalido(campo);
  return value;
}
export function versionQuery(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw invalido('version');
  return entero(Number(value), 'version');
}
export function fecha(value: unknown, campo: string): string {
  const result = esquemaEntrenamiento.shape.inicio.safeParse(value);
  if (!result.success || !result.data || new Date(result.data).getTime() > Date.now()) throw invalido(campo);
  return result.data;
}
export function nota(value: unknown): string | null {
  if (value !== null && (typeof value !== 'string' || value.length > 1000)) throw invalido('nota');
  return value as string | null;
}
export function peso(value: unknown): { valor: number; unidad: 'kg' | 'lb' } {
  const data = objeto(value);
  if (typeof data.valor !== 'number' || !Number.isFinite(data.valor) || !['kg', 'lb'].includes(String(data.unidad))) throw invalido('pesoEntrada');
  return { valor: data.valor, unidad: data.unidad as 'kg' | 'lb' };
}
