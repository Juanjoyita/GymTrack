import { solicitar } from './cliente';

// Rutinas (contracts/api.md, «Rutinas — P5», FR-028 a FR-030). diaSemana: 1 = lunes … 7 = domingo.
export interface EjercicioRutina { posicion: number; ejercicioId: string; nombre: string }

export interface Rutina {
  id: string;
  nombre: string;
  diaSemana: number;
  version: number;
  ejercicios: EjercicioRutina[];
}

export interface DatosRutina { nombre: string; diaSemana: number; ejercicioIds: string[] }

export const CLAVE_RUTINAS = ['rutinas'] as const;

/** Ordenadas por día y nombre. */
export const listarRutinas = (signal?: AbortSignal) => solicitar<Rutina[]>('/rutinas', { signal });

export const obtenerRutina = (id: string, signal?: AbortSignal) => solicitar<Rutina>(`/rutinas/${id}`, { signal });

export const crearRutina = (datos: DatosRutina) => solicitar<Rutina>('/rutinas', { method: 'POST', cuerpo: datos });

/** Sustituye la lista completa de ejercicios en el orden enviado. 409 con la versión vigente en `actual`. */
export const actualizarRutina = (id: string, datos: DatosRutina & { version: number }) =>
  solicitar<Rutina>(`/rutinas/${id}`, { method: 'PATCH', cuerpo: datos });

export const eliminarRutina = (rutina: Pick<Rutina, 'id' | 'version'>) =>
  solicitar<void>(`/rutinas/${rutina.id}?version=${rutina.version}`, { method: 'DELETE' });
