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

/** Entrenamiento en curso, o null si no hay ninguno (204). */
export async function obtenerEntrenamientoEnCurso() {
  return (await solicitar<Entrenamiento | undefined>('/entrenamientos/en-curso')) ?? null;
}

/** El id lo genera el cliente: repetir la petición no duplica el ejercicio (R-08). */
export const anadirEjercicioRealizado = (entrenamientoId: string, datos: { id: string; ejercicioId: string; posicion: number }) =>
  solicitar<EjercicioRealizado>(`/entrenamientos/${entrenamientoId}/ejercicios`, { method: 'POST', cuerpo: datos });
