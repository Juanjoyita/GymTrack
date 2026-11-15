import type { Entrenamiento } from '../../api/entrenamientos';

// Copia local del entrenamiento en curso por usuario (data-model «Estado local del cliente»): permite
// verlo al recargar o reabrir sin red. Solo datos del entrenamiento; nunca credenciales.

const clave = (usuarioId: string) => `gymtrack:entrenamiento:${usuarioId}`;

/** undefined: no hay copia; null: no había entrenamiento en curso. */
export function leerCopia(usuarioId: string): Entrenamiento | null | undefined {
  try {
    const guardado = localStorage.getItem(clave(usuarioId));
    return guardado === null ? undefined : JSON.parse(guardado) as Entrenamiento | null;
  } catch {
    return undefined;
  }
}

export function guardarCopia(usuarioId: string, entrenamiento: Entrenamiento | null) {
  try { localStorage.setItem(clave(usuarioId), JSON.stringify(entrenamiento)); } catch { /* sin almacenamiento */ }
}
