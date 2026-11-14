// Cola duradera de operaciones pendientes (research R-08) y lista de conflictos (R-09), persistidas
// en localStorage por usuario. Solo se guardan operaciones de entrenamiento: nunca credenciales.

/** Subconjunto de Storage que usa la cola; permite probarla con un almacén en memoria. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface NuevaOperacion {
  metodo: 'POST' | 'PATCH' | 'DELETE';
  ruta: string;
  cuerpo?: unknown;
  /** Id del recurso que crea, edita o elimina (UUID generado en el cliente al crear). */
  recurso: string;
  /** Versión esperada en PATCH/DELETE (bloqueo optimista). */
  version?: number;
  /** Recursos que deben existir en el servidor antes de enviar esta operación. */
  dependeDe?: string[];
  /** Datos para mostrarla en la interfaz mientras está pendiente (p. ej., el nombre). */
  vista?: Record<string, unknown>;
}

export interface Operacion extends NuevaOperacion {
  id: string;
  creadaEn: string;
}

/** CONFLICTO_VERSION: otra versión vigente · ELIMINADO: 404 sobre un recurso conocido ·
 *  VALIDACION: 400 · DEPENDENCIA: depende de otra en conflicto · RECHAZADA: otro 409/4xx. */
export type MotivoConflicto = 'CONFLICTO_VERSION' | 'ELIMINADO' | 'VALIDACION' | 'DEPENDENCIA' | 'RECHAZADA';

export interface Conflicto {
  id: string;
  operacion: Operacion;
  motivo: MotivoConflicto;
  actual: unknown;
  detectadoEn: string;
}

interface Estado { pendientes: Operacion[]; conflictos: Conflicto[] }

export type Cola = ReturnType<typeof crearCola>;

export const claveCola = (usuarioId: string) => `gymtrack:cola:${usuarioId}`;

function leer(almacen: Almacen, clave: string): Estado {
  try {
    const guardado = JSON.parse(almacen.getItem(clave) ?? 'null') as Partial<Estado> | null;
    return {
      pendientes: Array.isArray(guardado?.pendientes) ? guardado.pendientes : [],
      conflictos: Array.isArray(guardado?.conflictos) ? guardado.conflictos : [],
    };
  } catch {
    // Contenido dañado: se empieza de cero antes que bloquear la aplicación.
    return { pendientes: [], conflictos: [] };
  }
}

/** Datos de la operación sin su identidad en la cola (id y fecha), para rehacerla como nueva. */
function sinIdentidad({ metodo, ruta, cuerpo, recurso, version, dependeDe, vista }: NuevaOperacion): NuevaOperacion {
  return { metodo, ruta, cuerpo, recurso, version, dependeDe, vista };
}

/** Con «Repetir mi cambio», la operación se rehace sobre la versión vigente del recurso. */
function conVersion(operacion: Operacion, version: number): NuevaOperacion {
  const resto = sinIdentidad(operacion);
  const cuerpo = operacion.cuerpo && typeof operacion.cuerpo === 'object' && 'version' in operacion.cuerpo
    ? { ...operacion.cuerpo, version } : operacion.cuerpo;
  return { ...resto, cuerpo, version, ruta: operacion.ruta.replace(/([?&]version=)\d+/, `$1${version}`) };
}

export function crearCola(usuarioId: string, almacen: Almacen = localStorage) {
  const clave = claveCola(usuarioId);
  let estado = leer(almacen, clave);
  const suscriptores = new Set<() => void>();

  // Se escribe en el almacén antes de notificar: si la escritura falla, la interfaz no confirma nada.
  function guardar(nuevo: Estado) {
    almacen.setItem(clave, JSON.stringify(nuevo));
    estado = nuevo;
    for (const avisar of suscriptores) avisar();
  }

  function encolar(nueva: NuevaOperacion): Operacion {
    const operacion: Operacion = { ...nueva, id: crypto.randomUUID(), creadaEn: new Date().toISOString() };
    guardar({ ...estado, pendientes: [...estado.pendientes, operacion] });
    return operacion;
  }

  return {
    encolar,
    pendientes: () => estado.pendientes,
    conflictos: () => estado.conflictos,

    /** Retira una operación solo cuando el servidor la confirmó. */
    confirmar(operacionId: string) {
      guardar({ ...estado, pendientes: estado.pendientes.filter((o) => o.id !== operacionId) });
    },

    /** Saca la operación de la cola sin aplicarla, junto con las que dependen de ella. */
    aConflicto(operacionId: string, motivo: MotivoConflicto, actual: unknown) {
      const detectadoEn = new Date().toISOString();
      const bloqueados = new Set<string>();
      const nuevos: Conflicto[] = [];
      const restantes: Operacion[] = [];
      for (const operacion of estado.pendientes) {
        const esta = operacion.id === operacionId;
        const depende = operacion.dependeDe?.some((r) => bloqueados.has(r));
        if (esta || depende) {
          bloqueados.add(operacion.recurso);
          nuevos.push({ id: crypto.randomUUID(), operacion, motivo: esta ? motivo : 'DEPENDENCIA', actual: esta ? actual : null, detectadoEn });
        } else restantes.push(operacion);
      }
      guardar({ pendientes: restantes, conflictos: [...estado.conflictos, ...nuevos] });
      return nuevos;
    },

    /** «Repetir mi cambio»: nueva operación con la versión vigente que devolvió el servidor. */
    repetir(conflictoId: string) {
      const conflicto = estado.conflictos.find((c) => c.id === conflictoId);
      if (!conflicto) throw new Error('Conflicto inexistente.');
      const version = (conflicto.actual as { version?: unknown } | null)?.version;
      const nueva = typeof version === 'number' ? conVersion(conflicto.operacion, version) : sinIdentidad(conflicto.operacion);
      const operacion: Operacion = { ...nueva, id: crypto.randomUUID(), creadaEn: new Date().toISOString() };
      guardar({ pendientes: [...estado.pendientes, operacion], conflictos: estado.conflictos.filter((c) => c.id !== conflictoId) });
      return operacion;
    },

    /** «Descartar mi cambio»: no se envía nada. */
    descartar(conflictoId: string) {
      guardar({ ...estado, conflictos: estado.conflictos.filter((c) => c.id !== conflictoId) });
    },

    suscribir(avisar: () => void) {
      suscriptores.add(avisar);
      return () => { suscriptores.delete(avisar); };
    },
  };
}
