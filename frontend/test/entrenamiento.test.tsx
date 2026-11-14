import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { PLAZO_DESHACER_MS } from '../src/paginas/entrenamiento/TarjetaEjercicio';

// T027: entrenamiento en curso y formulario de series (FR-007 a FR-013, US1 escenarios 5–10, V7).
// API en memoria con estado, según contracts/api.md: guarda, versiona y descarta como el servidor.

interface SerieApi { id: string; orden: number; repeticiones: number; pesoKg: number; registradaEn: string; version: number }
interface RealizadoApi { id: string; ejercicioId: string; nombre: string; posicion: number; nota: string | null; terminadoEn: null; volumenNotificadoKg: null; version: number; series: SerieApi[] }
interface EntrenamientoApi { id: string; estado: 'en_curso' | 'finalizado'; inicio: string; fin: string | null; zonaHoraria: string; nota: string | null; rutinaOrigenId: null; inactivo: boolean; version: number; ejercicios: RealizadoApi[] }

const PRESS = { id: '27000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null };
const SENTADILLA = { id: '27000000-0000-4000-8000-000000000002', nombre: 'Sentadilla', grupoMuscular: 'cuadriceps', propio: false, ultimoUso: null };

let usuario = { id: '00000000-0000-4000-8000-000000000271', email: 't027@example.invalid', unidadPeso: 'kg' as 'kg' | 'lb', zonaHoraria: 'America/Bogota' };
let servidor: { entrenamiento: EntrenamientoApi | null; ultimas: Record<string, unknown>; sinRed: boolean; ultimaLenta?: Promise<void>; peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] };

function json(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' } });
}
const resumen = (e: EntrenamientoApi) => {
  const series = e.ejercicios.flatMap((x) => x.series);
  return { ejercicios: e.ejercicios.length, series: series.length, volumenKg: series.reduce((t, s) => t + s.pesoKg * s.repeticiones, 0), duracionMin: null };
};
const conResumen = (e: EntrenamientoApi) => ({ ...e, resumen: resumen(e) });
const aKg = (p: { valor: number; unidad: 'kg' | 'lb' }) => (p.unidad === 'kg' ? p.valor : Number((p.valor / 2.2046226218487757).toFixed(4)));

function instalarApi() {
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'https://localhost');
    const ruta = url.pathname.replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (servidor.sinRed) throw new TypeError('Failed to fetch');
    servidor.peticiones.push({ metodo, ruta: `${ruta}${url.search}`, cuerpo });
    const e = servidor.entrenamiento;
    if (ruta === '/auth/yo') return json(200, usuario);
    if (ruta === '/ejercicios') return json(200, [PRESS, SENTADILLA]);
    const ultima = /^\/ejercicios\/([^/]+)\/ultima-sesion$/.exec(ruta);
    if (ultima) { await servidor.ultimaLenta; return json(200, servidor.ultimas[ultima[1]] ?? null); }
    if (ruta === '/entrenamientos/en-curso') return e ? json(200, conResumen(e)) : json(204);
    if (metodo === 'POST' && ruta === '/entrenamientos') {
      if (e) return json(409, { codigo: 'ENTRENAMIENTO_EN_CURSO', mensaje: 'Ya hay uno.', campos: null, actual: conResumen(e) });
      servidor.entrenamiento = { id: cuerpo.id, estado: 'en_curso', inicio: cuerpo.inicio, fin: null, zonaHoraria: cuerpo.zonaHoraria, nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [] };
      return json(201, conResumen(servidor.entrenamiento));
    }
    if (!e) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
    const base = `/entrenamientos/${e.id}`;
    if (metodo === 'PATCH' && ruta === base) {
      if (cuerpo.version !== e.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: conResumen(e) });
      e.nota = cuerpo.nota; e.version += 1;
      return json(200, conResumen(e));
    }
    if (metodo === 'POST' && ruta === `${base}/finalizar`) {
      if (cuerpo.version !== e.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: conResumen(e) });
      servidor.entrenamiento = null;
      if (!e.ejercicios.some((x) => x.series.length)) return json(200, { descartado: true });
      for (const x of e.ejercicios.filter((r) => r.series.length)) {
        servidor.ultimas[x.ejercicioId] = { entrenamientoId: e.id, fecha: e.inicio, series: x.series.map(({ orden, repeticiones, pesoKg }) => ({ orden, repeticiones, pesoKg })) };
      }
      return json(200, { ...conResumen(e), estado: 'finalizado', fin: cuerpo.fin ?? new Date().toISOString(), version: e.version + 1 });
    }
    if (metodo === 'POST' && ruta === `${base}/ejercicios`) {
      const ej = [PRESS, SENTADILLA].find((x) => x.id === cuerpo.ejercicioId);
      const r: RealizadoApi = { id: cuerpo.id, ejercicioId: cuerpo.ejercicioId, nombre: ej?.nombre ?? '?', posicion: cuerpo.posicion, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] };
      e.ejercicios.push(r);
      return json(201, r);
    }
    const series = new RegExp(`^${base}/ejercicios/([^/]+)/series(?:/([^/]+))?$`).exec(ruta);
    if (series) {
      const realizado = e.ejercicios.find((x) => x.id === series[1]);
      if (!realizado) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
      if (metodo === 'POST') {
        const s = { id: cuerpo.id, orden: cuerpo.orden, repeticiones: cuerpo.repeticiones, pesoKg: aKg(cuerpo.pesoEntrada), registradaEn: cuerpo.registradaEn, version: 1 };
        realizado.series.push(s);
        return json(201, s);
      }
      const s = realizado.series.find((x) => x.id === series[2]);
      if (!s) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
      const version = metodo === 'DELETE' ? Number(url.searchParams.get('version')) : cuerpo.version;
      if (version !== s.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: s });
      if (metodo === 'DELETE') { realizado.series = realizado.series.filter((x) => x !== s); return json(204); }
      if (cuerpo.repeticiones !== undefined) s.repeticiones = cuerpo.repeticiones;
      if (cuerpo.pesoEntrada) s.pesoKg = aKg(cuerpo.pesoEntrada);
      s.version += 1;
      return json(200, s);
    }
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
  }));
}

function abrir() {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/'] })} /></Proveedores>);
}

async function iniciarYAnadir(u: ReturnType<typeof userEvent.setup>, ejercicio = 'Press de banca') {
  await u.click(await screen.findByRole('button', { name: 'Iniciar entrenamiento' }));
  await screen.findByRole('heading', { name: 'Entrenamiento en curso' });
  await u.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
  await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: ejercicio }));
  return tarjeta(ejercicio);
}

const tarjeta = async (nombre: string) => (await screen.findByRole('heading', { level: 3, name: nombre })).closest('article') as HTMLElement;
const pendientes = (n: number) => screen.findByText(`${n} ${n === 1 ? 'cambio pendiente' : 'cambios pendientes'} de sincronizar`);

async function anadirSerie(u: ReturnType<typeof userEvent.setup>, t: HTMLElement, peso: string, reps: string) {
  const campoPeso = within(t).getByLabelText(/^peso/i);
  const campoReps = within(t).getByLabelText(/^repeticiones/i);
  await u.clear(campoPeso); await u.type(campoPeso, peso);
  await u.clear(campoReps); await u.type(campoReps, reps);
  await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
}

beforeEach(() => {
  localStorage.clear();
  usuario = { ...usuario, unidadPeso: 'kg' };
  servidor = { entrenamiento: null, ultimas: {}, sinRed: false, peticiones: [] };
  instalarApi();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('T027: iniciar y registrar series', () => {
  it('inicia un entrenamiento con UUID, hora y zona horaria y muestra los pendientes', async () => {
    const u = userEvent.setup();
    abrir();
    await u.click(await screen.findByRole('button', { name: 'Iniciar entrenamiento' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento en curso' })).toBeInTheDocument();
    expect(await pendientes(0)).toBeInTheDocument();
    const inicio = servidor.peticiones.find((p) => p.metodo === 'POST' && p.ruta === '/entrenamientos');
    expect(inicio?.cuerpo).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), inicio: expect.any(String), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone });
  });

  it('registra la primera serie en 3 interacciones y la envía según el contrato', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    expect(await within(t).findByText('60 kg × 8')).toBeInTheDocument();
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(1));
    const post = servidor.peticiones.find((p) => p.ruta.endsWith('/series'));
    expect(post?.cuerpo).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), orden: 1, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: expect.any(String) });
  });

  it('prellena la siguiente serie con la anterior: registrarla es un solo toque', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await within(t).findByText('60 kg × 8');
    expect(within(t).getByLabelText(/^peso/i)).toHaveValue('60');
    expect(within(t).getByLabelText(/^repeticiones/i)).toHaveValue('8');
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    expect(await within(t).findByRole('button', { name: 'Editar serie 2' })).toBeInTheDocument();
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series.map((s) => [s.orden, s.pesoKg, s.repeticiones])).toEqual([[1, 60, 8], [2, 60, 8]]));
  });

  it('prellena la primera serie con la primera de la última sesión y muestra lo que se hizo', async () => {
    servidor.ultimas[PRESS.id] = { entrenamientoId: 'x', fecha: '2026-11-10T18:00:00Z', series: [{ orden: 1, repeticiones: 5, pesoKg: 100 }, { orden: 2, repeticiones: 4, pesoKg: 100 }] };
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    const referencia = await within(t).findByText(/la última vez/i);
    expect(referencia.closest('p')).toHaveTextContent('100 kg × 5');
    expect(referencia.closest('p')).toHaveTextContent('100 kg × 4');
    expect(within(t).getByLabelText(/^peso/i)).toHaveValue('100');
    expect(within(t).getByLabelText(/^repeticiones/i)).toHaveValue('5');
  });

  it('no borra lo que el usuario escribe si la última sesión llega después', async () => {
    let soltar = () => {};
    servidor.ultimaLenta = new Promise((r) => { soltar = r; });
    servidor.ultimas[PRESS.id] = { entrenamientoId: 'x', fecha: '2026-11-10T18:00:00Z', series: [{ orden: 1, repeticiones: 5, pesoKg: 100 }] };
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await u.type(within(t).getByLabelText(/^peso/i), '60');
    await u.type(within(t).getByLabelText(/^repeticiones/i), '8');
    await act(async () => { soltar(); });
    await within(t).findByText(/la última vez/i);
    expect(within(t).getByLabelText(/^peso/i)).toHaveValue('60');
    expect(within(t).getByLabelText(/^repeticiones/i)).toHaveValue('8');
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    expect(await within(t).findByText('60 kg × 8')).toBeInTheDocument();
  });

  it('si la última sesión llega antes de escribir, prellena con ella', async () => {
    let soltar = () => {};
    servidor.ultimaLenta = new Promise((r) => { soltar = r; });
    servidor.ultimas[PRESS.id] = { entrenamientoId: 'x', fecha: '2026-11-10T18:00:00Z', series: [{ orden: 1, repeticiones: 5, pesoKg: 100 }] };
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await act(async () => { soltar(); });
    await within(t).findByText(/la última vez/i);
    expect(within(t).getByLabelText(/^peso/i)).toHaveValue('100');
  });

  it.each([
    ['repeticiones 0', '60', '0', /^repeticiones/i, /entre 1 y 100/i],
    ['repeticiones 101', '60', '101', /^repeticiones/i, /entre 1 y 100/i],
    ['peso con 3 decimales', '60.125', '8', /^peso/i, /dos decimales/i],
    ['más de 500 kg', '500.01', '8', /^peso/i, /500 kg/i],
    ['peso negativo', '-5', '8', /^peso/i, /0 o más/i],
  ])('rechaza %s junto al campo sin enviar nada (V4)', async (_caso, peso, reps, campo, mensaje) => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, peso, reps);
    expect(within(t).getByLabelText(campo)).toHaveAccessibleDescription(mensaje);
    expect(servidor.peticiones.some((p) => p.ruta.endsWith('/series'))).toBe(false);
  });

  it('acepta peso 0 y la coma decimal', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '0', '10');
    expect(await within(t).findByText('0 kg × 10')).toBeInTheDocument();
    await anadirSerie(u, t, '62,5', '8');
    expect(await within(t).findByText('62,5 kg × 8')).toBeInTheDocument();
  });

  it('en lb pide el peso en lb y envía la unidad original', async () => {
    usuario = { ...usuario, unidadPeso: 'lb' };
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    expect(within(t).getByLabelText('Peso (lb)')).toBeInTheDocument();
    await anadirSerie(u, t, '135', '8');
    expect(await within(t).findByText('135 lb × 8')).toBeInTheDocument();
    await waitFor(() => expect(servidor.peticiones.find((p) => p.ruta.endsWith('/series'))?.cuerpo).toMatchObject({ pesoEntrada: { valor: 135, unidad: 'lb' } }));
  });
});

describe('T027: editar, eliminar con deshacer y notas', () => {
  it('edita una serie en el mismo formulario y envía la versión conocida', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(1));
    await u.click(await within(t).findByRole('button', { name: 'Editar serie 1' }));
    const peso = within(t).getByLabelText(/^peso/i);
    expect(peso).toHaveValue('60');
    await u.clear(peso); await u.type(peso, '62.5');
    await u.click(within(t).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(t).findByText('62,5 kg × 8')).toBeInTheDocument();
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series[0]).toMatchObject({ pesoKg: 62.5, version: 2 }));
    expect(servidor.peticiones.find((p) => p.metodo === 'PATCH')?.cuerpo).toEqual({ repeticiones: 8, pesoEntrada: { valor: 62.5, unidad: 'kg' }, version: 1 });
    expect(within(t).getByRole('button', { name: 'Añadir serie' })).toBeInTheDocument();
  });

  it('eliminar quita la serie al momento y «Deshacer» la recupera sin enviar nada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await u.click(await within(t).findByRole('button', { name: 'Añadir serie' }));
    await within(t).findByRole('button', { name: 'Editar serie 2' });
    await u.click(within(t).getByRole('button', { name: 'Eliminar serie 2' }));
    expect(within(t).queryByRole('button', { name: 'Editar serie 2' })).not.toBeInTheDocument();
    await u.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(await within(t).findByRole('button', { name: 'Editar serie 2' })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(PLAZO_DESHACER_MS + 100); });
    expect(servidor.peticiones.some((p) => p.metodo === 'DELETE')).toBe(false);
  });

  it('si no se deshace, envía la eliminación con la versión tras el plazo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(1));
    await u.click(await within(t).findByRole('button', { name: 'Eliminar serie 1' }));
    expect(await screen.findByText('Serie 1 eliminada.')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(PLAZO_DESHACER_MS + 100); });
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(0));
    expect(servidor.peticiones.find((p) => p.metodo === 'DELETE')?.ruta).toMatch(/\/series\/[0-9a-f-]{36}\?version=1$/);
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument();
  });

  it('guarda la nota del entrenamiento y finaliza después con la versión que dejó la nota', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await u.type(screen.getByLabelText('Nota del entrenamiento'), 'Buen día');
    await u.tab();
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento finalizado' })).toBeInTheDocument();
    expect(servidor.peticiones.find((p) => p.metodo === 'PATCH' && p.ruta.match(/^\/entrenamientos\/[^/]+$/))?.cuerpo).toEqual({ nota: 'Buen día', version: 1 });
    expect(servidor.peticiones.find((p) => p.ruta.endsWith('/finalizar'))?.cuerpo).toMatchObject({ version: 2 });
  });
});

describe('T027: finalizar, vacío e inactividad', () => {
  it('finaliza y muestra el resumen: ejercicios, series y volumen', async () => {
    const u = userEvent.setup();
    abrir();
    let t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '62.5', '8');
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    await within(t).findByRole('button', { name: 'Editar serie 2' });
    await u.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Sentadilla' }));
    t = await tarjeta('Sentadilla');
    await anadirSerie(u, t, '100', '5');
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    const resumenFinal = (await screen.findByRole('heading', { name: 'Entrenamiento finalizado' })).closest('section') as HTMLElement;
    expect(resumenFinal).toHaveTextContent('2 ejercicios');
    expect(resumenFinal).toHaveTextContent('3 series');
    expect(resumenFinal).toHaveTextContent('1500 kg');
    expect(servidor.entrenamiento).toBeNull();
    await u.click(within(resumenFinal).getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
  });

  it('tras finalizar, el siguiente entrenamiento muestra y prellena con la sesión recién terminada', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '70', '6');
    await within(t).findByText('70 kg × 6');
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    await u.click(await screen.findByRole('button', { name: 'Volver' }));
    const nueva = await iniciarYAnadir(u);
    expect((await within(nueva).findByText(/la última vez/i)).closest('p')).toHaveTextContent('70 kg × 6');
    expect(within(nueva).getByLabelText(/^peso/i)).toHaveValue('70');
  });

  it('un entrenamiento sin series se descarta y se avisa', async () => {
    const u = userEvent.setup();
    abrir();
    await u.click(await screen.findByRole('button', { name: 'Iniciar entrenamiento' }));
    await screen.findByRole('heading', { name: 'Entrenamiento en curso' });
    await waitFor(() => expect(servidor.entrenamiento).not.toBeNull());
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sin series/i);
    expect(servidor.entrenamiento).toBeNull();
    expect(screen.getByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
  });

  it('tras más de 12 h sin actividad ofrece finalizar con la hora de la última serie (V7)', async () => {
    const ultima = new Date(Date.now() - 13 * 3600_000).toISOString();
    servidor.entrenamiento = {
      id: '20000000-0000-4000-8000-000000000271', estado: 'en_curso', inicio: new Date(Date.now() - 14 * 3600_000).toISOString(), fin: null, zonaHoraria: 'UTC', nota: null, rutinaOrigenId: null, inactivo: true, version: 1,
      ejercicios: [{ id: '30000000-0000-4000-8000-000000000271', ejercicioId: PRESS.id, nombre: PRESS.nombre, posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [{ id: '40000000-0000-4000-8000-000000000271', orden: 1, repeticiones: 8, pesoKg: 60, registradaEn: ultima, version: 1 }] }],
    };
    const u = userEvent.setup();
    abrir();
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(/13 horas/);
    await u.click(within(dialogo).getByRole('button', { name: 'Finalizar' }));
    await waitFor(() => expect(servidor.entrenamiento).toBeNull());
    expect(servidor.peticiones.find((p) => p.ruta.endsWith('/finalizar'))?.cuerpo).toEqual({ fin: ultima, version: 1 });
  });

  it('«Seguir entrenando» cierra el aviso de inactividad sin finalizar', async () => {
    servidor.entrenamiento = {
      id: '20000000-0000-4000-8000-000000000272', estado: 'en_curso', inicio: new Date(Date.now() - 14 * 3600_000).toISOString(), fin: null, zonaHoraria: 'UTC', nota: null, rutinaOrigenId: null, inactivo: true, version: 1, ejercicios: [],
    };
    const u = userEvent.setup();
    abrir();
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Seguir entrenando' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(servidor.peticiones.some((p) => p.ruta.endsWith('/finalizar'))).toBe(false);
  });
});

describe('T027: sin conexión', () => {
  it('sin red registra la serie como pendiente y la conserva al reabrir sin red', async () => {
    const u = userEvent.setup();
    abrir();
    const t = await iniciarYAnadir(u);
    await anadirSerie(u, t, '60', '8');
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(1));
    servidor.sinRed = true;
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
    expect(await pendientes(1)).toBeInTheDocument();
    expect(within(t).getByRole('button', { name: 'Editar serie 2' })).toBeInTheDocument();

    // Reabrir sin red: copia local del entrenamiento + operaciones pendientes de la cola.
    cleanup();
    localStorage.setItem('gymtrack:ultima-sesion', JSON.stringify(usuario));
    abrir();
    const reabierta = await tarjeta('Press de banca');
    expect(within(reabierta).getAllByText('60 kg × 8')).toHaveLength(2);
    expect(await pendientes(1)).toBeInTheDocument();

    servidor.sinRed = false;
    window.dispatchEvent(new Event('online'));
    expect(await pendientes(0)).toBeInTheDocument();
    expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(2);
  });
});
