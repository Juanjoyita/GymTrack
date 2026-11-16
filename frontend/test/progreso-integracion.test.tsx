import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alEscribir, solicitar } from '../src/api/cliente';
import { actualizarProgreso, afectaAlProgreso, clavesProgreso } from '../src/api/progreso';
import { Proveedores, crearClienteConsultas } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { PRESS, instalarApi, reiniciarServidor, servidor, type EntrenamientoApi } from './utils/api-entrenamiento';

// T042: el progreso se actualiza tras cambios del historial (FR-021) sin mostrar datos antiguos, con
// estado de error, conservando los récords previos para comparar sin conexión (T041) y sin añadir
// interacciones al registro de series. API en memoria: test/utils/api-entrenamiento.ts.

const W1 = '42000000-0000-4000-8000-000000000001';
const W2 = '42000000-0000-4000-8000-000000000002';

function pasado(id: string, fecha: string, series: [number, number][]): EntrenamientoApi {
  return {
    id, estado: 'finalizado', inicio: `${fecha}T18:00:00.000Z`, fin: `${fecha}T19:00:00.000Z`, zonaHoraria: 'America/Bogota', nota: null, rutinaOrigenId: null, inactivo: false, version: 1,
    ejercicios: [{
      id: `${id.slice(0, -3)}e${id.slice(-2)}`, ejercicioId: PRESS.id, nombre: PRESS.nombre, posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1,
      series: series.map(([pesoKg, repeticiones], i) => ({ id: `${id}-s${i + 1}`, orden: i + 1, repeticiones, pesoKg, registradaEn: `${fecha}T18:0${i + 1}:00.000Z`, version: 1 })),
    }],
  };
}

let router: ReturnType<typeof createMemoryRouter>;
function abrir(ruta: string, cliente?: QueryClient) {
  router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<Proveedores cliente={cliente}><RouterProvider router={router} /></Proveedores>);
  return userEvent.setup();
}
const ir = (ruta: string) => act(async () => { await router.navigate(ruta); });

const tabla = () => screen.findByRole('table', { name: /datos por sesión/i });
const filas = async () => within(await tabla()).getAllByRole('row').slice(1).map((f) => within(f).getAllByRole('cell').map((c) => c.textContent));
const records = () => screen.findByRole('region', { name: 'Récords personales' });
const anunciador = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const peticiones = (texto: string) => servidor.peticiones.filter((p) => p.metodo === 'GET' && p.ruta.includes(texto)).length;

async function anadirSerie(u: ReturnType<typeof userEvent.setup>, t: HTMLElement, peso: string, reps: string) {
  const campoPeso = within(t).getByLabelText(/^peso/i);
  const campoReps = within(t).getByLabelText(/^repeticiones/i);
  await u.clear(campoPeso); await u.type(campoPeso, peso);
  await u.clear(campoReps); await u.type(campoReps, reps);
  await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
}

async function iniciarConPress(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole('button', { name: 'Iniciar entrenamiento' }));
  await u.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
  await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
  return (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  reiniciarServidor();
  instalarApi();
  // jsdom no implementa ResizeObserver, que usa ResponsiveContainer de Recharts.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('T042: qué escrituras cambian el progreso', () => {
  const EN_CURSO = 'en-curso-1';
  const casos: [string, string, string | null][] = [
    ['PATCH', `/entrenamientos/${W1}/ejercicios/er/series/s1`, W1],
    ['DELETE', `/entrenamientos/${W1}/ejercicios/er/series/s1?version=2`, W1],
    ['POST', `/entrenamientos/${W1}/ejercicios/er/series`, W1],
    ['DELETE', `/entrenamientos/${W1}/ejercicios/er?version=1`, W1],
    ['DELETE', `/entrenamientos/${W1}?version=3`, W1],
    ['POST', `/entrenamientos/${EN_CURSO}/finalizar`, EN_CURSO],
    // El entrenamiento en curso no cuenta para el progreso hasta finalizarse.
    ['POST', `/entrenamientos/${EN_CURSO}/ejercicios/er/series`, null],
    ['PATCH', `/entrenamientos/${EN_CURSO}/ejercicios/er/series/s1`, null],
    ['DELETE', `/entrenamientos/${EN_CURSO}?version=1`, null],
    // Notas, terminar o reabrir, añadir un ejercicio vacío o crear un entrenamiento no cambian métricas.
    ['PATCH', `/entrenamientos/${W1}`, null],
    ['PATCH', `/entrenamientos/${W1}/ejercicios/er`, null],
    ['POST', `/entrenamientos/${W1}/ejercicios`, null],
    ['POST', '/entrenamientos', null],
    ['POST', '/auth/login', null],
    ['POST', '/auth/registro', null],
    ['POST', '/auth/logout', null],
    ['POST', '/ejercicios', null],
    ['PATCH', `/ejercicios/${PRESS.id}`, null],
    ['GET', `/entrenamientos/${W1}`, null],
  ];
  it.each(casos)('%s %s → %s', (metodo, ruta, esperado) => {
    expect(afectaAlProgreso({ metodo, ruta }, EN_CURSO)).toBe(esperado);
  });
});

describe('T042: el cliente avisa solo de escrituras confirmadas', () => {
  it('avisa tras un 2xx que no es GET y nunca ante errores ni sin red', async () => {
    const oyente = vi.fn();
    const quitar = alEscribir(oyente);
    const respuestas = [new Response('{}', { status: 200 }), new Response('{}', { status: 200 }), new Response(JSON.stringify({ codigo: 'X', mensaje: 'x', campos: null, actual: null }), { status: 409 })];
    vi.stubGlobal('fetch', vi.fn(async () => { const r = respuestas.shift(); if (!r) throw new TypeError('Failed to fetch'); return r; }));
    await solicitar('/entrenamientos/a/ejercicios/b/series/c', { method: 'PATCH', cuerpo: {} });
    await solicitar('/progreso/x');
    await solicitar('/entrenamientos/a', { method: 'DELETE' }).catch(() => {});
    await solicitar('/entrenamientos/a', { method: 'DELETE' }).catch(() => {});
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(oyente).toHaveBeenCalledWith({ metodo: 'PATCH', ruta: '/entrenamientos/a/ejercicios/b/series/c' });
    quitar();
  });
});

describe('T042: actualizarProgreso', () => {
  it('vacía la vista de Progreso e invalida los récords previos de otros entrenamientos sin borrarlos', () => {
    const cliente = new QueryClient();
    const previoEnCurso = { sesionesAnteriores: 1, pesoMax: null, unoRm: null, volumenSesion: null };
    cliente.setQueryData(clavesProgreso.progreso(PRESS.id, 'todo'), { sesiones: [] });
    cliente.setQueryData(clavesProgreso.records(PRESS.id), previoEnCurso);
    cliente.setQueryData(clavesProgreso.recordsPrevios(PRESS.id, 'en-curso'), previoEnCurso);
    cliente.setQueryData(clavesProgreso.recordsPrevios(PRESS.id, W1), previoEnCurso);
    cliente.setQueryData(['ejercicios', ''], []);
    actualizarProgreso(cliente, W1);
    expect(cliente.getQueryData(clavesProgreso.progreso(PRESS.id, 'todo'))).toBeUndefined();
    expect(cliente.getQueryData(clavesProgreso.records(PRESS.id))).toBeUndefined();
    // Los récords previos del entrenamiento en curso se conservan para comparar sin conexión.
    expect(cliente.getQueryData(clavesProgreso.recordsPrevios(PRESS.id, 'en-curso'))).toBe(previoEnCurso);
    expect(cliente.getQueryState(clavesProgreso.recordsPrevios(PRESS.id, 'en-curso'))?.isInvalidated).toBe(true);
    expect(cliente.getQueryState(clavesProgreso.recordsPrevios(PRESS.id, W1))?.isInvalidated).toBe(false);
    expect(cliente.getQueryState(['ejercicios', ''])?.isInvalidated).toBe(true);
  });
});

describe('T042: Progreso se actualiza tras cambiar el historial sin mostrar datos antiguos', () => {
  it('al editar una serie en Historial, Progreso muestra el valor nuevo en la tabla, el gráfico y los récords', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]])];
    const u = abrir('/progreso');
    expect(await filas()).toEqual([['60', '480', '76']]);
    await ir(`/historial/${W1}`);
    await u.click(await screen.findByRole('button', { name: 'Editar serie 1' }));
    const peso = screen.getByLabelText(/^peso/i);
    await u.clear(peso); await u.type(peso, '70');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(servidor.pasados[0].ejercicios[0].series[0].pesoKg).toBe(70));
    await ir('/progreso');
    // Nada antiguo: hasta tener los datos nuevos no hay tabla ni récords con el valor anterior.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('60 kg')).not.toBeInTheDocument();
    await waitFor(async () => expect(await filas()).toEqual([['70', '560', '88,67']]));
    expect(await records()).toHaveTextContent(/Peso máximo.*70 kg/);
    expect(screen.getByRole('img', { name: /gráfico de progreso de press de banca: 1 sesión/i })).toBeInTheDocument();
  });

  it('al eliminar un entrenamiento desde Historial desaparece su sesión y se recalculan los récords', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]]), pasado(W2, '2026-11-09', [[70, 5]])];
    const u = abrir('/progreso');
    expect(await screen.findByRole('img', { name: /2 sesiones/ })).toBeInTheDocument();
    await ir(`/historial/${W2}`);
    await u.click(await screen.findByRole('button', { name: 'Eliminar entrenamiento' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar entrenamiento' }));
    await waitFor(() => expect(servidor.pasados.map((e) => e.id)).toEqual([W1]));
    await ir('/progreso');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /1 sesión/ })).toBeInTheDocument();
    expect(await filas()).toEqual([['60', '480', '76']]);
    expect(await records()).toHaveTextContent(/Peso máximo.*60 kg/);
  });

  it('al finalizar un entrenamiento su sesión aparece en Progreso', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]])];
    const u = abrir('/progreso');
    expect(await filas()).toHaveLength(1);
    await ir('/');
    const t = await iniciarConPress(u);
    await anadirSerie(u, t, '80', '5');
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento finalizado' })).toBeInTheDocument();
    await ir('/progreso');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await waitFor(async () => expect(await filas()).toHaveLength(2));
    expect((await filas())[1].slice(0, 2)).toEqual(['80', '400']);
  });

  it('al registrar un entrenamiento a posteriori su sesión aparece en Progreso', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]])];
    const u = abrir('/progreso');
    expect(await filas()).toHaveLength(1);
    await ir('/');
    await u.click(await screen.findByRole('button', { name: 'Registrar un entrenamiento pasado' }));
    const form = await screen.findByRole('form', { name: 'Registrar un entrenamiento pasado' });
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: ayer } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: '19:00' } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));
    await u.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
    const t = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
    await anadirSerie(u, t, '90', '3');
    await waitFor(() => expect(servidor.pasados.at(-1)?.ejercicios[0]?.series).toHaveLength(1));
    await u.click(screen.getByRole('button', { name: 'Listo' }));
    await ir('/progreso');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await waitFor(async () => expect((await filas()).map((f) => f[0])).toContain('90'));
  });
});

describe('T042: errores al cargar el progreso', () => {
  it('si la API falla muestra un error comprensible y «Reintentar» lo recupera', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]])];
    servidor.progresoFalla = true;
    const u = abrir('/progreso');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu progreso.');
    expect(screen.queryByText('Cargando tu progreso…')).not.toBeInTheDocument();
    servidor.progresoFalla = false;
    await u.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await filas()).toEqual([['60', '480', '76']]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin conexión lo dice y permite reintentar al volver la red', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[60, 8]])];
    const u = abrir('/progreso');
    expect(await filas()).toHaveLength(1);
    servidor.sinRed = true;
    await u.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), '1m');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión/i);
    servidor.sinRed = false;
    await u.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await tabla()).toBeInTheDocument();
  });
});

describe('T042: avisos de récord integrados en el registro de series', () => {
  it('sin red conserva los récords previos ya consultados aunque el progreso se actualice', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[75, 5]])];
    const cliente = crearClienteConsultas();
    const u = abrir('/', cliente);
    const t = await iniciarConPress(u);
    await waitFor(() => expect(peticiones('/records')).toBe(1));
    await waitFor(() => expect(cliente.getQueryCache().findAll({ queryKey: clavesProgreso.recordsPreviosTodos })[0]?.state.data).toBeDefined());
    servidor.sinRed = true;
    act(() => actualizarProgreso(cliente, W1));
    await anadirSerie(u, t, '76', '5');
    await waitFor(() => expect(anunciador()).toHaveTextContent(/récord de peso máximo/));
    expect(within(t).getByText('Récord de peso y 1RM')).toBeInTheDocument();
  });

  it('registrar series no añade interacciones ni vuelve a pedir progreso o récords', async () => {
    servidor.pasados = [pasado(W1, '2026-11-02', [[75, 5]])];
    const u = abrir('/');
    const t = await iniciarConPress(u);
    await waitFor(() => expect(peticiones('/records')).toBe(1));
    // Primera serie: peso, repeticiones y «Añadir serie» (3 interacciones; teclear un campo cuenta como una).
    await u.type(within(t).getByLabelText(/^peso/i), '76');
    await u.type(within(t).getByLabelText(/^repeticiones/i), '5');
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    // Siguientes: un solo toque, con el aviso ya mostrado.
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    expect(await within(t).findByRole('button', { name: 'Editar serie 3' })).toBeInTheDocument();
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(3));
    expect(peticiones('/records')).toBe(1);
    expect(servidor.peticiones.filter((p) => /^\/progreso\/[^/]+\?/.test(p.ruta))).toHaveLength(0);
  });
});
