import { calcularUnoRm, calcularVolumen } from '@gymtrack/domain';
import type { Entrenamiento, Serie } from '../../api/entrenamientos';
import type { RecordsPersonales } from '../../api/progreso';

// Avisos de récord durante el entrenamiento (FR-021, FR-022, R-11). Los récords previos llegan de
// GET /progreso/:id/records excluyendo el entrenamiento actual; la comparación es local e inmediata.

export type MetricaSerie = 'pesoMax' | 'unoRm';

/** Sin récords cargados o en la primera sesión del ejercicio no hay con qué comparar: nunca se avisa. */
const comparables = (records: RecordsPersonales | undefined): records is RecordsPersonales =>
  records !== undefined && records.sesionesAnteriores > 0;

/**
 * Métricas en las que cada serie establece un récord, en orden de registro. Una serie es récord si
 * supera estrictamente el récord anterior y las series previas de la sesión (un récord de la sesión
 * pasa a ser el valor que batir). Una métrica sin récord anterior (null) no genera avisos.
 */
export function recordsDeSeries(records: RecordsPersonales | undefined, series: readonly Serie[]): Map<string, MetricaSerie[]> {
  const resultado = new Map<string, MetricaSerie[]>();
  if (!comparables(records)) return resultado;
  let peso = records.pesoMax?.valorKg ?? null;
  let unoRm = records.unoRm?.valorKg ?? null;
  for (const s of [...series].sort((a, b) => a.registradaEn.localeCompare(b.registradaEn))) {
    const metricas: MetricaSerie[] = [];
    if (peso !== null && s.pesoKg > peso) { metricas.push('pesoMax'); peso = s.pesoKg; }
    const estimado = calcularUnoRm(s.pesoKg, s.repeticiones);
    if (unoRm !== null && estimado !== null && estimado > unoRm) { metricas.push('unoRm'); unoRm = estimado; }
    if (metricas.length) resultado.set(s.id, metricas);
  }
  return resultado;
}

const apariciones = (e: Entrenamiento, ejercicioId: string) => e.ejercicios.filter((r) => r.ejercicioId === ejercicioId);

/** Volumen del ejercicio en la sesión: suma de todas sus apariciones. */
export const volumenSesion = (e: Entrenamiento, ejercicioId: string) =>
  calcularVolumen(apariciones(e, ejercicioId).flatMap((r) => r.series));

/** Mayor volumen ya notificado del ejercicio en la sesión, o null si aún no se notificó ninguno. */
export function volumenNotificado(e: Entrenamiento, ejercicioId: string): number | null {
  const valores = apariciones(e, ejercicioId).map((r) => r.volumenNotificadoKg).filter((v): v is number => v !== null);
  return valores.length ? Math.max(...valores) : null;
}

/** Récord de volumen: supera el récord anterior y lo ya notificado en esta sesión (no se repiten avisos). */
export function avisaVolumen(records: RecordsPersonales | undefined, volumenKg: number, notificadoKg: number | null) {
  if (!comparables(records) || records.volumenSesion === null) return false;
  return volumenKg > records.volumenSesion.valorKg && (notificadoKg === null || volumenKg > notificadoKg);
}

/** Récords logrados en la sesión por un ejercicio, para el resumen final. */
export interface RecordSesion {
  ejercicioId: string;
  nombre: string;
  pesoMaxKg?: number;
  unoRmKg?: number;
  volumenKg?: number;
  /** El récord de volumen se detecta al finalizar (ejercicio sin terminar): es un aviso nuevo. */
  volumenNuevo: boolean;
}

/**
 * Récords de la sesión al finalizar el entrenamiento (FR-022, R-11). Los ejercicios que no se
 * terminaron con el botón comprueban aquí su volumen; los ya notificados aparecen sin repetir el aviso.
 */
export function recordsDeSesion(e: Entrenamiento, previos: ReadonlyMap<string, RecordsPersonales | undefined>): RecordSesion[] {
  const resultado: RecordSesion[] = [];
  for (const ejercicioId of new Set(e.ejercicios.map((r) => r.ejercicioId))) {
    const records = previos.get(ejercicioId);
    if (!comparables(records)) continue;
    const series = apariciones(e, ejercicioId).flatMap((r) => r.series);
    const marcas = recordsDeSeries(records, series);
    const con = (m: MetricaSerie) => series.filter((s) => marcas.get(s.id)?.includes(m));
    const pesos = con('pesoMax').map((s) => s.pesoKg);
    const unoRms = con('unoRm').map((s) => calcularUnoRm(s.pesoKg, s.repeticiones) ?? 0);
    const notificado = volumenNotificado(e, ejercicioId);
    const sinTerminar = apariciones(e, ejercicioId).some((r) => r.terminadoEn === null);
    const volumen = volumenSesion(e, ejercicioId);
    const volumenNuevo = sinTerminar && avisaVolumen(records, volumen, notificado);
    const volumenKg = volumenNuevo ? volumen : notificado ?? undefined;
    if (!pesos.length && !unoRms.length && volumenKg === undefined) continue;
    resultado.push({
      ejercicioId, nombre: apariciones(e, ejercicioId)[0].nombre,
      ...(pesos.length ? { pesoMaxKg: Math.max(...pesos) } : {}),
      ...(unoRms.length ? { unoRmKg: Math.max(...unoRms) } : {}),
      ...(volumenKg !== undefined ? { volumenKg } : {}),
      volumenNuevo,
    });
  }
  return resultado;
}
