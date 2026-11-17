import type { Rutina } from '../../api/rutinas';
import { Boton } from '../../componentes/Boton';
import { IconoLapiz, IconoMancuerna, IconoPapelera } from '../../componentes/Iconos';
import { textos } from '../../textos/es';

const t = textos.rutinas;

interface TarjetaRutinaProps {
  rutina: Rutina;
  onIniciar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  iniciando?: boolean;
}

/** Una rutina: sus ejercicios en orden y las acciones. Iniciar es la acción principal. */
export function TarjetaRutina({ rutina, onIniciar, onEditar, onEliminar, iniciando = false }: TarjetaRutinaProps) {
  const accion = (texto: string) => t.accion(texto, rutina.nombre);
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-2xl font-bold leading-tight text-white">{rutina.nombre}</h3>
        <p className="text-sm text-slate-400">{t.ejercicios(rutina.ejercicios.length)}</p>
      </div>
      <ol className="flex list-inside list-decimal flex-col gap-1.5 text-slate-200 marker:font-display marker:font-bold marker:text-lime-300">
        {rutina.ejercicios.map((e) => <li key={e.posicion}>{e.nombre}</li>)}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Boton onClick={onIniciar} cargando={iniciando} aria-label={accion(t.iniciar)} className="flex-1">
          {!iniciando && <IconoMancuerna className="size-5" />}{t.iniciar}
        </Boton>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Boton variante="secundario" onClick={onEditar} aria-label={accion(t.editar)}>
            <IconoLapiz className="size-5 text-lime-300" />{t.editar}
          </Boton>
          <Boton variante="secundario" onClick={onEliminar} aria-label={accion(t.eliminar)}>
            <IconoPapelera className="size-5 text-red-300" />{t.eliminar}
          </Boton>
        </div>
      </div>
    </article>
  );
}
