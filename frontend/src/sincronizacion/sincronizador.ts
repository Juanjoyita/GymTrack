import { ErrorApi, ErrorRed, solicitar, type OpcionesSolicitud } from '../api/cliente';
import type { Cola, Conflicto, MotivoConflicto, Operacion } from './cola';

export type Enviar = (ruta: string, opciones: OpcionesSolicitud) => Promise<unknown>;

interface OpcionesSincronizador {
  alConfirmar?: (operacion: Operacion, respuesta: unknown) => void;
  alConflicto?: (conflictos: Conflicto[]) => void;
  intervaloMs?: number;
}

const INTERVALO_MS = 10_000;

/** Errores transitorios: la operación se conserva y se reintenta igual (mismo UUID, mismo cuerpo).
 *  401 también detiene: la cola se reanuda cuando el mismo usuario vuelve a iniciar sesión. */
function esTransitorio(error: unknown) {
  return error instanceof ErrorRed || (error instanceof ErrorApi && (error.status >= 500 || error.status === 429 || error.status === 401));
}

function motivo(error: ErrorApi): MotivoConflicto {
  if (error.status === 409) return error.codigo === 'CONFLICTO_VERSION' ? 'CONFLICTO_VERSION' : 'RECHAZADA';
  if (error.status === 404) return 'ELIMINADO';
  if (error.status === 400) return 'VALIDACION';
  return 'RECHAZADA';
}

/**
 * Envía la cola en orden, de una en una (R-08). Vacía cada operación solo tras la confirmación y
 * aparta los conflictos para que el usuario decida (R-09): nunca sobrescribe en silencio.
 */
export function crearSincronizador(cola: Cola, enviar: Enviar = solicitar, opciones: OpcionesSincronizador = {}) {
  let enCurso: Promise<void> | null = null;
  let activo = false;
  let intervalo: ReturnType<typeof setInterval> | undefined;
  let quitarSuscripcion: (() => void) | undefined;

  async function procesar() {
    for (;;) {
      const operacion = cola.pendientes()[0];
      if (!operacion) return;
      try {
        const respuesta = await enviar(operacion.ruta, { method: operacion.metodo, cuerpo: operacion.cuerpo });
        cola.confirmar(operacion.id);
        opciones.alConfirmar?.(operacion, respuesta);
      } catch (error) {
        if (esTransitorio(error) || !(error instanceof ErrorApi)) return;
        const conflictos = cola.aConflicto(operacion.id, motivo(error), error.actual);
        opciones.alConflicto?.(conflictos);
      }
    }
  }

  function sincronizar() {
    enCurso ??= procesar().finally(() => { enCurso = null; });
    return enCurso;
  }

  const alRecuperarConexion = () => { void sincronizar(); };

  return {
    sincronizar,

    /** Sincroniza ahora, al recuperar la conexión, al encolar y cada 10 s mientras queden pendientes. */
    iniciar() {
      if (activo) return;
      activo = true;
      window.addEventListener('online', alRecuperarConexion);
      intervalo = setInterval(() => { if (cola.pendientes().length) void sincronizar(); }, opciones.intervaloMs ?? INTERVALO_MS);
      quitarSuscripcion = cola.suscribir(() => { if (cola.pendientes().length && !enCurso) void sincronizar(); });
      void sincronizar();
    },

    detener() {
      activo = false;
      window.removeEventListener('online', alRecuperarConexion);
      clearInterval(intervalo);
      quitarSuscripcion?.();
    },
  };
}
