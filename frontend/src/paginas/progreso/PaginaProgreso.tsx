import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarEjercicios, type Ejercicio } from '../../api/ejercicios';
import { CLAVE_PROGRESO, obtenerProgreso, obtenerRecords, type Periodo } from '../../api/progreso';
import { useSesion } from '../../app/sesion';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { CampoSeleccion } from '../../componentes/CampoSeleccion';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoCargando, IconoProgreso } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { puntosProgreso } from './datos';
import { TablaProgreso } from './TablaProgreso';
import { TarjetasRecords } from './TarjetasRecords';

const t = textos.progreso;
// Recharts solo se descarga al abrir Progreso: no pesa en la carga de Entrenar.
const GraficoProgreso = lazy(() => import('./GraficoProgreso').then((m) => ({ default: m.GraficoProgreso })));
const PERIODOS: Periodo[] = ['1m', '3m', '1a', 'todo'];

/** Ejercicios usados alguna vez, del más reciente al más antiguo. */
const usados = (lista: Ejercicio[]) =>
  lista.filter((e) => e.ultimoUso !== null).sort((a, b) => String(b.ultimoUso).localeCompare(String(a.ultimoUso)));

/** Primer ejercicio, por recencia, con alguna sesión finalizada (un uso puede ser solo en curso). */
async function ejercicioConDatos(candidatos: Ejercicio[], signal: AbortSignal) {
  for (const e of candidatos) {
    if ((await obtenerProgreso(e.id, 'todo', signal)).sesiones.length > 0) return e.id;
  }
  return null;
}

function Cargando() {
  return (
    <p role="status" className="flex items-center gap-2 text-slate-300">
      <IconoCargando className="size-5 animate-spin" />{t.cargando}
    </p>
  );
}

export function PaginaProgreso() {
  useTituloDocumento(textos.navegacion.progreso);
  const unidad = useSesion().data?.unidadPeso ?? 'kg';
  const [elegido, setElegido] = useState<string>();
  const [periodo, setPeriodo] = useState<Periodo>('todo');

  const ejercicios = useQuery({ queryKey: ['ejercicios', ''], queryFn: ({ signal }) => listarEjercicios('', signal) });
  const candidatos = usados(ejercicios.data ?? []);
  const predeterminado = useQuery({
    queryKey: [...CLAVE_PROGRESO, 'predeterminado', candidatos.map((e) => e.id)],
    queryFn: ({ signal }) => ejercicioConDatos(candidatos, signal),
    enabled: ejercicios.isSuccess && elegido === undefined,
  });
  const ejercicioId = elegido ?? predeterminado.data ?? undefined;
  const ejercicio = candidatos.find((e) => e.id === ejercicioId);

  const progreso = useQuery({
    queryKey: [...CLAVE_PROGRESO, ejercicioId, periodo],
    queryFn: ({ signal }) => obtenerProgreso(ejercicioId!, periodo, signal),
    enabled: ejercicioId !== undefined,
    placeholderData: (anterior) => (anterior?.ejercicioId === ejercicioId ? anterior : undefined),
  });
  const records = useQuery({
    queryKey: [...CLAVE_PROGRESO, ejercicioId, 'records'],
    queryFn: ({ signal }) => obtenerRecords(ejercicioId!, undefined, signal),
    enabled: ejercicioId !== undefined,
  });

  const sinEntrenamientos = ejercicios.isSuccess && (candidatos.length === 0 || (predeterminado.isSuccess && predeterminado.data === null && elegido === undefined));
  const puntos = puntosProgreso(progreso.data?.sesiones ?? [], unidad);

  return (
    <div className="flex flex-col gap-6">
      <h1 tabIndex={-1} className="font-display text-4xl font-bold leading-tight text-white focus:outline-none">{textos.navegacion.progreso}</h1>

      {sinEntrenamientos ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-white/15 p-6">
          <IconoProgreso className="size-10 text-lime-300" />
          <p className="font-display text-2xl font-bold text-white">{t.vacio}</p>
          <p className="text-slate-400">{t.vacioDetalle}</p>
          <Link to="/" className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center rounded-xl bg-lime-300 px-5 font-semibold text-slate-950 hover:bg-lime-200`}>{t.irAEntrenar}</Link>
        </section>
      ) : ejercicioId === undefined ? <Cargando /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoSeleccion etiqueta={t.ejercicio} value={ejercicioId} onChange={(e) => setElegido(e.target.value)}
              opciones={candidatos.map((e) => ({ valor: e.id, texto: e.nombre }))} />
            <CampoSeleccion etiqueta={t.periodo} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}
              opciones={PERIODOS.map((p) => ({ valor: p, texto: t.periodos[p] }))} />
          </div>

          <TarjetasRecords records={records.data} unidad={unidad} />

          {progreso.data === undefined ? <Cargando /> : puntos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-6 text-slate-300">{t.sinSesionesPeriodo(ejercicio?.nombre ?? '')}</p>
          ) : (
            <>
              {!progreso.data.suficientesParaTendencia && (
                <p className="flex items-start gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">
                  <IconoProgreso className="mt-0.5 size-5 shrink-0" />{t.unaSesion}
                </p>
              )}
              <Suspense fallback={<Cargando />}>
                <GraficoProgreso ejercicio={ejercicio?.nombre ?? ''} puntos={puntos} unidad={unidad} />
              </Suspense>
              <TablaProgreso puntos={puntos} unidad={unidad} />
            </>
          )}
        </>
      )}
    </div>
  );
}
