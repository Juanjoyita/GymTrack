import type { QueryClient } from '@tanstack/react-query';
import { solicitar, type Escritura } from './cliente';

// Progreso y récords por ejercicio (contracts/api.md, «Progreso — P3»). Valores en kg.
export type Periodo = '1m' | '3m' | '1a' | 'todo';

export interface SesionProgreso {
  entrenamientoId: string;
  /** Día local del entrenamiento (YYYY-MM-DD). */
  fecha: string;
  pesoMaxKg: number;
  volumenKg: number;
  /** null si la sesión no tiene series válidas para el 1RM (peso 0 o más de 12 repeticiones). */
  unoRmKg: number | null;
}

export interface Progreso {
  ejercicioId: string;
  periodo: Periodo;
  sesiones: SesionProgreso[];
  suficientesParaTendencia: boolean;
}

export interface RecordPersonal { valorKg: number; fecha: string; entrenamientoId: string }

export interface RecordsPersonales {
  sesionesAnteriores: number;
  pesoMax: RecordPersonal | null;
  unoRm: RecordPersonal | null;
  volumenSesion: RecordPersonal | null;
}

/**
 * Claves de consulta del progreso. La «vista» es lo que muestra /progreso; los «récords previos» son
 * los que el entrenamiento en curso usa para avisar de récords (T041), también sin conexión.
 */
export const clavesProgreso = {
  vista: ['progreso', 'vista'] as const,
  ejercicioConDatos: (candidatos: readonly string[]) => ['progreso', 'vista', 'ejercicio-con-datos', candidatos] as const,
  progreso: (ejercicioId: string, periodo: Periodo) => ['progreso', 'vista', ejercicioId, periodo] as const,
  records: (ejercicioId: string) => ['progreso', 'vista', ejercicioId, 'records'] as const,
  recordsPreviosTodos: ['progreso', 'records-previos'] as const,
  recordsPrevios: (ejercicioId: string, entrenamientoId: string) => ['progreso', 'records-previos', ejercicioId, entrenamientoId] as const,
};

/**
 * Entrenamiento cuyas métricas cambia una escritura confirmada, o null si no afecta al progreso.
 * Solo cuentan las series y ejercicios de entrenamientos finalizados, su eliminación y finalizar el
 * entrenamiento en curso; las notas, terminar o reabrir un ejercicio, el acceso y el catálogo no.
 */
export function afectaAlProgreso({ metodo, ruta }: Escritura, enCursoId?: string | null): string | null {
  const partes = /^\/entrenamientos\/([^/?]+)(\/[^?]*)?/.exec(ruta);
  if (!partes || metodo === 'GET') return null;
  const [, id, resto = ''] = partes;
  if (metodo === 'POST' && resto === '/finalizar') return id;
  // El entrenamiento en curso entra en el progreso al finalizarse, no antes.
  if (id === enCursoId) return null;
  if (metodo === 'DELETE' && (resto === '' || /^\/ejercicios\/[^/]+$/.test(resto))) return id;
  if (/^\/ejercicios\/[^/]+\/series(\/[^/]+)?$/.test(resto)) return id;
  return null;
}

/**
 * Tras un cambio que afecta al progreso: la vista se reinicia (sin datos, así nunca muestra valores
 * antiguos; si está abierta se vuelve a pedir al momento) y los récords previos de otros entrenamientos
 * se invalidan sin borrarse, para seguir comparando sin conexión con el último valor conocido.
 */
export function actualizarProgreso(cliente: QueryClient, entrenamientoId: string) {
  void cliente.resetQueries({ queryKey: clavesProgreso.vista });
  void cliente.invalidateQueries({ queryKey: clavesProgreso.recordsPreviosTodos, predicate: (q) => q.queryKey[3] !== entrenamientoId });
  // ultimoUso decide el ejercicio predeterminado de Progreso y los recientes del selector.
  void cliente.invalidateQueries({ queryKey: ['ejercicios'] });
}

export const obtenerProgreso = (ejercicioId: string, periodo: Periodo, signal?: AbortSignal) =>
  solicitar<Progreso>(`/progreso/${ejercicioId}?periodo=${periodo}`, { signal });

/** excluirEntrenamientoId deja fuera el entrenamiento en curso (solo sesiones anteriores). */
export function obtenerRecords(ejercicioId: string, excluirEntrenamientoId?: string, signal?: AbortSignal) {
  const consulta = excluirEntrenamientoId ? `?excluirEntrenamientoId=${excluirEntrenamientoId}` : '';
  return solicitar<RecordsPersonales>(`/progreso/${ejercicioId}/records${consulta}`, { signal });
}
