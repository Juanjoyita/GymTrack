import { solicitar } from './cliente';

// Entrenamiento en curso y ejercicios realizados (contracts/api.md, «Entrenamientos — P1»).
export interface Serie {
  id: string;
  orden: number;
  repeticiones: number;
  pesoKg: number;
  registradaEn: string;
  version: number;
}

export interface EjercicioRealizado {
  id: string;
  ejercicioId: string;
  nombre: string;
  posicion: number;
  nota: string | null;
  terminadoEn: string | null;
  volumenNotificadoKg: number | null;
  version: number;
  series: Serie[];
}

export interface Entrenamiento {
  id: string;
  estado: 'en_curso' | 'finalizado';
  inicio: string;
  fin: string | null;
  zonaHoraria: string;
  nota: string | null;
  rutinaOrigenId: string | null;
  inactivo: boolean;
  version: number;
  ejercicios: EjercicioRealizado[];
  resumen: { ejercicios: number; series: number; volumenKg: number; duracionMin: number | null };
}

export const CLAVE_EN_CURSO = ['entrenamiento', 'en-curso'] as const;

/** Entrenamiento en curso, o null si no hay ninguno (204). */
export async function obtenerEntrenamientoEnCurso() {
  return (await solicitar<Entrenamiento | undefined>('/entrenamientos/en-curso')) ?? null;
}

/** El id lo genera el cliente: repetir la petición no duplica el ejercicio (R-08). */
export const anadirEjercicioRealizado = (entrenamientoId: string, datos: { id: string; ejercicioId: string; posicion: number }) =>
  solicitar<EjercicioRealizado>(`/entrenamientos/${entrenamientoId}/ejercicios`, { method: 'POST', cuerpo: datos });

/**
 * Inicia un entrenamiento desde una rutina (FR-029): el servidor copia sus ejercicios en orden, sin
 * series, con sus propios identificadores. Por eso necesita conexión y no pasa por la cola (T055).
 */
export const iniciarDesdeRutina = (rutinaId: string) => solicitar<Entrenamiento>('/entrenamientos', {
  method: 'POST',
  cuerpo: { id: crypto.randomUUID(), inicio: new Date().toISOString(), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone, rutinaId },
});
