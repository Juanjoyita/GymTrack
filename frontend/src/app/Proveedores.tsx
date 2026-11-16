import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { alEscribir, ErrorApi } from '../api/cliente';
import { CLAVE_EN_CURSO, type Entrenamiento } from '../api/entrenamientos';
import { actualizarProgreso, afectaAlProgreso } from '../api/progreso';
import { CLAVE_SESION, marcarSesionCaducada } from './sesion';

const MAX_REINTENTOS = 2;

// Un error 4xx no se arregla reintentando; solo se reintentan fallos de red y errores del servidor.
function debeReintentar(intentos: number, error: unknown) {
  if (error instanceof ErrorApi && error.status < 500) return false;
  return intentos < MAX_REINTENTOS;
}

export function crearClienteConsultas() {
  // Un 401 en una petición privada significa que la sesión caducó: se vuelve a /login sin datos previos.
  const alFallar = (error: unknown, clave?: readonly unknown[], meta?: Record<string, unknown>) => {
    if (!(error instanceof ErrorApi) || error.status !== 401 || meta?.acceso || clave?.[0] === CLAVE_SESION[0]) return;
    marcarSesionCaducada(cliente);
  };
  const cliente: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, consulta) => alFallar(error, consulta.queryKey, consulta.meta) }),
    mutationCache: new MutationCache({ onError: (error, _variables, _contexto, mutacion) => alFallar(error, undefined, mutacion.meta) }),
    defaultOptions: {
      queries: { retry: debeReintentar, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return cliente;
}

export function Proveedores({ children, cliente }: { children: ReactNode; cliente?: QueryClient }) {
  const [clientePropio] = useState(crearClienteConsultas);
  const activo = cliente ?? clientePropio;
  // T042: cada escritura confirmada que cambia métricas (desde Historial o desde la cola) actualiza Progreso.
  useEffect(() => alEscribir((escritura) => {
    const enCurso = activo.getQueryData<Entrenamiento | null>(CLAVE_EN_CURSO)?.id;
    const afectado = afectaAlProgreso(escritura, enCurso);
    if (afectado) actualizarProgreso(activo, afectado);
  }), [activo]);
  return <QueryClientProvider client={activo}>{children}</QueryClientProvider>;
}
