import { describe, expect, it } from 'vitest';
import { kgALb, lbAKg, redondearPesoParaMostrar } from '../src/unidades';

describe('conversiones de peso', () => {
  it.each([
    [0, 0],
    [500, 1102.3113109244],
  ])('convierte %s kg a %s lb', (kg, lb) => {
    expect(kgALb(kg)).toBeCloseTo(lb, 8);
  });

  it.each([
    [0, 0],
    [1102.3113109244, 500],
  ])('convierte %s lb a %s kg', (lb, kg) => {
    expect(lbAKg(lb)).toBeCloseTo(kg, 8);
  });

  it('redondea solo el valor mostrado a dos decimales', () => {
    const pesoOriginal = 12.345;
    expect(redondearPesoParaMostrar(pesoOriginal)).toBe(12.35);
    expect(pesoOriginal).toBe(12.345);
  });
});
