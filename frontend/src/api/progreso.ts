import { solicitar } from './cliente';

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

export const CLAVE_PROGRESO = ['progreso'] as const;

export const obtenerProgreso = (ejercicioId: string, periodo: Periodo, signal?: AbortSignal) =>
  solicitar<Progreso>(`/progreso/${ejercicioId}?periodo=${periodo}`, { signal });

/** excluirEntrenamientoId deja fuera el entrenamiento en curso (solo sesiones anteriores). */
export function obtenerRecords(ejercicioId: string, excluirEntrenamientoId?: string, signal?: AbortSignal) {
  const consulta = excluirEntrenamientoId ? `?excluirEntrenamientoId=${excluirEntrenamientoId}` : '';
  return solicitar<RecordsPersonales>(`/progreso/${ejercicioId}/records${consulta}`, { signal });
}
