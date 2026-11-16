import { calcularUnoRm } from '@gymtrack/domain';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { Ejercicio } from '../../api/ejercicios';
import type { EjercicioRealizado, Entrenamiento, Serie } from '../../api/entrenamientos';
import { CLAVE_PROGRESO, obtenerRecords, type RecordsPersonales } from '../../api/progreso';
import { Boton } from '../../componentes/Boton';
import { IconoMas } from '../../componentes/Iconos';
import type { NuevaOperacion, Operacion } from '../../sincronizacion/cola';
import { textos } from '../../textos/es';
import { opAnadirEjercicio, opReabrirEjercicio, opTerminarEjercicio } from './operaciones';
import { avisaVolumen, recordsDeSeries, volumenNotificado, volumenSesion, type MetricaSerie } from './records';
import { SelectorEjercicio } from './SelectorEjercicio';
import { TarjetaEjercicio, textoPeso } from './TarjetaEjercicio';

const t = textos.entrenar;

/**
 * Eliminaciones de series en espera de «Deshacer», por ejercicio: la página las envía antes de
 * finalizar o terminar, para que entren en el resumen.
 */
export function useEliminacionesEnEspera() {
  const eliminaciones = useRef(new Map<string, () => void>());
  const registros = useRef(new Map<string, (vaciar: (() => void) | null) => void>());
  const registrarPara = useCallback((id: string) => {
    let registro = registros.current.get(id);
    if (!registro) {
      registro = (vaciar) => { if (vaciar) eliminaciones.current.set(id, vaciar); else eliminaciones.current.delete(id); };
      registros.current.set(id, registro);
    }
    return registro;
  }, []);
  const enviarTodas = useCallback(() => { for (const vaciar of [...eliminaciones.current.values()]) vaciar(); }, []);
  return { registrarPara, enviarTodas };
}

/** Avisos de récord (FR-022): solo en el entrenamiento en curso, no en el registrado a posteriori. */
export interface Avisos {
  /** Anuncia el último evento en la región aria-live de la página (null la vacía). */
  anunciar: (mensaje: string | null) => void;
}

/**
 * Récords de sesiones anteriores de cada ejercicio, excluido este entrenamiento. Se piden al añadir el
 * ejercicio y se guardan durante la sesión para comparar en local, también sin conexión (R-11). Si no
 * llegaron a cargarse no hay datos fiables y no se avisa.
 */
export const claveRecordsPrevios = (ejercicioId: string, entrenamientoId: string) => [...CLAVE_PROGRESO, ejercicioId, 'records', entrenamientoId];

function useRecordsPrevios(entrenamiento: Entrenamiento, activos: boolean) {
  const ids = [...new Set(entrenamiento.ejercicios.map((r) => r.ejercicioId))];
  const consultas = useQueries({
    queries: ids.map((id) => ({
      queryKey: claveRecordsPrevios(id, entrenamiento.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => obtenerRecords(id, entrenamiento.id, signal),
      enabled: activos, staleTime: Infinity, gcTime: Infinity, retry: false,
    })),
  });
  return new Map<string, RecordsPersonales | undefined>(ids.map((id, i) => [id, consultas[i].data]));
}

const seriesDe = (e: Entrenamiento, ejercicioId: string) => e.ejercicios.filter((r) => r.ejercicioId === ejercicioId).flatMap((r) => r.series);

interface ListaEjerciciosProps {
  entrenamiento: Entrenamiento;
  unidad: 'kg' | 'lb';
  pendientes: readonly Operacion[];
  encolar: (op: NuevaOperacion) => void;
  registrarPara: (id: string) => (vaciar: (() => void) | null) => void;
  avisos?: Avisos;
}

/** Ejercicios del entrenamiento con sus series y el botón para añadir otro (en curso o pasado). */
export function ListaEjercicios({ entrenamiento, unidad, pendientes, encolar, registrarPara, avisos }: ListaEjerciciosProps) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const conCola = new Set(pendientes.map((o) => o.recurso));
  const records = useRecordsPrevios(entrenamiento, avisos !== undefined);
  // Etiquetas de récord derivadas de los datos: se recalculan al editar o eliminar series (FR-021).
  const marcas = new Map<string, MetricaSerie[]>();
  for (const [id, previos] of records) for (const [serieId, metricas] of recordsDeSeries(previos, seriesDe(entrenamiento, id))) marcas.set(serieId, metricas);

  /** Al registrar (no al editar) se anuncia si la serie bate el peso máximo o el 1RM; si no, se vacía el anuncio. */
  function alRegistrarSerie(r: EjercicioRealizado, serie: Serie) {
    if (!avisos) return;
    const metricas = recordsDeSeries(records.get(r.ejercicioId), [...seriesDe(entrenamiento, r.ejercicioId), serie]).get(serie.id) ?? [];
    const valor = (m: MetricaSerie) => textoPeso(m === 'pesoMax' ? serie.pesoKg : calcularUnoRm(serie.pesoKg, serie.repeticiones) ?? 0, unidad);
    avisos.anunciar(metricas.length ? t.record.anuncio(r.nombre, metricas.map((m) => ({ nombre: t.record.metrica[m], valor: valor(m) }))) : null);
  }

  /**
   * Récord de volumen al terminar (FR-022, R-11): suma todas las apariciones del ejercicio y solo avisa
   * si supera el récord anterior y lo ya notificado; el valor notificado viaja con «terminado».
   */
  function terminar(r: EjercicioRealizado, excluida?: string) {
    if (!avisos) return;
    const vista = excluida
      ? { ...entrenamiento, ejercicios: entrenamiento.ejercicios.map((x) => ({ ...x, series: x.series.filter((s) => s.id !== excluida) })) }
      : entrenamiento;
    const volumen = volumenSesion(vista, r.ejercicioId);
    const avisa = avisaVolumen(records.get(r.ejercicioId), volumen, volumenNotificado(vista, r.ejercicioId));
    encolar(opTerminarEjercicio(entrenamiento.id, r, avisa ? volumen : undefined));
    avisos.anunciar(avisa ? t.record.anuncio(r.nombre, [{ nombre: t.record.metrica.volumen, valor: textoPeso(volumen, unidad) }]) : null);
  }

  function reabrir(r: EjercicioRealizado) {
    encolar(opReabrirEjercicio(entrenamiento.id, r));
    avisos?.anunciar(null);
  }

  function elegir(ejercicio: Ejercicio) {
    setSelectorAbierto(false);
    encolar(opAnadirEjercicio(entrenamiento.id, {
      id: crypto.randomUUID(), ejercicioId: ejercicio.id, nombre: ejercicio.nombre, posicion: entrenamiento.ejercicios.length + 1,
      nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [],
    }));
  }

  return (
    <>
      {entrenamiento.ejercicios.length ? (
        <ol className="flex flex-col gap-4">
          {entrenamiento.ejercicios.map((r) => (
            <li key={r.id}>
              <TarjetaEjercicio entrenamientoId={entrenamiento.id} realizado={r} unidad={unidad}
                pendiente={pendientes.some((o) => o.recurso === r.id && o.metodo === 'POST')}
                pendientes={conCola} encolar={encolar} registrarEliminacion={registrarPara(r.id)}
                marcas={marcas} onSerieRegistrada={avisos && ((serie) => alRegistrarSerie(r, serie))}
                onTerminar={avisos && ((excluida) => terminar(r, excluida))} onReabrir={() => reabrir(r)} />
            </li>
          ))}
        </ol>
      ) : <p className="text-slate-400">{t.sinEjercicios}</p>}
      <Boton variante="secundario" onClick={() => setSelectorAbierto(true)} className="w-full">
        <IconoMas className="size-5 text-lime-300" />{t.anadirEjercicio}
      </Boton>
      {selectorAbierto && <SelectorEjercicio onElegir={elegir} onCerrar={() => setSelectorAbierto(false)} />}
    </>
  );
}
