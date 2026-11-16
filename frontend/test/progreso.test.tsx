import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { puntosProgreso } from '../src/paginas/progreso/datos';

// T040: progreso por ejercicio (FR-019, FR-020, FR-021, FR-023; US3 escenario 9). Valores del fixture
// manual de T036 (packages/domain/test/fixtures/progreso-referencia.json) servidos por una API en
// memoria con la forma de contracts/api.md.

const PRESS = { id: '10000000-0000-4000-8000-000000000036', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: true, ultimoUso: '2026-11-02T18:30:00Z' };
const DOMINADAS = { id: '10000000-0000-4000-8000-000000000037', nombre: 'Dominadas', grupoMuscular: 'espalda', propio: true, ultimoUso: '2026-11-03T18:30:00Z' };
const SIN_USO = { id: '10000000-0000-4000-8000-000000000038', nombre: 'Remo con barra', grupoMuscular: 'espalda', propio: false, ultimoUso: null };

const SESIONES_PRESS = [
  { entrenamientoId: '20000000-0000-4000-8000-000000000036', fecha: '2024-06-15', pesoMaxKg: 60, volumenKg: 800, unoRmKg: 70 },
  { entrenamientoId: '20000000-0000-4000-8000-000000000037', fecha: '2026-02-01', pesoMaxKg: 70, volumenKg: 830, unoRmKg: 81.6666666667 },
  { entrenamientoId: '20000000-0000-4000-8000-000000000038', fecha: '2026-09-10', pesoMaxKg: 75, volumenKg: 855, unoRmKg: 87.5 },
  { entrenamientoId: '20000000-0000-4000-8000-000000000039', fecha: '2026-11-02', pesoMaxKg: 75, volumenKg: 868, unoRmKg: 87.5 },
];
const PERIODOS: Record<string, string[]> = {
  '1m': ['20000000-0000-4000-8000-000000000039'],
  '3m': ['20000000-0000-4000-8000-000000000038', '20000000-0000-4000-8000-000000000039'],
  '1a': ['20000000-0000-4000-8000-000000000037', '20000000-0000-4000-8000-000000000038', '20000000-0000-4000-8000-000000000039'],
};
const RECORDS_PRESS = {
  sesionesAnteriores: 4,
  pesoMax: { valorKg: 75, fecha: '2026-09-10', entrenamientoId: '20000000-0000-4000-8000-000000000038' },
  unoRm: { valorKg: 87.5, fecha: '2026-09-10', entrenamientoId: '20000000-0000-4000-8000-000000000038' },
  volumenSesion: { valorKg: 868, fecha: '2026-11-02', entrenamientoId: '20000000-0000-4000-8000-000000000039' },
};
const SESION_DOMINADAS = { entrenamientoId: '20000000-0000-4000-8000-000000000040', fecha: '2026-11-03', pesoMaxKg: 0, volumenKg: 0, unoRmKg: null };
const RECORDS_DOMINADAS = {
  sesionesAnteriores: 1,
  pesoMax: { valorKg: 0, fecha: '2026-11-03', entrenamientoId: SESION_DOMINADAS.entrenamientoId },
  unoRm: null,
  volumenSesion: { valorKg: 0, fecha: '2026-11-03', entrenamientoId: SESION_DOMINADAS.entrenamientoId },
};

let unidad: 'kg' | 'lb' = 'kg';
let ejercicios = [PRESS, DOMINADAS, SIN_USO];
/** Sesiones finalizadas por ejercicio («todo»); vacío simula un ejercicio usado solo en curso. */
let sesiones: Record<string, typeof SESIONES_PRESS | (typeof SESION_DOMINADAS)[]> = {};
let peticiones: string[] = [];

const json = (status: number, cuerpo?: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
  status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  unidad = 'kg';
  ejercicios = [PRESS, DOMINADAS, SIN_USO];
  sesiones = { [PRESS.id]: SESIONES_PRESS, [DOMINADAS.id]: [SESION_DOMINADAS] };
  peticiones = [];
  localStorage.clear();
  // jsdom no implementa ResizeObserver, que usa ResponsiveContainer de Recharts.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL) => {
    const url = new URL(String(entrada), 'https://localhost');
    const ruta = url.pathname.replace(/^\/api/, '');
    peticiones.push(`${ruta}${url.search}`);
    if (ruta === '/auth/yo') return json(200, { id: '00000000-0000-4000-8000-000000000400', email: 't040@example.invalid', unidadPeso: unidad, zonaHoraria: 'America/Bogota' });
    if (ruta === '/ejercicios') return json(200, ejercicios);
    const records = /^\/progreso\/([^/]+)\/records$/.exec(ruta);
    if (records) return json(200, records[1] === PRESS.id ? RECORDS_PRESS : records[1] === DOMINADAS.id ? RECORDS_DOMINADAS : { sesionesAnteriores: 0, pesoMax: null, unoRm: null, volumenSesion: null });
    const progreso = /^\/progreso\/([^/]+)$/.exec(ruta);
    if (progreso) {
      const periodo = url.searchParams.get('periodo') ?? 'todo';
      const todas = sesiones[progreso[1]] ?? [];
      const filtradas = periodo === 'todo' ? todas : todas.filter((s) => PERIODOS[periodo]?.includes(s.entrenamientoId));
      return json(200, { ejercicioId: progreso[1], periodo, sesiones: filtradas, suficientesParaTendencia: filtradas.length > 1 });
    }
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function abrir() {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/progreso'] })} /></Proveedores>);
  return userEvent.setup();
}
const tabla = () => screen.findByRole('table', { name: /datos por sesión/i });
const filasDeDatos = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const celdas = (fila: HTMLElement) => within(fila).getAllByRole('cell').map((c) => c.textContent);

describe('T040: progreso por ejercicio', () => {
  it('muestra por defecto el ejercicio usado más recientemente que tenga datos', async () => {
    // Dominadas es el más reciente, pero sin sesiones finalizadas: se pasa al siguiente con datos.
    sesiones[DOMINADAS.id] = [];
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Progreso' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveDisplayValue('Press de banca'));
    expect(within(screen.getByRole('combobox', { name: 'Ejercicio' })).queryByRole('option', { name: 'Remo con barra' })).not.toBeInTheDocument();
  });

  it('presenta en la tabla las sesiones con formato español y «Sin 1RM» cuando no hay 1RM', async () => {
    abrir();
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveDisplayValue('Dominadas'));
    expect(filasDeDatos(await tabla())[0]).toHaveTextContent(/sin 1rm/i);
    await u.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), 'Press de banca');
    await waitFor(async () => expect(filasDeDatos(await tabla())).toHaveLength(4));
    const filas = filasDeDatos(await tabla());
    expect(within(filas[0]).getByRole('rowheader')).toHaveTextContent('15 jun 2024');
    expect(celdas(filas[0])).toEqual(['60', '800', '70']);
    expect(celdas(filas[1])).toEqual(['70', '830', '81,67']);
    expect(celdas(filas[3])).toEqual(['75', '868', '87,5']);
    expect(within(await tabla()).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Fecha', 'Peso máximo (kg)', 'Volumen (kg)', '1RM estimado (kg)']);
  });

  it('filtra por periodo (FR-023) y pide a la API solo ese periodo', async () => {
    sesiones[DOMINADAS.id] = [];
    const u = abrir();
    await waitFor(async () => expect(filasDeDatos(await tabla())).toHaveLength(4));
    const periodo = screen.getByRole('combobox', { name: 'Periodo' });
    expect(periodo).toHaveDisplayValue('Todo');
    for (const [valor, filas] of [['3m', 2], ['1m', 1], ['1a', 3], ['todo', 4]] as const) {
      await u.selectOptions(periodo, valor);
      await waitFor(async () => expect(filasDeDatos(await tabla())).toHaveLength(filas));
      expect(peticiones).toContain(`/progreso/${PRESS.id}?periodo=${valor}`);
    }
  });

  it('con una sola sesión avisa de que aún no hay tendencia', async () => {
    abrir();
    expect(await screen.findByText(/una sola sesión/i)).toBeInTheDocument();
  });

  it('distingue un periodo sin sesiones de no tener entrenamientos', async () => {
    sesiones[DOMINADAS.id] = [];
    const u = abrir();
    await waitFor(async () => expect(filasDeDatos(await tabla())).toHaveLength(4));
    sesiones[PRESS.id] = [];
    await u.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '1m');
    expect(await screen.findByText('No hay sesiones de Press de banca en este periodo.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sin entrenamientos finalizados muestra un estado vacío que lleva a Entrenar', async () => {
    ejercicios = [SIN_USO];
    abrir();
    expect(await screen.findByText('Aún no hay entrenamientos con los que medir tu progreso.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Entrenar' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('combobox', { name: 'Ejercicio' })).not.toBeInTheDocument();
  });

  it('expone el gráfico con nombre accesible y lo acompaña de la tabla equivalente', async () => {
    sesiones[DOMINADAS.id] = [];
    abrir();
    const grafico = await screen.findByRole('img', { name: /gráfico de progreso de press de banca/i });
    expect(grafico).toHaveAccessibleName(/4 sesiones/);
    expect(await tabla()).toBeInTheDocument();
  });

  it('muestra los récords personales con su fecha y «Sin datos» si una métrica no tiene valor', async () => {
    const u = abrir();
    const records = await screen.findByRole('region', { name: 'Récords personales' });
    await waitFor(() => expect(records).toHaveTextContent(/1RM estimado.*Sin datos/));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), 'Press de banca');
    await waitFor(() => expect(records).toHaveTextContent(/Peso máximo.*75 kg.*10 sept 2026/));
    expect(records).toHaveTextContent(/1RM estimado.*87,5 kg.*10 sept 2026/);
    expect(records).toHaveTextContent(/Mejor volumen.*868 kg.*2 nov 2026/);
  });

  it('en lb convierte los valores al mostrarlos sin cambiar los datos', async () => {
    unidad = 'lb';
    sesiones[DOMINADAS.id] = [];
    abrir();
    await waitFor(async () => expect(filasDeDatos(await tabla())).toHaveLength(4));
    expect(celdas(filasDeDatos(await tabla())[0])).toEqual(['132,28', '1763,7', '154,32']);
    expect(within(await tabla()).getAllByRole('columnheader')[1]).toHaveTextContent('Peso máximo (lb)');
  });
});

describe('T040: una sola transformación alimenta el gráfico y la tabla', () => {
  it('conserva los valores originales y solo convierte la unidad', () => {
    expect(puntosProgreso(SESIONES_PRESS, 'kg').map((p) => [p.fecha, p.pesoMax, p.volumen, p.unoRm])).toEqual([
      ['2024-06-15', 60, 800, 70], ['2026-02-01', 70, 830, 81.6666666667], ['2026-09-10', 75, 855, 87.5], ['2026-11-02', 75, 868, 87.5],
    ]);
    expect(puntosProgreso([SESION_DOMINADAS], 'kg')[0].unoRm).toBeNull();
    expect(puntosProgreso(SESIONES_PRESS, 'lb')[0].pesoMax).toBeCloseTo(132.277, 3);
  });
});
