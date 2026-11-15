import type { EjercicioRealizado, Entrenamiento, Serie } from '../../api/entrenamientos';
import type { Conflicto, NuevaOperacion, Operacion } from '../../sincronizacion/cola';

// Operaciones del entrenamiento que pasan por la cola duradera (R-08) y cómo se aplican al estado.
// La misma función sirve para mostrar lo pendiente sobre la copia del servidor y para incorporar
// la respuesta cuando el servidor confirma.

export type PesoEntrada = { valor: number; unidad: 'kg' | 'lb' };

export type Vista =
  | { tipo: 'iniciar'; entrenamiento: Entrenamiento }
  | { tipo: 'registrar-pasado'; entrenamiento: Entrenamiento }
  | { tipo: 'descartar' }
  | { tipo: 'ejercicio'; realizado: EjercicioRealizado }
  | { tipo: 'serie'; realizadoId: string; serie: Serie }
  | { tipo: 'editar-serie'; realizadoId: string; serieId: string; repeticiones: number; pesoKg: number }
  | { tipo: 'eliminar-serie'; realizadoId: string; serieId: string }
  | { tipo: 'nota'; nota: string | null }
  | { tipo: 'nota-ejercicio'; realizadoId: string; nota: string | null }
  | { tipo: 'finalizar' };

export const vista = (op: Operacion | NuevaOperacion) => op.vista as Vista | undefined;
export const esFinalizar = (op: Operacion) => vista(op)?.tipo === 'finalizar';

const ruta = (e: string) => `/entrenamientos/${e}`;

export function opIniciar(entrenamiento: Entrenamiento): NuevaOperacion {
  const { id, inicio, zonaHoraria } = entrenamiento;
  return { metodo: 'POST', ruta: '/entrenamientos', recurso: id, cuerpo: { id, inicio, zonaHoraria }, vista: { tipo: 'iniciar', entrenamiento } };
}

/** Registro a posteriori (FR-014): se crea ya finalizado con su inicio y su fin. */
export function opRegistrarPasado(entrenamiento: Entrenamiento): NuevaOperacion {
  const { id, inicio, fin, zonaHoraria } = entrenamiento;
  return { metodo: 'POST', ruta: '/entrenamientos', recurso: id, cuerpo: { id, inicio, fin, zonaHoraria }, vista: { tipo: 'registrar-pasado', entrenamiento } };
}

/** Descartar el entrenamiento (V7): lo elimina con sus series. */
export function opDescartar(entrenamiento: Entrenamiento): NuevaOperacion {
  return { metodo: 'DELETE', ruta: `${ruta(entrenamiento.id)}?version=${entrenamiento.version}`, recurso: entrenamiento.id, version: entrenamiento.version, dependeDe: [entrenamiento.id], vista: { tipo: 'descartar' } };
}

export function opAnadirEjercicio(entrenamientoId: string, realizado: EjercicioRealizado): NuevaOperacion {
  const { id, ejercicioId, posicion } = realizado;
  return { metodo: 'POST', ruta: `${ruta(entrenamientoId)}/ejercicios`, recurso: id, dependeDe: [entrenamientoId], cuerpo: { id, ejercicioId, posicion }, vista: { tipo: 'ejercicio', realizado, nombre: realizado.nombre } };
}

export function opAnadirSerie(entrenamientoId: string, realizadoId: string, serie: Serie, pesoEntrada: PesoEntrada): NuevaOperacion {
  const { id, orden, repeticiones, registradaEn } = serie;
  return {
    metodo: 'POST', ruta: `${ruta(entrenamientoId)}/ejercicios/${realizadoId}/series`, recurso: id, dependeDe: [realizadoId],
    cuerpo: { id, orden, repeticiones, pesoEntrada, registradaEn }, vista: { tipo: 'serie', realizadoId, serie },
  };
}

export function opEditarSerie(entrenamientoId: string, realizadoId: string, serie: Serie, repeticiones: number, pesoEntrada: PesoEntrada, pesoKg: number): NuevaOperacion {
  return {
    metodo: 'PATCH', ruta: `${ruta(entrenamientoId)}/ejercicios/${realizadoId}/series/${serie.id}`, recurso: serie.id, version: serie.version, dependeDe: [serie.id],
    cuerpo: { repeticiones, pesoEntrada, version: serie.version }, vista: { tipo: 'editar-serie', realizadoId, serieId: serie.id, repeticiones, pesoKg },
  };
}

export function opEliminarSerie(entrenamientoId: string, realizadoId: string, serie: Serie): NuevaOperacion {
  return {
    metodo: 'DELETE', ruta: `${ruta(entrenamientoId)}/ejercicios/${realizadoId}/series/${serie.id}?version=${serie.version}`,
    recurso: serie.id, version: serie.version, dependeDe: [serie.id], vista: { tipo: 'eliminar-serie', realizadoId, serieId: serie.id },
  };
}

export function opNota(entrenamiento: Entrenamiento, nota: string | null): NuevaOperacion {
  return { metodo: 'PATCH', ruta: ruta(entrenamiento.id), recurso: entrenamiento.id, version: entrenamiento.version, dependeDe: [entrenamiento.id], cuerpo: { nota, version: entrenamiento.version }, vista: { tipo: 'nota', nota } };
}

export function opNotaEjercicio(entrenamientoId: string, realizado: EjercicioRealizado, nota: string | null): NuevaOperacion {
  return {
    metodo: 'PATCH', ruta: `${ruta(entrenamientoId)}/ejercicios/${realizado.id}`, recurso: realizado.id, version: realizado.version, dependeDe: [realizado.id],
    cuerpo: { nota, version: realizado.version }, vista: { tipo: 'nota-ejercicio', realizadoId: realizado.id, nota },
  };
}

/** fin solo se indica tras inactividad (hora de la última serie); si no, el servidor usa la hora actual. */
export function opFinalizar(entrenamiento: Entrenamiento, fin?: string): NuevaOperacion {
  return { metodo: 'POST', ruta: `${ruta(entrenamiento.id)}/finalizar`, recurso: entrenamiento.id, version: entrenamiento.version, dependeDe: [entrenamiento.id], cuerpo: fin ? { fin, version: entrenamiento.version } : { version: entrenamiento.version }, vista: { tipo: 'finalizar' } };
}

const conRealizado = (e: Entrenamiento, id: string, cambio: (r: EjercicioRealizado) => EjercicioRealizado) =>
  ({ ...e, ejercicios: e.ejercicios.map((r) => (r.id === id ? cambio(r) : r)) });

/**
 * Aplica una operación al entrenamiento. Sin respuesta, refleja lo pendiente; con la respuesta del
 * servidor, incorpora el recurso confirmado (con su versión nueva).
 */
export function aplicarOperacion(e: Entrenamiento | null, op: Operacion | NuevaOperacion, respuesta?: unknown): Entrenamiento | null {
  const v = vista(op);
  if (!v) return e;
  if (v.tipo === 'iniciar' || v.tipo === 'registrar-pasado') return e ?? (respuesta as Entrenamiento | undefined) ?? v.entrenamiento;
  if (!e) return e;
  switch (v.tipo) {
    case 'ejercicio': {
      const realizado = (respuesta as EjercicioRealizado | undefined) ?? v.realizado;
      return e.ejercicios.some((r) => r.id === realizado.id) ? e : { ...e, ejercicios: [...e.ejercicios, { ...realizado, series: realizado.series ?? [] }] };
    }
    case 'serie': {
      const serie = (respuesta as Serie | undefined) ?? v.serie;
      return conRealizado(e, v.realizadoId, (r) => (r.series.some((s) => s.id === serie.id) ? r : { ...r, series: [...r.series, serie] }));
    }
    case 'editar-serie': {
      const confirmada = respuesta as Serie | undefined;
      return conRealizado(e, v.realizadoId, (r) => ({ ...r, series: r.series.map((s) => (s.id === v.serieId ? (confirmada ?? { ...s, repeticiones: v.repeticiones, pesoKg: v.pesoKg }) : s)) }));
    }
    case 'eliminar-serie':
      return conRealizado(e, v.realizadoId, (r) => ({ ...r, series: r.series.filter((s) => s.id !== v.serieId) }));
    case 'nota': {
      const confirmado = respuesta as Entrenamiento | undefined;
      return { ...e, nota: v.nota, version: confirmado?.version ?? e.version };
    }
    case 'nota-ejercicio': {
      const confirmado = respuesta as EjercicioRealizado | undefined;
      return conRealizado(e, v.realizadoId, (r) => ({ ...r, nota: v.nota, version: confirmado?.version ?? r.version }));
    }
    case 'finalizar':
      return respuesta === undefined ? e : null;
    case 'descartar':
      return null;
  }
}

/** ¿La operación es de este entrenamiento? (Puede haber uno en curso y otro registrado a posteriori.) */
export function esDe(op: Operacion, e: Entrenamiento | null) {
  if (!e) return vista(op)?.tipo === 'iniciar';
  return op.recurso === e.id || op.ruta.startsWith(`${ruta(e.id)}/`) || op.ruta.startsWith(`${ruta(e.id)}?`) || op.ruta === ruta(e.id);
}

/** Entrenamiento tal como lo ve el usuario: la copia del servidor más lo que sigue en la cola. */
export function conPendientes(base: Entrenamiento | null, pendientes: readonly Operacion[]) {
  return pendientes.reduce((e, op) => (esDe(op, e) ? aplicarOperacion(e, op) : e), base);
}

/**
 * Ante un conflicto, la vista pasa a mostrar la versión vigente del servidor (FR-031): nunca se queda
 * con el cambio rechazado como si se hubiera guardado.
 */
export function aplicarVigente(e: Entrenamiento | null, conflicto: Conflicto): Entrenamiento | null {
  const v = vista(conflicto.operacion);
  if (!e || !v) return e;
  if ((v.tipo === 'editar-serie' || v.tipo === 'eliminar-serie')) {
    const vigente = conflicto.actual as Serie | null;
    return conRealizado(e, v.realizadoId, (r) => ({
      ...r,
      series: conflicto.motivo === 'ELIMINADO' ? r.series.filter((s) => s.id !== v.serieId)
        : vigente ? r.series.map((s) => (s.id === v.serieId ? vigente : s)) : r.series,
    }));
  }
  if ((v.tipo === 'nota' || v.tipo === 'finalizar' || v.tipo === 'descartar') && conflicto.motivo === 'CONFLICTO_VERSION') {
    const vigente = conflicto.actual as Entrenamiento | null;
    return vigente ? { ...e, nota: vigente.nota, version: vigente.version } : e;
  }
  if (v.tipo === 'nota-ejercicio' && conflicto.motivo === 'CONFLICTO_VERSION') {
    const vigente = conflicto.actual as EjercicioRealizado | null;
    return vigente ? conRealizado(e, v.realizadoId, (r) => ({ ...r, nota: vigente.nota, version: vigente.version })) : e;
  }
  return e;
}
