import { describe, expect, it } from 'vitest';
import { calcularMetricasSesion, calcularUnoRm, calcularMetricasProgreso } from '../src/metricas';
import type { SesionConSeries } from '../src/metricas';
import fixture from './fixtures/progreso-referencia.json';

describe('métricas de progreso', () => {
  it.each([
    [100, 1, 100],
    [100, 2, 106.6666666667],
    [100, 12, 140],
    [100, 13, null],
    [0, 8, null],
  ])('calcula Epley para peso %s y %s repeticiones', (peso, repeticiones, esperado) => {
    const calculado = calcularUnoRm(peso, repeticiones);
    if (esperado === null) expect(calculado).toBeNull();
    else expect(calculado).toBeCloseTo(esperado, 8);
  });

  it('devuelve null cuando no hay series válidas y suma peso cero en volumen', () => {
    expect(calcularMetricasSesion([{ pesoKg: 0, repeticiones: 8 }, { pesoKg: 20, repeticiones: 13 }]))
      .toEqual({ pesoMaxKg: 20, volumenKg: 260, unoRmKg: null });
  });

  it('coincide con los cálculos manuales del fixture de referencia', () => {
    const sesiones: SesionConSeries[] = fixture.sesiones
      .filter((sesion) => sesion.ejercicioId === fixture.ejercicios[0].id)
      .map((sesion) => ({
        entrenamientoId: sesion.id,
        fecha: sesion.fecha,
        series: sesion.series,
      }));
    const metricas = calcularMetricasProgreso(sesiones);
    expect(metricas).toHaveLength(4);
    metricas.forEach((metrica, index) => {
      const sesion = fixture.sesiones[index];
      expect(metrica).toMatchObject({ entrenamientoId: sesion.id, fecha: sesion.fecha });
      expect(metrica.pesoMaxKg).toBe(sesion.esperado.pesoMaxKg);
      expect(metrica.volumenKg).toBe(sesion.esperado.volumenKg);
      if (sesion.esperado.unoRmKg === null) expect(metrica.unoRmKg).toBeNull();
      else expect(metrica.unoRmKg).toBeCloseTo(sesion.esperado.unoRmKg, 8);
    });
  });

  it('agrega las apariciones repetidas de un ejercicio en una sesión', () => {
    const metricas = calcularMetricasProgreso([
      { entrenamientoId: 'sesion', fecha: '2026-11-01', series: [{ pesoKg: 20, repeticiones: 5 }] },
      { entrenamientoId: 'sesion', fecha: '2026-11-01', series: [{ pesoKg: 30, repeticiones: 3 }] },
    ]);
    expect(metricas).toEqual([{
      entrenamientoId: 'sesion', fecha: '2026-11-01', pesoMaxKg: 30, volumenKg: 190, unoRmKg: 33,
    }]);
  });

  it('refleja al recalcular una edición o eliminación', () => {
    const original: SesionConSeries[] = [
      { entrenamientoId: 'a', fecha: '2026-01-01', series: [{ pesoKg: 50, repeticiones: 5 }] },
      { entrenamientoId: 'b', fecha: '2026-02-01', series: [{ pesoKg: 60, repeticiones: 5 }] },
    ];
    expect(calcularMetricasProgreso(original)[1].pesoMaxKg).toBe(60);
    const editada = [...original];
    editada[1] = { ...editada[1], series: [{ pesoKg: 40, repeticiones: 5 }] };
    expect(calcularMetricasProgreso(editada)[1].pesoMaxKg).toBe(40);
    expect(calcularMetricasProgreso(editada.slice(0, 1))).toHaveLength(1);
  });
});
