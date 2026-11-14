import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ErrorApi } from '../api/cliente';
import { cerrarSesion, iniciarSesion, obtenerSesion, registrarse, type Credenciales, type Usuario } from '../api/auth';

export const CLAVE_SESION = ['sesion'] as const;

// Marca las mutaciones de acceso: su 401 significa credenciales incorrectas, no sesión caducada.
export const META_ACCESO = { acceso: true } as const;

const limpiezas = new Set<() => void>();

/**
 * Registra una tarea que debe ejecutarse al cambiar de usuario, cerrar sesión o caducar la sesión.
 * Punto de integración para la cola local de sincronización (T026). Devuelve la función para anularla.
 */
export function registrarLimpiezaDeSesion(limpiar: () => void) {
  limpiezas.add(limpiar);
  return () => { limpiezas.delete(limpiar); };
}

/** Borra los datos en memoria del usuario anterior para que el siguiente no los vea. */
function limpiarDatosDeUsuario(cliente: QueryClient) {
  cliente.removeQueries({ predicate: (consulta) => consulta.queryKey[0] !== CLAVE_SESION[0] });
  cliente.getMutationCache().clear();
  for (const limpiar of limpiezas) limpiar();
}

function establecerUsuario(cliente: QueryClient, usuario: Usuario | null) {
  limpiarDatosDeUsuario(cliente);
  cliente.setQueryData(CLAVE_SESION, usuario);
}

/** Llamada por el cliente de consultas cuando una petición privada responde 401. */
export function marcarSesionCaducada(cliente: QueryClient) {
  if (cliente.getQueryData(CLAVE_SESION) === null) return;
  establecerUsuario(cliente, null);
}

export function useSesion() {
  return useQuery({ queryKey: CLAVE_SESION, queryFn: obtenerSesion, staleTime: Infinity });
}

export function useIniciarSesion() {
  const cliente = useQueryClient();
  return useMutation({ mutationFn: iniciarSesion, meta: META_ACCESO, onSuccess: (usuario) => establecerUsuario(cliente, usuario) });
}

export function useRegistrarse() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (credenciales: Credenciales) => registrarse({ ...credenciales, zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    meta: META_ACCESO,
    onSuccess: (usuario) => establecerUsuario(cliente, usuario),
  });
}

export function useCerrarSesion() {
  const cliente = useQueryClient();
  return useMutation({
    // Si la sesión ya había caducado (401), el resultado es el mismo: no hay sesión.
    mutationFn: () => cerrarSesion().catch((error: unknown) => {
      if (!(error instanceof ErrorApi && error.status === 401)) throw error;
    }),
    meta: META_ACCESO,
    onSuccess: () => establecerUsuario(cliente, null),
  });
}
