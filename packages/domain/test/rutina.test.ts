import { describe, expect, it } from 'vitest';
import { esquemaActualizacionRutina, esquemaRutina } from '../src/validacion/rutina';

const ejercicioA = '10000000-0000-4000-8000-000000000001';
const ejercicioB = '10000000-0000-4000-8000-000000000002';

describe('validación compartida de rutinas', () => {
  it('recorta nombre y conserva el orden de ejercicios enviado', () => {
    expect(esquemaRutina.parse({
      nombre: '  Fuerza  ', diaSemana: 1, ejercicioIds: [ejercicioB, ejercicioA],
    })).toEqual({ nombre: 'Fuerza', diaSemana: 1, ejercicioIds: [ejercicioB, ejercicioA] });
  });

  it.each([1, 2, 3, 4, 5, 6, 7])('acepta el día ISO %i', (diaSemana) => {
    expect(esquemaRutina.safeParse({ nombre: 'Rutina', diaSemana, ejercicioIds: [ejercicioA] }).success).toBe(true);
  });

  it.each([
    ['día menor a 1', { nombre: 'Rutina', diaSemana: 0, ejercicioIds: [ejercicioA] }],
    ['día mayor a 7', { nombre: 'Rutina', diaSemana: 8, ejercicioIds: [ejercicioA] }],
    ['día fraccionario', { nombre: 'Rutina', diaSemana: 1.5, ejercicioIds: [ejercicioA] }],
    ['nombre vacío', { nombre: '   ', diaSemana: 1, ejercicioIds: [ejercicioA] }],
    ['nombre demasiado largo', { nombre: 'x'.repeat(81), diaSemana: 1, ejercicioIds: [ejercicioA] }],
    ['lista vacía', { nombre: 'Rutina', diaSemana: 1, ejercicioIds: [] }],
    ['identificador inválido', { nombre: 'Rutina', diaSemana: 1, ejercicioIds: ['no-es-uuid'] }],
  ])('rechaza %s', (_caso, entrada) => {
    expect(esquemaRutina.safeParse(entrada).success).toBe(false);
  });

  it('valida sustitución completa, mantiene orden y exige un cambio además de versión', () => {
    expect(esquemaActualizacionRutina.parse({
      ejercicioIds: [ejercicioB, ejercicioA], version: 3,
    })).toEqual({ ejercicioIds: [ejercicioB, ejercicioA], version: 3 });
    expect(esquemaActualizacionRutina.parse({ nombre: ' Nueva ', version: 1 }))
      .toEqual({ nombre: 'Nueva', version: 1 });
    expect(esquemaActualizacionRutina.safeParse({ ejercicioIds: [], version: 1 }).success).toBe(false);
    expect(esquemaActualizacionRutina.safeParse({ version: 1 }).success).toBe(false);
  });
});
