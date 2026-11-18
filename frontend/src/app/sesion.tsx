import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ErrorApi, ErrorRed } from '../api/cliente';
import { cerrarSesion, iniciarSesion, obtenerSesion, registrarse, restablecerContrasena, type Credenciales, type Usuario } from '../api/auth';
import { actualizarPreferencias } from '../api/cuenta';

export const CLAVE_SESION = ['sesion'] as const;

// Marca las mutaciones de acceso: su 401 significa credenciales incorrectas, no sesión caducada.
export const META_ACCESO = { acceso: true } as const;

const limpiezas = new Set<() => void>();

// Última sesión válida (solo id, email, unidad y zona; nunca contraseña ni token). Se usa únicamente
// si la red falla, para que el shell en caché siga siendo usable al recargar sin conexión (T026A).
const CLAVE_ULTIMA_SESION = 'gymtrack:ultima-sesion';

function recordarSesion(usuario: Usuario | null) {
  try {
    if (usuario) localStorage.setItem(CLAVE_ULTIMA_SESION, JSON.stringify({ id: usuario.id, email: usuario.email, unidadPeso: usuario.unidadPeso, zonaHoraria: usuario.zonaHoraria }));
    else localStorage.removeItem(CLAVE_ULTIMA_SESION);
  } catch { /* Sin almacenamiento disponible: solo se pierde el acceso sin red. */ }
}

function sesionRecordada(): Usuario | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_ULTIMA_SESION) ?? 'null') as Usuario | null; } catch { return null; }
}

async function consultarSesion() {
  try {
    const usuario = await obtenerSesion();
    recordarSesion(usuario);
    return usuario;
  } catch (error) {
    const recordada = error instanceof ErrorRed ? sesionRecordada() : null;
    if (recordada) return recordada;
    throw error;
  }
}

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

/**
 * Cuenta eliminada (T049): olvida la sesión y la caché como al cerrar sesión y, después (al quitar las
 * consultas se vuelve a guardar la copia local), borra todo lo guardado en el navegador para ese
 * usuario (`gymtrack:*:<id>`). Los datos de otros usuarios del mismo navegador no se tocan.
 */
export function olvidarCuenta(cliente: QueryClient, usuarioId: string) {
  establecerUsuario(cliente, null);
  try {
    const claves = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
    for (const clave of claves) if (clave.startsWith('gymtrack:') && clave.endsWith(`:${usuarioId}`)) localStorage.removeItem(clave);
  } catch { /* Sin almacenamiento disponible: no hay nada que borrar. */ }
}

function establecerUsuario(cliente: QueryClient, usuario: Usuario | null) {
  limpiarDatosDeUsuario(cliente);
  recordarSesion(usuario);
  cliente.setQueryData(CLAVE_SESION, usuario);
}

/** Llamada por el cliente de consultas cuando una petición privada responde 401. */
export function marcarSesionCaducada(cliente: QueryClient) {
  if (cliente.getQueryData(CLAVE_SESION) === null) return;
  establecerUsuario(cliente, null);
}

export function useSesion() {
  // Sin reintentos automáticos: sin red se usa al momento la sesión recordada o se ofrece «Reintentar».
  return useQuery({ queryKey: CLAVE_SESION, queryFn: consultarSesion, staleTime: Infinity, retry: false });
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

/**
 * Cambia la unidad de peso (FR-024). Es el mismo usuario: se actualizan la sesión y la sesión recordada
 * sin borrar sus datos en caché; las pantallas convierten al mostrar y los pesos guardados no cambian.
 */
export function useActualizarPreferencias() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: actualizarPreferencias,
    onSuccess: (usuario) => {
      recordarSesion(usuario);
      cliente.setQueryData(CLAVE_SESION, usuario);
    },
  });
}

/**
 * Restablece la contraseña. El servidor cierra todas las sesiones, así que la de este navegador
 * (si la hubiera) se olvida igual que al cerrar sesión.
 */
export function useRestablecerContrasena() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: restablecerContrasena,
    meta: META_ACCESO,
    onSuccess: () => establecerUsuario(cliente, null),
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
