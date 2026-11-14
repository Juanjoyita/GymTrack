import { describe, expect, it } from 'vitest';
import { GRUPOS_MUSCULARES, esquemaActualizacionEjercicio, esquemaEjercicio } from '../src/validacion/ejercicio';

// Reglas de data-model «ejercicio» y del contrato POST/PATCH /ejercicios.
describe('validación de ejercicios', () => {
  it('expone los 11 grupos musculares aprobados', () => {
    expect(GRUPOS_MUSCULARES).toEqual(['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'antebrazos', 'cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'abdomen']);
  });

  it('acepta nombre de 1 a 80 caracteres tras recortar y devuelve el nombre recortado', () => {
    expect(esquemaEjercicio.parse({ nombre: '  Press Hammer  ', grupoMuscular: 'pecho' })).toEqual({ nombre: 'Press Hammer', grupoMuscular: 'pecho' });
    expect(esquemaEjercicio.safeParse({ nombre: 'x', grupoMuscular: 'abdomen' }).success).toBe(true);
    expect(esquemaEjercicio.safeParse({ nombre: ` ${'y'.repeat(80)} `, grupoMuscular: 'abdomen' }).success).toBe(true);
  });

  it.each([
    ['vacío', { nombre: '', grupoMuscular: 'pecho' }],
    ['solo espacios', { nombre: '   ', grupoMuscular: 'pecho' }],
    ['81 caracteres', { nombre: 'x'.repeat(81), grupoMuscular: 'pecho' }],
    ['sin nombre', { grupoMuscular: 'pecho' }],
    ['grupo fuera de la lista', { nombre: 'Cardio', grupoMuscular: 'cardio' }],
    ['sin grupo', { nombre: 'Sin grupo' }],
  ])('rechaza ejercicio con %s', (_caso, entrada) => {
    expect(esquemaEjercicio.safeParse(entrada).success).toBe(false);
  });

  it('la actualización admite nombre y/o grupo con las mismas reglas', () => {
    expect(esquemaActualizacionEjercicio.parse({ nombre: ' Nuevo ' })).toEqual({ nombre: 'Nuevo' });
    expect(esquemaActualizacionEjercicio.parse({ grupoMuscular: 'hombros' })).toEqual({ grupoMuscular: 'hombros' });
    for (const entrada of [{}, { nombre: ' ' }, { grupoMuscular: 'cardio' }, { nombre: 'x'.repeat(81) }]) {
      expect(esquemaActualizacionEjercicio.safeParse(entrada).success).toBe(false);
    }
  });
});
