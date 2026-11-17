import { GRUPOS_MUSCULARES, normalizarNombre } from '@gymtrack/domain';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Ejercicio } from '../../api/ejercicios';
import { Campo } from '../../componentes/Campo';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoAlerta, IconoBajar, IconoCerrar, IconoSubir } from '../../componentes/Iconos';
import { textos } from '../../textos/es';

const t = textos.rutinas;
type Accion = 'subir' | 'bajar' | 'quitar';

interface EjerciciosRutinaProps {
  catalogo: Ejercicio[];
  /** Ids elegidos, en el orden de la rutina. */
  seleccion: string[];
  onCambiar: (seleccion: string[]) => void;
  error?: string;
  buscador: React.RefObject<HTMLInputElement>;
}

/**
 * Elección y orden de ejercicios (FR-028). Marcar añade al final y desmarcar quita; «Subir», «Bajar» y
 * «Quitar» cambian el orden sin arrastrar, con el foco en el mismo ejercicio y el cambio anunciado.
 */
export function EjerciciosRutina({ catalogo, seleccion, onCambiar, error, buscador }: EjerciciosRutinaProps) {
  const [busqueda, setBusqueda] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const pendiente = useRef<{ id: string; accion: Accion } | null>(null);
  const porId = new Map(catalogo.map((e) => [e.id, e]));
  const nombre = (id: string) => porId.get(id)?.nombre ?? '';
  const filtro = normalizarNombre(busqueda);
  const visibles = catalogo.filter((e) => !filtro || normalizarNombre(e.nombre).includes(filtro));
  const grupos = GRUPOS_MUSCULARES.map((g) => [g, visibles.filter((e) => e.grupoMuscular === g)] as const).filter(([, lista]) => lista.length);

  // Tras mover, el foco sigue en el mismo ejercicio; si su botón queda deshabilitado, pasa al contrario.
  useLayoutEffect(() => {
    const destino = pendiente.current;
    if (!destino) return;
    pendiente.current = null;
    const boton = botones.current.get(`${destino.id}-${destino.accion}`);
    const otro = botones.current.get(`${destino.id}-${destino.accion === 'subir' ? 'bajar' : 'subir'}`);
    (boton && !boton.disabled ? boton : otro)?.focus();
  }, [seleccion]);

  function alternar(id: string, marcado: boolean) {
    onCambiar(marcado ? [...seleccion, id] : seleccion.filter((x) => x !== id));
  }

  function mover(indice: number, accion: Accion) {
    const id = seleccion[indice];
    const nueva = [...seleccion];
    if (accion === 'quitar') {
      nueva.splice(indice, 1);
      const vecino = nueva[indice] ?? nueva[indice - 1];
      if (vecino) pendiente.current = { id: vecino, accion: 'quitar' };
      else buscador.current?.focus();
      setAnuncio(t.quitado(nombre(id)));
    } else {
      const destino = accion === 'subir' ? indice - 1 : indice + 1;
      [nueva[indice], nueva[destino]] = [nueva[destino], nueva[indice]];
      pendiente.current = { id, accion };
      setAnuncio(t.posicion(nombre(id), destino + 1, nueva.length));
    }
    onCambiar(nueva);
  }

  const botonOrden = `${AREA_TACTIL} ${FOCO_VISIBLE} flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30`;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
      <section aria-labelledby="titulo-ejercicios-rutina" className="flex flex-col gap-3">
        <div>
          <h2 id="titulo-ejercicios-rutina" className="font-display text-2xl font-bold text-white">{t.seccionEjercicios}</h2>
          <p className="text-sm text-slate-400">{t.seccionEjerciciosDetalle}</p>
        </div>
        {error && <p id="error-ejercicios-rutina" className="flex items-start gap-1.5 text-sm font-medium text-red-300"><IconoAlerta className="mt-0.5 size-4 shrink-0" />{error}</p>}
        <Campo ref={buscador} etiqueta={t.buscar} type="search" autoComplete="off" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          aria-describedby={error ? 'error-ejercicios-rutina' : undefined} />
        {!grupos.length && <p className="text-slate-400">{t.sinResultados}</p>}
        {grupos.map(([grupo, lista]) => (
          <fieldset key={grupo} className="flex flex-col rounded-2xl border border-white/10">
            <legend className="px-2 text-sm font-semibold text-slate-300">{textos.gruposMusculares[grupo]}</legend>
            {lista.map((e) => (
              <label key={e.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-white/5 px-3 py-1 first-of-type:border-t-0 hover:bg-white/5">
                <input type="checkbox" checked={seleccion.includes(e.id)} onChange={(ev) => alternar(e.id, ev.target.checked)}
                  aria-describedby={e.propio ? `propio-${e.id}` : undefined}
                  className={`${FOCO_VISIBLE} size-5 shrink-0 accent-lime-300`} />
                <span className="flex-1 text-white">{e.nombre}</span>
                {e.propio && <span id={`propio-${e.id}`} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{t.propio}</span>}
              </label>
            ))}
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="titulo-orden-rutina" className="flex flex-col gap-3 lg:sticky lg:top-4">
        <h2 id="titulo-orden-rutina" className="font-display text-2xl font-bold text-white">{t.orden}</h2>
        {seleccion.length ? (
          <ol aria-labelledby="titulo-orden-rutina" className="flex flex-col divide-y divide-white/5 rounded-2xl border border-white/10">
            {seleccion.map((id, i) => (
              <li key={id} className="flex items-center gap-2 py-1 pl-3 pr-1">
                <span aria-hidden className="w-6 shrink-0 font-display text-xl font-bold text-lime-300">{i + 1}</span>
                <span data-testid="nombre-ejercicio" className="flex-1 font-semibold text-white">{nombre(id)}</span>
                {(['subir', 'bajar', 'quitar'] as const).map((accion) => {
                  const Icono = accion === 'subir' ? IconoSubir : accion === 'bajar' ? IconoBajar : IconoCerrar;
                  return (
                    <button key={accion} type="button" ref={(b) => { if (b) botones.current.set(`${id}-${accion}`, b); else botones.current.delete(`${id}-${accion}`); }}
                      aria-label={`${t[accion]} ${nombre(id)}`} onClick={() => mover(i, accion)}
                      disabled={(accion === 'subir' && i === 0) || (accion === 'bajar' && i === seleccion.length - 1)}
                      className={`${botonOrden} ${accion === 'quitar' ? 'hover:text-red-300' : ''}`}>
                      <Icono className="size-5" />
                    </button>
                  );
                })}
              </li>
            ))}
          </ol>
        ) : <p className="rounded-2xl border border-dashed border-white/15 p-4 text-slate-400">{t.sinEjercicios}</p>}
        <p role="status" className="sr-only">{anuncio}</p>
      </section>
    </div>
  );
}
