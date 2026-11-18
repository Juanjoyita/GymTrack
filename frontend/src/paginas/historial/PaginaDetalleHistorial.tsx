import { esquemaSerie, kgALb, redondearPesoParaMostrar } from '@gymtrack/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  actualizarEjercicioHistorial,
  actualizarNotaHistorial,
  actualizarSerieHistorial,
  eliminarEntrenamientoHistorial,
  obtenerEntrenamientoHistorial,
} from '../../api/historial';
import type { EjercicioRealizado, Entrenamiento, Serie } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { CampoArea } from '../../componentes/CampoArea';
import { Dialogo } from '../../componentes/Dialogo';
import { FOCO_VISIBLE } from '../../componentes/estilos';
import { useSesion } from '../../app/sesion';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { textos } from '../../textos/es';

const t = textos.historial;
const ts = textos.entrenar.serie;
const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
type Unidad = 'kg' | 'lb';
// T049 (FR-024): los pesos se guardan en kg y se muestran en la unidad del usuario.
const enUnidad = (kg: number, unidad: Unidad) => redondearPesoParaMostrar(unidad === 'kg' ? kg : kgALb(kg));
const formatoPeso = (kg: number, unidad: Unidad) => `${numero.format(enUnidad(kg, unidad))} ${unidad}`;

function mensajeError(error: unknown) {
  return error instanceof Error ? `${t.errorGuardado} ${error.message}` : t.errorGuardado;
}

export function PaginaDetalleHistorial() {
  const { id = '' } = useParams();
  const unidad = useSesion().data?.unidadPeso ?? 'kg';
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const cliente = useQueryClient();
  const [nota, setNota] = useState('');
  const [guardado, setGuardado] = useState('');
  const [confirmarEliminacion, setConfirmarEliminacion] = useState(false);
  const [serieFormId, setSerieFormId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['historial', 'detalle', id],
    queryFn: ({ signal }) => obtenerEntrenamientoHistorial(id, signal),
    retry: false,
    enabled: Boolean(id),
  });
  useTituloDocumento(query.data ? t.detalle : t.abriendo);
  useEffect(() => { setNota(query.data?.nota ?? ''); }, [query.data?.nota]);

  const notaEntrenamiento = useMutation({
    mutationFn: (valor: string) => actualizarNotaHistorial(id, valor.trim() || null, query.data!.version),
    onMutate: () => setGuardado(''),
    onSuccess: (actualizado) => { actualizarDetalle(cliente, actualizado); setGuardado(t.notaGuardada); },
  });
  const notaEjercicio = useMutation({
    mutationFn: ({ ejercicio, valor }: { ejercicio: EjercicioRealizado; valor: string }) =>
      actualizarEjercicioHistorial(id, ejercicio.id, valor.trim() || null, ejercicio.version),
    onMutate: () => setGuardado(''),
    onSuccess: (actualizado) => {
      actualizarDetalle(cliente, { ...query.data!, ejercicios: query.data!.ejercicios.map((e) => e.id === actualizado.id ? actualizado : e) });
      setGuardado(t.notaGuardada);
    },
  });
  const serie = useMutation({
    mutationFn: ({ ejercicioId, serieId, datos }: { ejercicioId: string; serieId: string; datos: { pesoEntrada: { valor: number; unidad: 'kg' | 'lb' }; repeticiones: number; version: number } }) =>
      actualizarSerieHistorial(id, ejercicioId, serieId, datos),
    onMutate: () => setGuardado(''),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['historial', 'detalle', id] }),
        cliente.invalidateQueries({ queryKey: ['historial'] }),
      ]);
      setGuardado(t.serieGuardada);
    },
  });
  const eliminar = useMutation({
    mutationFn: () => eliminarEntrenamientoHistorial(id, query.data!.version),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['historial'] });
      setConfirmarEliminacion(false);
      navigate('/historial', { replace: true });
    },
  });

  if (query.isPending) return <p role="status">{t.abriendo}</p>;
  if (query.isError || !query.data || query.data.estado !== 'finalizado') {
    return (
      <section className="flex flex-col gap-4">
        <p role="alert" className="text-red-300">{t.error}</p>
        <Link to="/historial" className={`${FOCO_VISIBLE} self-start rounded-lg py-3 text-lime-300 underline`}>{t.volver}</Link>
      </section>
    );
  }

  const entrenamiento = query.data;
  const volver = parametros.toString();
  const error = notaEntrenamiento.error ?? notaEjercicio.error ?? serie.error;

  return (
    <section aria-labelledby="titulo-detalle" className="flex flex-col gap-5">
      <Link to={`/historial${volver ? `?${volver}` : ''}`} className={`${FOCO_VISIBLE} self-start rounded-lg py-2 text-lime-300 underline underline-offset-4`}>
        {t.volver}
      </Link>
      <header className="flex flex-col gap-3">
        <h1 id="titulo-detalle" tabIndex={-1} className="font-display text-3xl font-bold text-white">{t.detalle}</h1>
        <p className="text-slate-300">{new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: entrenamiento.zonaHoraria }).format(new Date(entrenamiento.inicio))}</p>
        <p className="text-slate-300">{entrenamiento.resumen.duracionMin} min · {entrenamiento.resumen.ejercicios} {entrenamiento.resumen.ejercicios === 1 ? 'ejercicio' : 'ejercicios'} · {entrenamiento.resumen.series} {entrenamiento.resumen.series === 1 ? 'serie' : 'series'} · {formatoPeso(entrenamiento.resumen.volumenKg, unidad)}</p>
      </header>

      <div className="flex flex-col gap-4">
        {entrenamiento.ejercicios.map((ejercicio) => (
          <article key={ejercicio.id} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-4 sm:p-5">
            <div>
              <h2 className="font-display text-2xl font-bold leading-tight text-white">{ejercicio.nombre}</h2>
              {ejercicio.series.length > 0 ? (
                <ol className="mt-3 flex flex-col divide-y divide-white/5 rounded-2xl border border-white/10">
                  {ejercicio.series.map((s, index) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 pl-3 pr-1">
                      <span className="w-16 shrink-0 text-sm font-semibold text-slate-400">{ts.titulo(index + 1)}</span>
                      <span className="flex-1 font-display text-lg font-bold text-white">{formatoPeso(s.pesoKg, unidad)} × {s.repeticiones}</span>
                      <Boton variante="secundario" className="min-h-11 px-3" aria-label={ts.editar(index + 1)}
                        onClick={() => serieFormId === s.id ? setSerieFormId(null) : setSerieFormId(s.id)}>
                        {ts.editar(index + 1)}
                      </Boton>
                      {serieFormId === s.id && (
                        <FormularioSerie key={`${s.id}-${s.version}`} serie={s} unidad={unidad} onCancelar={() => setSerieFormId(null)}
                          onGuardar={(pesoEntrada, repeticiones) => {
                            serie.mutate({ ejercicioId: ejercicio.id, serieId: s.id, datos: { pesoEntrada, repeticiones, version: s.version } });
                            setSerieFormId(null);
                          }} />
                      )}
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-3 text-sm text-slate-400">{textos.entrenar.sinSeries}</p>}
            </div>
            <NotaEjercicio ejercicio={ejercicio} cargando={notaEjercicio.isPending}
              onGuardar={(valor) => notaEjercicio.mutate({ ejercicio, valor })} />
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900 p-4">
        <CampoArea etiqueta={t.nota} maxLength={1000} value={nota} onChange={(evento) => setNota(evento.target.value)} />
        <Boton className="w-full" cargando={notaEntrenamiento.isPending}
          disabled={nota.trim() === (entrenamiento.nota ?? '')} onClick={() => notaEntrenamiento.mutate(nota)}>
          {t.guardarNota}
        </Boton>
      </div>

      {guardado && <p role="status" aria-live="polite" className="text-lime-300">{guardado}</p>}
      {error && <p role="alert" className="text-red-300">{mensajeError(error)}</p>}

      <Boton variante="peligro" className="w-full" onClick={() => setConfirmarEliminacion(true)}>{t.eliminarEntrenamiento}</Boton>
      {confirmarEliminacion && (
        <Dialogo titulo={t.confirmarEliminacionTitulo} textoCerrar={t.cancelar} onCerrar={() => setConfirmarEliminacion(false)}>
          <div className="flex flex-col gap-5 overflow-y-auto p-5">
            <p className="text-slate-300">{t.confirmarEliminacionTexto}</p>
            {eliminar.error && <p role="alert" className="text-red-300">{mensajeError(eliminar.error)}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Boton variante="secundario" className="flex-1" onClick={() => setConfirmarEliminacion(false)}>{t.cancelar}</Boton>
              <Boton variante="peligro" className="flex-1" cargando={eliminar.isPending} onClick={() => eliminar.mutate()}>{eliminar.isPending ? t.cargandoEliminacion : t.confirmarEliminacion}</Boton>
            </div>
          </div>
        </Dialogo>
      )}
    </section>
  );
}

function actualizarDetalle(cliente: ReturnType<typeof useQueryClient>, entrenamiento: Entrenamiento) {
  cliente.setQueryData(['historial', 'detalle', entrenamiento.id], entrenamiento);
  void cliente.invalidateQueries({ queryKey: ['historial'] });
}

function NotaEjercicio({ ejercicio, cargando, onGuardar }: {
  ejercicio: EjercicioRealizado; cargando: boolean; onGuardar: (nota: string) => void;
}) {
  const [nota, setNota] = useState(ejercicio.nota ?? '');
  useEffect(() => { setNota(ejercicio.nota ?? ''); }, [ejercicio.nota]);
  return (
    <div className="flex flex-col gap-2">
      <CampoArea etiqueta={textos.entrenar.notaEjercicio} maxLength={1000} value={nota} onChange={(evento) => setNota(evento.target.value)} />
      <Boton variante="secundario" cargando={cargando} disabled={nota.trim() === (ejercicio.nota ?? '')}
        onClick={() => onGuardar(nota)}>{t.guardar}</Boton>
    </div>
  );
}

function FormularioSerie({ serie, unidad, onCancelar, onGuardar }: {
  serie: Serie; unidad: Unidad; onCancelar: () => void; onGuardar: (peso: { valor: number; unidad: 'kg' | 'lb' }, repeticiones: number) => void;
}) {
  const [peso, setPeso] = useState(String(enUnidad(serie.pesoKg, unidad)));
  const [repeticiones, setRepeticiones] = useState(String(serie.repeticiones));
  const [error, setError] = useState('');

  function guardar(evento: FormEvent) {
    evento.preventDefault();
    const valor = Number(peso.trim().replace(',', '.'));
    const reps = Number(repeticiones.trim());
    const resultado = esquemaSerie.safeParse({ repeticiones: reps, pesoEntrada: { valor, unidad } });
    if (!resultado.success) {
      setError(resultado.error.issues[0]?.path[0] === 'repeticiones' ? ts.errorRepeticiones : ts.errorPeso);
      return;
    }
    setError('');
    onGuardar({ valor, unidad }, reps);
  }

  return (
    <form noValidate onSubmit={guardar} className="flex w-full flex-col gap-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta={ts.peso(unidad)} inputMode="decimal" value={peso} onChange={(evento) => setPeso(evento.target.value)} />
        <Campo etiqueta={ts.repeticiones} inputMode="numeric" value={repeticiones} onChange={(evento) => setRepeticiones(evento.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Boton type="submit" className="flex-1">{ts.guardarCambios}</Boton>
        <Boton variante="secundario" onClick={onCancelar}>{ts.cancelar}</Boton>
      </div>
    </form>
  );
}
