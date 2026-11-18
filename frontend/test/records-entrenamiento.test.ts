import { describe, expect, it } from 'vitest';
import type { EjercicioRealizado, Entrenamiento, Serie } from '../src/api/entrenamientos';
import type { RecordsPersonales } from '../src/api/progreso';
import { avisaVolumen, recordsDeSeries, recordsDeSesion, volumenNotificado, volumenSesion } from '../src/paginas/entrenamiento/records';
import { aplicarOperacion, aplicarVigente, opReabrirEjercicio, opTerminarEjercicio } from '../src/paginas/entrenamiento/operaciones';
import type { Conflicto, Operacion } from '../src/sincronizacion/cola';
import fixture from '../../packages/domain/test/fixtures/progreso-referencia.json';

// T041: reglas de avisos durante el entrenamiento (FR-021, FR-022, R-11) con los escenarios del
// fixture manual de T036 (escenariosAvisos) y los récords esperados de cada ejercicio.

const PRESS = fixture.records.pressDeBanca as RecordsPersonales;
const DOMINADAS = fixture.records.dominadas as RecordsPersonales;
const PRIMERA: RecordsPersonales = { sesionesAnteriores: 0, pesoMax: null, unoRm: null, volumenSesion: null };
const escenarios = fixture.escenariosAvisos;

const serie = (n: number, s: { pesoKg: number; repeticiones: number }): Serie => ({
  id: `s${n}`, orden: n, repeticiones: s.repeticiones, pesoKg: s.pesoKg, registradaEn: `2026-11-16T18:0${n}:00Z`, version: 1,
});
const deSeries = (lista: { pesoKg: number; repeticiones: number }[]) => lista.map((s, i) => serie(i + 1, s));
const metricas = (records: RecordsPersonales | undefined, series: Serie[]) => Object.fromEntries(recordsDeSeries(records, series));

const realizado = (id: string, ejercicioId: string, series: Serie[], extra: Partial<EjercicioRealizado> = {}): EjercicioRealizado => ({
  id, ejercicioId, nombre: 'Press de banca', posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series, ...extra,
});
const entrenamiento = (ejercicios: EjercicioRealizado[]) => ({ ejercicios }) as Entrenamiento;

describe('T041: récords de peso máximo y 1RM por serie', () => {
  it('no marca nada en la primera sesión del ejercicio, aunque las series crezcan', () => {
    expect(metricas(PRIMERA, deSeries(escenarios.primeraSesion.series))).toEqual({});
  });

  it('no marca nada sin récords cargados (sin datos fiables para comparar)', () => {
    expect(metricas(undefined, deSeries(escenarios.superarPeso.series))).toEqual({});
  });

  it('igualar un récord no es un récord', () => {
    expect(metricas(PRESS, deSeries(escenarios.igualarRecord.series))).toEqual({});
  });

  it('superar el peso máximo marca peso máximo y 1RM', () => {
    expect(metricas(PRESS, deSeries(escenarios.superarPeso.series))).toEqual({ s1: ['pesoMax', 'unoRm'] });
  });

  it('sin 1RM anterior, el primer 1RM es la referencia y solo avisa el peso máximo', () => {
    expect(metricas(DOMINADAS, deSeries([escenarios.primeraMetricaUnoRm.serieNueva]))).toEqual({ s1: ['pesoMax'] });
  });

  it('una serie que supera a otra que ya era récord en la sesión es un récord nuevo; igualarla no', () => {
    const series = deSeries([{ pesoKg: 76, repeticiones: 5 }, { pesoKg: 76, repeticiones: 5 }, { pesoKg: 77, repeticiones: 2 }]);
    // 77 × 2 → 1RM 82,13: no supera los 88,67 de 76 × 5.
    expect(metricas(PRESS, series)).toEqual({ s1: ['pesoMax', 'unoRm'], s3: ['pesoMax'] });
  });

  it('el 1RM solo cuenta en series válidas (peso positivo y hasta 12 repeticiones)', () => {
    expect(metricas(PRESS, deSeries([{ pesoKg: 70, repeticiones: 15 }, { pesoKg: 70, repeticiones: 8 }]))).toEqual({ s2: ['unoRm'] });
  });
});

describe('T041: récord de volumen al terminar o finalizar', () => {
  const volumen = escenarios.volumen;
  const ID = fixture.ejercicios[0].id;

  it('suma todas las apariciones del ejercicio en la sesión', () => {
    const e = entrenamiento([
      realizado('a', ID, deSeries([volumen.series[0]])),
      realizado('b', 'otro', deSeries([{ pesoKg: 100, repeticiones: 5 }])),
      realizado('c', ID, deSeries([volumen.series[1]])),
    ]);
    expect(volumenSesion(e, ID)).toBe(volumen.volumenKg);
  });

  it('toma el mayor volumen notificado de sus apariciones', () => {
    const e = entrenamiento([realizado('a', ID, [], { volumenNotificadoKg: 870 }), realizado('c', ID, [], { volumenNotificadoKg: 895 })]);
    expect(volumenNotificado(e, ID)).toBe(895);
    expect(volumenNotificado(entrenamiento([realizado('a', ID, [])]), ID)).toBeNull();
  });

  it('avisa al superar el récord anterior y no al igualarlo', () => {
    expect(avisaVolumen(PRESS, volumen.volumenKg, null)).toBe(volumen.avisoAlTerminar);
    expect(avisaVolumen(PRESS, 868, null)).toBe(false);
  });

  it('al reabrir solo avisa si supera también lo ya notificado', () => {
    expect(avisaVolumen(PRESS, volumen.reabrirSinCambios.volumenKg, volumen.volumenKg)).toBe(volumen.reabrirSinCambios.aviso);
    expect(avisaVolumen(PRESS, volumen.reabrirConSerie.volumenKg, volumen.volumenKg)).toBe(volumen.reabrirConSerie.aviso);
  });

  it('no avisa en la primera sesión, sin récords cargados ni con un volumen anterior de 0 superado', () => {
    expect(avisaVolumen(PRIMERA, 5000, null)).toBe(false);
    expect(avisaVolumen(undefined, 5000, null)).toBe(false);
    // Dominadas: el volumen anterior es 0 y es un récord válido; superarlo sí es récord.
    expect(avisaVolumen(DOMINADAS, 400, null)).toBe(true);
  });
});

describe('T041: terminar y reabrir un ejercicio (contrato PATCH /entrenamientos/:id/ejercicios/:erId)', () => {
  const r = realizado('er1', 'ej1', [], { version: 3 });
  const e = { id: 'en1', ejercicios: [r] } as unknown as Entrenamiento;
  const comoOperacion = (op: ReturnType<typeof opTerminarEjercicio>) => ({ ...op, id: 'op', creadaEn: '' }) as Operacion;

  it('terminar envía terminado con la versión del ejercicio y, si avisa, el volumen notificado en la misma petición', () => {
    const op = opTerminarEjercicio('en1', r, 895);
    expect(op).toMatchObject({ metodo: 'PATCH', ruta: '/entrenamientos/en1/ejercicios/er1', recurso: 'er1', version: 3, dependeDe: ['er1'] });
    expect(op.cuerpo).toEqual({ terminado: true, volumenNotificadoKg: 895, version: 3 });
    expect(opTerminarEjercicio('en1', r).cuerpo).toEqual({ terminado: true, version: 3 });
  });

  it('reabrir envía terminado: false y conserva el volumen notificado', () => {
    expect(opReabrirEjercicio('en1', { ...r, terminadoEn: '2026-11-16T18:30:00Z', volumenNotificadoKg: 895 }).cuerpo).toEqual({ terminado: false, version: 3 });
  });

  it('pendiente: se ve terminado al momento; confirmado: adopta los valores y la versión del servidor', () => {
    const pendiente = aplicarOperacion(e, opTerminarEjercicio('en1', r, 895))!.ejercicios[0];
    expect(pendiente.terminadoEn).not.toBeNull();
    expect(pendiente.volumenNotificadoKg).toBe(895);
    const servidor = { ...r, terminadoEn: '2026-11-16T18:30:00Z', volumenNotificadoKg: 895, version: 4 };
    expect(aplicarOperacion(e, opTerminarEjercicio('en1', r, 895), servidor)!.ejercicios[0]).toMatchObject({ terminadoEn: '2026-11-16T18:30:00Z', volumenNotificadoKg: 895, version: 4 });
    const terminado = { ...e, ejercicios: [{ ...r, terminadoEn: '2026-11-16T18:30:00Z', volumenNotificadoKg: 895 }] } as Entrenamiento;
    expect(aplicarOperacion(terminado, opReabrirEjercicio('en1', terminado.ejercicios[0]))!.ejercicios[0]).toMatchObject({ terminadoEn: null, volumenNotificadoKg: 895 });
  });

  it('ante un conflicto de versión muestra el estado vigente del servidor', () => {
    const vigente = { ...r, terminadoEn: null, volumenNotificadoKg: 870, nota: 'Otra', version: 5 };
    const conflicto = { id: 'c', motivo: 'CONFLICTO_VERSION', actual: vigente, operacion: comoOperacion(opTerminarEjercicio('en1', r, 895)) } as unknown as Conflicto;
    expect(aplicarVigente(e, conflicto)!.ejercicios[0]).toMatchObject({ terminadoEn: null, volumenNotificadoKg: 870, nota: 'Otra', version: 5 });
  });
});

describe('T041: récords de la sesión al finalizar el entrenamiento', () => {
  const ID = fixture.ejercicios[0].id;
  const previos = new Map([[ID, PRESS]]);
  const volumen = deSeries(escenarios.volumen.series);

  it('comprueba el volumen de los ejercicios sin terminar y lo marca como nuevo aviso', () => {
    const e = entrenamiento([realizado('a', ID, volumen)]);
    expect(recordsDeSesion(e, previos)).toEqual([{ ejercicioId: ID, nombre: 'Press de banca', volumenKg: 895, volumenNuevo: true }]);
  });

  it('un ejercicio terminado con el volumen ya notificado aparece en el resumen sin nuevo aviso', () => {
    const e = entrenamiento([realizado('a', ID, volumen, { terminadoEn: '2026-11-16T18:30:00Z', volumenNotificadoKg: 895 })]);
    expect(recordsDeSesion(e, previos)).toEqual([{ ejercicioId: ID, nombre: 'Press de banca', volumenKg: 895, volumenNuevo: false }]);
  });

  it('reabierto sin superar lo notificado: no avisa otra vez al finalizar', () => {
    const e = entrenamiento([realizado('a', ID, volumen, { volumenNotificadoKg: 895 })]);
    expect(recordsDeSesion(e, previos)).toEqual([{ ejercicioId: ID, nombre: 'Press de banca', volumenKg: 895, volumenNuevo: false }]);
  });

  it('incluye los mejores récords de peso máximo y 1RM de la sesión', () => {
    const e = entrenamiento([realizado('a', ID, deSeries([{ pesoKg: 76, repeticiones: 5 }, { pesoKg: 77, repeticiones: 2 }]))]);
    expect(recordsDeSesion(e, previos)).toEqual([{ ejercicioId: ID, nombre: 'Press de banca', pesoMaxKg: 77, unoRmKg: 76 * (1 + 5 / 30), volumenNuevo: false }]);
  });

  it('sin récords que destacar (primera sesión o sin récords cargados) no devuelve nada', () => {
    const e = entrenamiento([realizado('a', ID, volumen)]);
    expect(recordsDeSesion(e, new Map([[ID, PRIMERA]]))).toEqual([]);
    expect(recordsDeSesion(e, new Map())).toEqual([]);
  });
});
