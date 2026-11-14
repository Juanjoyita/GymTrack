import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { IconoCerrar } from './Iconos';
import { AREA_TACTIL, FOCO_VISIBLE } from './estilos';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogoProps {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Control que recibe el foco al abrir; por defecto, el primero enfocable. */
  focoInicial?: RefObject<HTMLElement | null>;
  textoCerrar: string;
}

/**
 * Diálogo modal accesible: título asociado, foco atrapado, Escape para cerrar y devolución del foco
 * al control que lo abrió. En móvil ocupa casi toda la pantalla como una hoja; desde sm, centrado.
 */
export function Dialogo({ titulo, onCerrar, children, focoInicial, textoCerrar }: DialogoProps) {
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    (focoInicial?.current ?? panel.current?.querySelector<HTMLElement>(ENFOCABLES))?.focus();
    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // En el documento, no en el panel: si un control enfocado desaparece y el foco cae en <body>,
    // Escape sigue cerrando y Tab devuelve el foco al diálogo.
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        alCerrar.current();
        return;
      }
      if (evento.key !== 'Tab' || !panel.current) return;
      const enfocables = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((e) => !e.closest('[inert]'));
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement;
      if (!panel.current.contains(actual)) { evento.preventDefault(); (evento.shiftKey ? ultimo : primero).focus(); }
      else if (evento.shiftKey && actual === primero) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && actual === ultimo) { evento.preventDefault(); primero.focus(); }
    }
    document.addEventListener('keydown', alPulsarTecla);
    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.body.style.overflow = desplazamiento;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [focoInicial]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="relative flex h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-950 text-white shadow-2xl sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <h2 id={idTitulo} className="font-display text-3xl font-bold leading-none">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label={textoCerrar} className={`${AREA_TACTIL} ${FOCO_VISIBLE} -mr-2 flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white`}>
            <IconoCerrar className="size-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
