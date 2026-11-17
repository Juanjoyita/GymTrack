import { kgALb } from '@gymtrack/domain';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listarEjercicios } from '../../api/ejercicios';
import { listarHistorial } from '../../api/historial';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { CampoSeleccion } from '../../componentes/CampoSeleccion';
import { FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoCargando } from '../../componentes/Iconos';
import { useSesion } from '../../app/sesion';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { textos } from '../../textos/es';

const t = textos.historial;
const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
type ValoresFiltros = { ejercicioId: string; desde: string; hasta: string };

function leerFiltros(parametros: URLSearchParams): ValoresFiltros {
  return {
    ejercicioId: parametros.get('ejercicioId') ?? '',
    desde: parametros.get('desde') ?? '',
    hasta: parametros.get('hasta') ?? '',
  };
}

export function PaginaHistorial() {
  useTituloDocumento(t.titulo);
  // T049 (FR-024): el volumen se muestra en la unidad del usuario.
  const unidad = useSesion().data?.unidadPeso ?? 'kg';
  const [parametros, setParametros] = useSearchParams();
  const [filtros, setFiltros] = useState(() => leerFiltros(parametros));
  const ejercicioId = parametros.get('ejercicioId') ?? undefined;
  const desde = parametros.get('desde') ?? undefined;
  const hasta = parametros.get('hasta') ?? undefined;
  const listaEjercicios = useQuery({
    queryKey: ['ejercicios', 'historial'],
    queryFn: ({ signal }) => listarEjercicios('', signal),
    retry: false,
  });
  const historial = useInfiniteQuery({
    queryKey: ['historial', ejercicioId, desde, hasta],
    queryFn: ({ pageParam, signal }) => listarHistorial({
      ejercicioId, desde, hasta, cursor: pageParam ?? undefined,
    }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima?.siguienteCursor ?? undefined,
    retry: false,
  });

  useEffect(() => { setFiltros(leerFiltros(parametros)); }, [parametros]);

  function aplicar(evento: FormEvent) {
    evento.preventDefault();
    const siguientes = new URLSearchParams();
    if (filtros.ejercicioId) siguientes.set('ejercicioId', filtros.ejercicioId);
    if (filtros.desde) siguientes.set('desde', filtros.desde);
    if (filtros.hasta) siguientes.set('hasta', filtros.hasta);
    setParametros(siguientes);
  }

  function limpiar() {
    setFiltros({ ejercicioId: '', desde: '', hasta: '' });
    setParametros({});
  }

  const elementos = historial.data?.pages.flatMap((pagina) => pagina.elementos) ?? [];
  const ejercicioOptions = listaEjercicios.data?.map((e) => ({ valor: e.id, texto: e.nombre })) ?? [];

  return (
    <section aria-labelledby="titulo-historial" className="flex flex-col gap-6">
      <h1 id="titulo-historial" tabIndex={-1} className="font-display text-4xl font-bold leading-tight text-white focus:outline-none">{t.titulo}</h1>

      <form onSubmit={aplicar} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900 p-4 sm:grid-cols-2">
        <CampoSeleccion etiqueta={t.ejercicio} vacio={t.todosEjercicios} value={filtros.ejercicioId}
          opciones={ejercicioOptions} onChange={(evento) => setFiltros((actual) => ({ ...actual, ejercicioId: evento.target.value }))} />
        <Campo etiqueta={t.desde} type="date" value={filtros.desde}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, desde: evento.target.value }))} />
        <Campo etiqueta={t.hasta} type="date" value={filtros.hasta}
          onChange={(evento) => setFiltros((actual) => ({ ...actual, hasta: evento.target.value }))} />
        <div className="flex items-end gap-2">
          <Boton type="submit" className="flex-1">{t.aplicarFiltros}</Boton>
          <Boton variante="secundario" onClick={limpiar}>{t.limpiarFiltros}</Boton>
        </div>
      </form>

      {historial.isPending ? (
        <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargando}</p>
      ) : historial.isError || listaEjercicios.isError ? (
        <p role="alert" className="text-red-300">{t.error}</p>
      ) : elementos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 p-5 text-slate-300">{t.sinResultados}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {elementos.map((sesion) => {
            const fecha = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: sesion.zonaHoraria }).format(new Date(sesion.inicio));
            const hora = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: sesion.zonaHoraria }).format(new Date(sesion.inicio));
            const query = parametros.toString();
            return (
              <li key={sesion.id}>
                <article className="rounded-3xl border border-white/10 bg-slate-900 p-4">
                  <Link to={`/historial/${sesion.id}${query ? `?${query}` : ''}`}
                    className={`${FOCO_VISIBLE} block rounded-xl font-display text-xl font-bold text-white`}>
                    {t.verEntrenamiento(fecha)}
                  </Link>
                  <p className="mt-1 text-sm text-slate-400">{hora} · {sesion.resumen.duracionMin} min</p>
                  <p className="mt-2 text-slate-200">{t.resumen(sesion.resumen.ejercicios, sesion.resumen.series)}</p>
                  <p className="mt-1 text-slate-300">{t.volumen}: {numero.format(unidad === 'kg' ? sesion.resumen.volumenKg : kgALb(sesion.resumen.volumenKg))} {unidad}</p>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {historial.hasNextPage && (
        <Boton variante="secundario" className="w-full" cargando={historial.isFetchingNextPage} onClick={() => void historial.fetchNextPage()}>
          {t.cargarMas}
        </Boton>
      )}
      <Link to="/?registrarPasado=1" className={`${FOCO_VISIBLE} self-start rounded-lg py-3 text-lime-300 underline underline-offset-4`}>
        {t.registrarPasado}
      </Link>
    </section>
  );
}
