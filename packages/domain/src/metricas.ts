export interface SerieConPesoYRepeticiones { pesoKg: number; repeticiones: number }
export function calcularVolumen(series: readonly SerieConPesoYRepeticiones[]): number {
  return series.reduce((total, serie) => total + serie.pesoKg * serie.repeticiones, 0);
}
