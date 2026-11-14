import type { GrupoMuscular } from '@gymtrack/domain';
import { solicitar } from './cliente';

// Catálogo y ejercicios propios (contracts/api.md, «Ejercicios — P1»).
export interface Ejercicio {
  id: string;
  nombre: string;
  grupoMuscular: GrupoMuscular;
  propio: boolean;
  ultimoUso: string | null;
}

/** Ejercicios en uso: entrenamientos en que aparece y rutinas que lo incluyen (409 EJERCICIO_EN_USO). */
export interface UsoEjercicio { entrenamientos: number; rutinas: string[] }

// Máximo admitido por la API: cubre el catálogo (50) y los propios para recorrerlo sin buscar.
const LIMITE_LISTA = 100;

export function listarEjercicios(q: string, signal?: AbortSignal) {
  const parametros = new URLSearchParams({ limite: String(LIMITE_LISTA) });
  if (q.trim()) parametros.set('q', q.trim());
  return solicitar<Ejercicio[]>(`/ejercicios?${parametros}`, { signal });
}

export const crearEjercicio = (datos: { nombre: string; grupoMuscular: GrupoMuscular }) =>
  solicitar<Ejercicio>('/ejercicios', { method: 'POST', cuerpo: datos });

export const renombrarEjercicio = (id: string, nombre: string) =>
  solicitar<Ejercicio>(`/ejercicios/${id}`, { method: 'PATCH', cuerpo: { nombre } });

export const eliminarEjercicio = (id: string) => solicitar<void>(`/ejercicios/${id}`, { method: 'DELETE' });
