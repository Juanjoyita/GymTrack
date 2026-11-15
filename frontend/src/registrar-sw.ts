import { useSyncExternalStore } from 'react';

interface NavegadorServiceWorker {
  serviceWorker?: {
    controller: unknown;
    register(url: string, opciones: { scope: string }): Promise<unknown>;
    addEventListener(tipo: 'controllerchange', oyente: () => void): void;
  };
}

/**
 * Registra el service worker solo en el build de producción. La aplicación se declara disponible
 * sin conexión únicamente cuando el worker ya controla la página, no al registrarlo.
 */
export function crearRegistroServiceWorker({ navegador, produccion }: { navegador: NavegadorServiceWorker; produccion: boolean }) {
  let disponible = false;
  const suscriptores = new Set<() => void>();
  const comprobar = () => {
    const ahora = Boolean(navegador.serviceWorker?.controller);
    if (ahora === disponible) return;
    disponible = ahora;
    for (const avisar of suscriptores) avisar();
  };

  return {
    async registrar() {
      const sw = navegador.serviceWorker;
      if (!produccion || !sw) return;
      sw.addEventListener('controllerchange', comprobar);
      comprobar();
      try {
        await sw.register('/sw.js', { scope: '/' });
      } catch {
        // Sin worker la aplicación sigue funcionando con red; solo pierde la carga sin conexión.
      }
    },
    disponibleSinConexion: () => disponible,
    suscribir(avisar: () => void) {
      suscriptores.add(avisar);
      return () => { suscriptores.delete(avisar); };
    },
  };
}

export const registroServiceWorker = crearRegistroServiceWorker({
  navegador: typeof navigator === 'undefined' ? {} : navigator as unknown as NavegadorServiceWorker,
  produccion: import.meta.env.PROD,
});

export function useDisponibleSinConexion() {
  return useSyncExternalStore(registroServiceWorker.suscribir, registroServiceWorker.disponibleSinConexion);
}
