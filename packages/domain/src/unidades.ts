const LIBRAS_POR_KILOGRAMO = 2.2046226218487757;
export function kgALb(kg: number): number { return kg * LIBRAS_POR_KILOGRAMO; }
export function lbAKg(lb: number): number { return lb / LIBRAS_POR_KILOGRAMO; }
export function redondearPesoParaMostrar(peso: number): number {
  return Math.round((peso + Number.EPSILON) * 100) / 100;
}
