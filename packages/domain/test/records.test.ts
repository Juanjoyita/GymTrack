import { describe, expect, it } from 'vitest';
import { detectarRecordsPersonales } from '../src/records';
import { calcularMetricasProgreso, type SesionConSeries } from '../src/metricas';
import fixture from './fixtures/progreso-referencia.json';

describe('récords personales derivados', () => {
  it('coincide con los récords y fechas del fixture, reteniendo la primera fecha en empate', () => {
    const sesiones: SesionConSeries[] = fixture.sesiones
      .filter((sesion) => sesion.ejercicioId === fixture.ejercicios[0].id)
      .map((sesion) => ({ entrenamientoId: sesion.id, fecha: sesion.fecha, series: sesion.series }));
    expect(detectarRecordsPersonales(calcularMetricasProgreso(sesiones))).toEqual(fixture.records.pressDeBanca);
  });

  it('no crea métricas de 1RM con series de peso cero o más de 12 repeticiones', () => {
    const sesiones: SesionConSeries[] = [{
      entrenamientoId: fixture.sesiones[4].id,
      fecha: fixture.sesiones[4].fecha,
      series: fixture.sesiones[4].series,
    }];
    const records = detectarRecordsPersonales(calcularMetricasProgreso(sesiones));
    expect(records).toEqual(fixture.records.dominadas);
  });

  it('no devuelve aviso de récord sin sesión previa ni al igualar el máximo', () => {
    const primera = detectarRecordsPersonales([]);
    expect(primera).toEqual({ sesionesAnteriores: 0, pesoMax: null, unoRm: null, volumenSesion: null });

    const empate = detectarRecordsPersonales([
      { entrenamientoId: 'empate', fecha: '2026-02-01', pesoMaxKg: 80, volumenKg: 500, unoRmKg: 90 },
      { entrenamientoId: 'primera', fecha: '2026-01-01', pesoMaxKg: 80, volumenKg: 500, unoRmKg: 90 },
    ]);
    expect(empate.pesoMax?.entrenamientoId).toBe('primera');
    expect(empate.unoRm?.entrenamientoId).toBe('primera');
    expect(empate.volumenSesion?.entrenamientoId).toBe('primera');
  });

  it('recalcula récords al cambiar o eliminar una sesión', () => {
    const inicial = [
      { entrenamientoId: 'a', fecha: '2026-01-01', pesoMaxKg: 50, volumenKg: 100, unoRmKg: 60 },
      { entrenamientoId: 'b', fecha: '2026-02-01', pesoMaxKg: 70, volumenKg: 200, unoRmKg: 80 },
    ];
    expect(detectarRecordsPersonales(inicial).pesoMax?.entrenamientoId).toBe('b');
    expect(detectarRecordsPersonales([inicial[0], { ...inicial[1], pesoMaxKg: 40 }]).pesoMax?.entrenamientoId).toBe('a');
    expect(detectarRecordsPersonales(inicial.slice(0, 1)).pesoMax?.entrenamientoId).toBe('a');
  });
});
