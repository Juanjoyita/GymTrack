import { describe, expect, it } from 'vitest';
import { esquemaSerie } from '../src/validacion/serie';

describe('validación base de series', () => {
  it.each([1, 100])('acepta %i repeticiones', (repeticiones) => {
    expect(esquemaSerie.safeParse({ repeticiones, pesoKg: 0 }).success).toBe(true);
  });

  it.each([
    0,
    101,
    1.5,
    -1,
  ])('rechaza %s repeticiones', (repeticiones) => {
    expect(esquemaSerie.safeParse({ repeticiones, pesoKg: 20 }).success).toBe(false);
  });

  it.each([-0.01, 500.01, 1.234])('rechaza peso inválido %s kg', (pesoKg) => {
    expect(esquemaSerie.safeParse({ repeticiones: 8, pesoKg }).success).toBe(false);
  });
});
