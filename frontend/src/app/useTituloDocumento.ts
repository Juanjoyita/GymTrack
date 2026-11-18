import { useEffect } from 'react';
import { textos } from '../textos/es';

/** Actualiza el título de la pestaña para que los lectores de pantalla anuncien la página actual. */
export function useTituloDocumento(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · ${textos.app.nombre}`;
  }, [titulo]);
}
