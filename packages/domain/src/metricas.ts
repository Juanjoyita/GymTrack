export interface SerieConPesoYRepeticiones { pesoKg: number; repeticiones: number }

export interface SesionConSeries {
  entrenamientoId: string;
  fecha: string;
  series: readonly SerieConPesoYRepeticiones[];
}

export interface MetricaSesion {
  entrenamientoId: string;
  fecha: string;
  pesoMaxKg: number;
  volumenKg: number;
  unoRmKg: number | null;
}

export function calcularVolumen(series: readonly SerieConPesoYRepeticiones[]): number {
  return series.reduce((total, serie) => total + serie.pesoKg * serie.repeticiones, 0);
}

/** Estima 1RM con Epley solo para series de 1 a 12 repeticiones y peso positivo. */
export function calcularUnoRm(pesoKg: number, repeticiones: number): number | null {
  if (pesoKg <= 0 || repeticiones < 1 || repeticiones > 12) return null;
  if (repeticiones === 1) return pesoKg;
  return pesoKg * (1 + repeticiones / 30);
}

export function calcularMetricasSesion(series: readonly SerieConPesoYRepeticiones[]) {
  const unoRm = series
    .map(({ pesoKg, repeticiones }) => calcularUnoRm(pesoKg, repeticiones))
    .filter((valor): valor is number => valor !== null);
  return {
    pesoMaxKg: Math.max(0, ...series.map(({ pesoKg }) => pesoKg)),
    volumenKg: calcularVolumen(series),
    unoRmKg: unoRm.length ? Math.max(...unoRm) : null,
  };
}

/** Agrega apariciones repetidas del mismo ejercicio en un entrenamiento antes de calcular. */
export function calcularMetricasProgreso(sesiones: readonly SesionConSeries[]): MetricaSesion[] {
  const agrupadas = new Map<string, { entrenamientoId: string; fecha: string; series: SerieConPesoYRepeticiones[] }>();
  for (const sesion of sesiones) {
    let grupo = agrupadas.get(sesion.entrenamientoId);
    if (!grupo) {
      grupo = { entrenamientoId: sesion.entrenamientoId, fecha: sesion.fecha, series: [] };
      agrupadas.set(sesion.entrenamientoId, grupo);
    }
    grupo.series.push(...sesion.series);
  }
  return [...agrupadas.values()]
    .map(({ entrenamientoId, fecha, series }) => ({
      entrenamientoId, fecha, ...calcularMetricasSesion(series),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
