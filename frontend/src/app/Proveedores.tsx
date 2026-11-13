import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ErrorApi } from '../api/cliente';

const MAX_REINTENTOS = 2;

// Un error 4xx no se arregla reintentando; solo se reintentan fallos de red y errores del servidor.
function debeReintentar(intentos: number, error: unknown) {
  if (error instanceof ErrorApi && error.status < 500) return false;
  return intentos < MAX_REINTENTOS;
}

export function crearClienteConsultas() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: debeReintentar, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function Proveedores({ children }: { children: ReactNode }) {
  const [clienteConsultas] = useState(crearClienteConsultas);
  return <QueryClientProvider client={clienteConsultas}>{children}</QueryClientProvider>;
}
