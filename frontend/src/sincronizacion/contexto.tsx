import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { CLAVE_EN_CURSO, type Entrenamiento } from '../api/entrenamientos';
import { registrarLimpiezaDeSesion } from '../app/sesion';
import { aplicarOperacion, aplicarVigente, esDe, vista } from '../paginas/entrenamiento/operaciones';
import { guardarCopia } from '../paginas/entrenamiento/copiaLocal';
import { crearCola, type Cola, type Operacion } from './cola';
import { crearSincronizador } from './sincronizador';

type AlConfirmar = (operacion: Operacion, respuesta: unknown) => void;
interface Sincronizacion { cola: Cola; suscribirConfirmaciones: (fn: AlConfirmar) => () => void; avisarConfirmacion: AlConfirmar }

const ContextoSincronizacion = createContext<Sincronizacion | null>(null);

/**
 * Cola y sincronizador del usuario con sesión. Al cerrar sesión o cambiar de usuario se detienen,
 * pero la cola no se borra: queda guardada bajo el id de su dueño y solo se reanuda con él.
 */
export function ProveedorSincronizacion({ usuarioId, children }: { usuarioId: string; children: ReactNode }) {
  const cliente = useQueryClient();
  const valor = useMemo<Sincronizacion>(() => {
    const confirmaciones = new Set<AlConfirmar>();
    return {
      cola: crearCola(usuarioId),
      suscribirConfirmaciones: (fn) => { confirmaciones.add(fn); return () => { confirmaciones.delete(fn); }; },
      avisarConfirmacion: (op, r) => { for (const fn of confirmaciones) fn(op, r); },
    };
  }, [usuarioId]);

  // Copia local del entrenamiento en curso: se actualiza cada vez que cambian los datos del servidor.
  useEffect(() => cliente.getQueryCache().subscribe((evento) => {
    const { queryKey, state } = evento.query;
    if (queryKey[0] === CLAVE_EN_CURSO[0] && queryKey[1] === CLAVE_EN_CURSO[1] && state.data !== undefined) {
      guardarCopia(usuarioId, state.data as Entrenamiento | null);
    }
  }), [cliente, usuarioId]);

  useEffect(() => {
    const { cola, avisarConfirmacion } = valor;
    const sincronizador = crearSincronizador(cola, undefined, {
      alConfirmar: (operacion, respuesta) => {
        // La respuesta trae el recurso confirmado: se incorpora a los datos sin volver a pedir todo.
        // Se aplica a cada entrenamiento en caché (el que está en curso y los registrados a posteriori),
        // solo si la operación es suya.
        const aplicar = () => {
          for (const { queryKey } of cliente.getQueryCache().findAll({ queryKey: ['entrenamiento'] })) {
            cliente.setQueryData<Entrenamiento | null>(queryKey, (actual) => (actual === undefined || !esDe(operacion, actual) ? actual : aplicarOperacion(actual, operacion, respuesta)));
          }
        };
        // Una carga en vuelo pedida antes de la confirmación traería datos viejos y pisaría el cambio
        // (y sin datos previos TanStack la reutilizaría al invalidar): se cancela, se aplica y se pide de nuevo.
        const enVuelo = cliente.getQueryState(CLAVE_EN_CURSO)?.fetchStatus === 'fetching' || cliente.getQueryData(CLAVE_EN_CURSO) === undefined;
        if (enVuelo) void cliente.cancelQueries({ queryKey: CLAVE_EN_CURSO }).then(() => { aplicar(); return cliente.invalidateQueries({ queryKey: CLAVE_EN_CURSO }); });
        else aplicar();
        avisarConfirmacion(operacion, respuesta);
      },
      alConflicto: (conflictos) => {
        // La vista muestra la versión vigente mientras el usuario decide (repetir o descartar).
        for (const { queryKey } of cliente.getQueryCache().findAll({ queryKey: ['entrenamiento'] })) {
          cliente.setQueryData<Entrenamiento | null>(queryKey, (actual) => (actual === undefined ? actual
            : conflictos.reduce<Entrenamiento | null>((e, c) => (esDe(c.operacion, e) ? aplicarVigente(e, c) : e), actual)));
        }
        // Si ya había uno en curso en otro dispositivo, se carga ese.
        if (conflictos.some((c) => vista(c.operacion)?.tipo === 'iniciar')) void cliente.invalidateQueries({ queryKey: CLAVE_EN_CURSO });
      },
    });
    sincronizador.iniciar();
    const quitarLimpieza = registrarLimpiezaDeSesion(() => sincronizador.detener());
    return () => { sincronizador.detener(); quitarLimpieza(); };
  }, [valor, cliente]);

  return <ContextoSincronizacion.Provider value={valor}>{children}</ContextoSincronizacion.Provider>;
}

function useSincronizacion() {
  const valor = useContext(ContextoSincronizacion);
  if (!valor) throw new Error('Se requiere ProveedorSincronizacion.');
  return valor;
}

export const useCola = () => useSincronizacion().cola;

export function usePendientes() {
  const cola = useCola();
  return useSyncExternalStore(cola.suscribir, cola.pendientes);
}

export function useConflictos() {
  const cola = useCola();
  return useSyncExternalStore(cola.suscribir, cola.conflictos);
}

/** Avisa a la página cuando el servidor confirma una operación (p. ej., el resultado de finalizar). */
export function useAlConfirmar(fn: AlConfirmar) {
  const { suscribirConfirmaciones } = useSincronizacion();
  const ultima = useRef(fn);
  ultima.current = fn;
  useEffect(() => suscribirConfirmaciones((op, r) => ultima.current(op, r)), [suscribirConfirmaciones]);
}
