import { describe, expect, it } from 'vitest';
import { calcularVolumen } from '../src/metricas';

describe('volumen de carga externa', () => {
  it('suma peso por repeticiones de todas las series', () => {
    expect(calcularVolumen([
      { pesoKg: 60, repeticiones: 8 },
      { pesoKg: 62.5, repeticiones: 6 },
    ])).toBe(855);
  });

  it('el peso corporal aporta volumen externo cero', () => {
    expect(calcularVolumen([{ pesoKg: 0, repeticiones: 12 }])).toBe(0);
  });

  it('devuelve cero cuando no hay series', () => {
    expect(calcularVolumen([])).toBe(0);
  });
});
