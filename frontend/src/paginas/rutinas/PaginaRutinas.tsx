import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ErrorRed } from '../../api/cliente';
import { CLAVE_RUTINAS, listarRutinas, type Rutina } from '../../api/rutinas';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { Boton } from '../../componentes/Boton';
import { IconoCargando, IconoCheck, IconoMas, IconoRutinas } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';
import { CLASES_ENLACE } from '../auth/PaginaLogin';
import { diaIso, nombreDia } from './dias';
import { EliminarRutina } from './EliminarRutina';
import { mensajeInicio, useIniciarDesdeRutina } from './iniciarDesdeRutina';
import { TarjetaRutina } from './TarjetaRutina';

const t = textos.rutinas;

/** Agrupa por día respetando el orden de la API (día y nombre). */
function porDia(rutinas: Rutina[]) {
  const grupos = new Map<number, Rutina[]>();
  for (const r of rutinas) grupos.set(r.diaSemana, [...(grupos.get(r.diaSemana) ?? []), r]);
  return [...grupos];
}

/** Sección Rutinas (US5): plantillas agrupadas por día, con la de hoy destacada. */
export function PaginaRutinas() {
  useTituloDocumento(textos.navegacion.rutinas);
  const navegar = useNavigate();
  const cliente = useQueryClient();
  // Aviso tras guardar en el editor, o resultado de una acción en esta página.
  const avisoEditor = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'error'; texto: string; irAEntrenar?: boolean } | null>(null);
  const iniciar = useIniciarDesdeRutina();
  const [aEliminar, setAEliminar] = useState<Rutina | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const aviso = resultado?.tipo === 'ok' ? resultado.texto : resultado ? null : avisoEditor;
  // Sin reintentos automáticos: ante un fallo se ofrece «Reintentar» al momento.
  const rutinas = useQuery({ queryKey: CLAVE_RUTINAS, queryFn: ({ signal }) => listarRutinas(signal), retry: false });
  const hoy = diaIso();
  // Con rutinas, la acción principal de la página es «Iniciar»: crear pasa a ser secundaria.
  const hayRutinas = Boolean(rutinas.data?.length);
  const crear = (
    <Boton variante={hayRutinas ? 'secundario' : 'principal'} onClick={() => navegar('/rutinas/nueva')} className="w-full sm:w-auto">
      <IconoMas className={`size-5 ${hayRutinas ? 'text-lime-300' : ''}`} />{t.crear}
    </Boton>
  );

  let contenido;
  if (rutinas.isPending) {
    contenido = <p role="status" className="flex items-center gap-2 text-slate-300"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargando}</p>;
  } else if (rutinas.isError) {
    contenido = (
      <div className="flex flex-col gap-3">
        <AvisoError mensaje={rutinas.error instanceof ErrorRed ? textos.errores.sinConexion : t.error} />
        <Boton variante="secundario" onClick={() => rutinas.refetch()}>{textos.acceso.reintentar}</Boton>
      </div>
    );
  } else if (!rutinas.data.length) {
    contenido = (
      <section className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-white/15 p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lime-300"><IconoRutinas className="size-6" /></span>
        <p className="font-display text-2xl font-bold text-white">{t.vacio}</p>
        <p className="text-slate-400">{t.vacioDetalle}</p>
        {crear}
      </section>
    );
  } else {
    contenido = (
      <>
        <div className="flex">{crear}</div>
        {porDia(rutinas.data).map(([dia, lista]) => (
          <section key={dia} aria-labelledby={`dia-${dia}`} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 id={`dia-${dia}`} className="font-display text-2xl font-bold text-white">{nombreDia(dia)}</h2>
              {dia === hoy && <span className="rounded-full bg-lime-300 px-2.5 py-0.5 text-xs font-bold text-slate-950">{t.hoy}</span>}
            </div>
            {lista.map((r) => (
              <TarjetaRutina key={r.id} rutina={r} onEditar={() => navegar(`/rutinas/${r.id}`)} iniciando={iniciar.isPending && iniciar.variables === r.id}
                onIniciar={() => { setResultado(null); iniciar.mutate(r.id, { onError: (e) => setResultado({ tipo: 'error', ...mensajeInicio(e) }) }); }}
                onEliminar={() => { setResultado(null); setAEliminar(r); }} />
            ))}
          </section>
        ))}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 ref={titulo} tabIndex={-1} className="font-display text-4xl font-bold leading-tight text-white focus:outline-none">{textos.navegacion.rutinas}</h1>
        <p className="text-slate-400">{t.subtitulo}</p>
      </header>
      {aviso && <p role="status" className="flex items-center gap-2 rounded-2xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 font-semibold text-lime-100"><IconoCheck className="size-5 text-lime-300" />{aviso}</p>}
      {resultado?.tipo === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <AvisoError mensaje={resultado.texto} />
          {resultado.irAEntrenar && <Link to="/" className={CLASES_ENLACE}>{t.irAEntrenar}</Link>}
        </div>
      )}
      {contenido}
      {aEliminar && (
        <EliminarRutina rutina={aEliminar} onCerrar={() => setAEliminar(null)}
          onEliminada={() => {
            cliente.setQueryData<Rutina[]>(CLAVE_RUTINAS, (lista) => lista?.filter((r) => r.id !== aEliminar.id));
            setAEliminar(null);
            setResultado({ tipo: 'ok', texto: t.eliminada(aEliminar.nombre) });
            // El botón que abrió el diálogo ya no existe: el foco va al título de la página.
            requestAnimationFrame(() => titulo.current?.focus());
          }}
          onConflicto={() => {
            setAEliminar(null);
            setResultado({ tipo: 'error', texto: t.conflictoEliminar });
            void cliente.invalidateQueries({ queryKey: CLAVE_RUTINAS });
          }} />
      )}
    </div>
  );
}
