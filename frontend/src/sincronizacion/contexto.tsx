import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { CLAVE_EN_CURSO, type EjercicioRealizado, type Entrenamiento } from '../api/entrenamientos';
import { registrarLimpiezaDeSesion } from '../app/sesion';
import { crearCola, type Cola } from './cola';
import { crearSincronizador } from './sincronizador';

const ContextoCola = createContext<Cola | null>(null);
const RUTA_EJERCICIOS = /^\/entrenamientos\/[^/]+\/ejercicios$/;

/**
 * Cola y sincronizador del usuario con sesión. Al cerrar sesión o cambiar de usuario se detienen,
 * pero la cola no se borra: queda guardada bajo el id de su dueño y solo se reanuda con él.
 */
export function ProveedorSincronizacion({ usuarioId, children }: { usuarioId: string; children: ReactNode }) {
  const cliente = useQueryClient();
  const cola = useMemo(() => crearCola(usuarioId), [usuarioId]);

  useEffect(() => {
    const sincronizador = crearSincronizador(cola, undefined, {
      alConfirmar: (operacion, respuesta) => {
        // El ejercicio confirmado pasa del estado pendiente a los datos del servidor sin parpadeo.
        // La respuesta ya trae el recurso confirmado: basta con incorporarlo, sin volver a pedir todo.
        if (operacion.metodo === 'POST' && RUTA_EJERCICIOS.test(operacion.ruta)) {
          const realizado = respuesta as EjercicioRealizado;
          cliente.setQueryData<Entrenamiento | null>(CLAVE_EN_CURSO, (actual) => actual && !actual.ejercicios.some((e) => e.id === realizado.id)
            ? { ...actual, ejercicios: [...actual.ejercicios, realizado] } : actual);
          const incorporado = cliente.getQueryData<Entrenamiento | null>(CLAVE_EN_CURSO)?.ejercicios.some((e) => e.id === realizado.id);
          if (incorporado && cliente.getQueryState(CLAVE_EN_CURSO)?.fetchStatus === 'idle') return;
        }
        // Una carga en vuelo pedida antes de la confirmación traería datos viejos. Sin datos previos,
        // invalidar la reutilizaría en vez de cancelarla: se cancela explícitamente y se pide de nuevo.
        void cliente.cancelQueries({ queryKey: CLAVE_EN_CURSO }).then(() => cliente.invalidateQueries({ queryKey: CLAVE_EN_CURSO }));
      },
    });
    sincronizador.iniciar();
    const quitarLimpieza = registrarLimpiezaDeSesion(() => sincronizador.detener());
    return () => { sincronizador.detener(); quitarLimpieza(); };
  }, [cola, cliente]);

  return <ContextoCola.Provider value={cola}>{children}</ContextoCola.Provider>;
}

export function useCola() {
  const cola = useContext(ContextoCola);
  if (!cola) throw new Error('useCola requiere ProveedorSincronizacion.');
  return cola;
}

export function usePendientes() {
  const cola = useCola();
  return useSyncExternalStore(cola.suscribir, cola.pendientes);
}

export function useConflictos() {
  const cola = useCola();
  return useSyncExternalStore(cola.suscribir, cola.conflictos);
}
