import { solicitar } from './cliente';
import type { EjercicioRealizado, Entrenamiento, Serie } from './entrenamientos';

export interface FiltrosHistorial {
  ejercicioId?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
  limite?: number;
}

export interface SesionHistorial {
  id: string;
  inicio: string;
  fin: string;
  zonaHoraria: string;
  resumen: { ejercicios: number; series: number; volumenKg: number; duracionMin: number };
}

export interface PaginaHistorial {
  elementos: SesionHistorial[];
  siguienteCursor: string | null;
}

export function listarHistorial(filtros: FiltrosHistorial = {}, signal?: AbortSignal) {
  const parametros = new URLSearchParams();
  for (const clave of ['ejercicioId', 'desde', 'hasta', 'cursor'] as const) {
    const valor = filtros[clave];
    if (valor) parametros.set(clave, valor);
  }
  if (filtros.limite !== undefined) parametros.set('limite', String(filtros.limite));
  const query = parametros.toString();
  return solicitar<PaginaHistorial>(`/entrenamientos${query ? `?${query}` : ''}`, { signal });
}

export function obtenerEntrenamientoHistorial(id: string, signal?: AbortSignal) {
  return solicitar<Entrenamiento>(`/entrenamientos/${id}`, { signal });
}

export const actualizarNotaHistorial = (id: string, nota: string | null, version: number) =>
  solicitar<Entrenamiento>(`/entrenamientos/${id}`, { method: 'PATCH', cuerpo: { nota, version } });

export const actualizarEjercicioHistorial = (id: string, ejercicioRealizadoId: string, nota: string | null, version: number) =>
  solicitar<EjercicioRealizado>(`/entrenamientos/${id}/ejercicios/${ejercicioRealizadoId}`, { method: 'PATCH', cuerpo: { nota, version } });

export const actualizarSerieHistorial = (
  id: string, ejercicioRealizadoId: string, serieId: string,
  datos: { pesoEntrada: { valor: number; unidad: 'kg' | 'lb' }; repeticiones: number; version: number },
) => solicitar<Serie>(`/entrenamientos/${id}/ejercicios/${ejercicioRealizadoId}/series/${serieId}`, { method: 'PATCH', cuerpo: datos });

export const eliminarEntrenamientoHistorial = (id: string, version: number) =>
  solicitar<void>(`/entrenamientos/${id}?version=${version}`, { method: 'DELETE' });
