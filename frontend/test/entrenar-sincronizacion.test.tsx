import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';

// T026 en la página: «Añadir ejercicio» pasa por la cola duradera (R-08).

const USUARIO = { id: '00000000-0000-4000-8000-000000000261', email: 't026@example.invalid', unidadPeso: 'kg', zonaHoraria: 'UTC' };
const ENTRENAMIENTO = '20000000-0000-4000-8000-000000000261';
const PRESS = { id: '26000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null };

let conRed = true;
const creados: { id: string; ejercicioId: string; posicion: number }[] = [];

function json(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  conRed = true;
  creados.length = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const ruta = new URL(String(entrada), 'https://localhost').pathname.replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (ruta === '/auth/yo') return json(200, USUARIO);
    if (ruta === '/ejercicios') return json(200, [PRESS]);
    if (ruta === '/entrenamientos/en-curso') {
      return json(200, {
        id: ENTRENAMIENTO, estado: 'en_curso', inicio: '2026-11-14T18:00:00Z', fin: null, zonaHoraria: 'UTC', nota: null, rutinaOrigenId: null, inactivo: false, version: 1,
        ejercicios: creados.map((c) => ({ ...c, nombre: PRESS.nombre, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] })),
        resumen: { ejercicios: creados.length, series: 0, volumenKg: 0, duracionMin: null },
      });
    }
    if (metodo === 'POST' && ruta === `/entrenamientos/${ENTRENAMIENTO}/ejercicios`) {
      if (!conRed) throw new TypeError('Failed to fetch');
      const cuerpo = JSON.parse(String(init?.body));
      if (!creados.some((c) => c.id === cuerpo.id)) creados.push(cuerpo);
      return json(201, { ...cuerpo, nombre: PRESS.nombre, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] });
    }
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado.', campos: null, actual: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

function abrirApp() {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/'] })} /></Proveedores>);
  return userEvent.setup();
}

describe('T026: añadir ejercicio pasa por la cola duradera', () => {
  it('sin conexión se guarda en la cola del usuario, se marca pendiente y se envía una sola vez al volver la red tras recargar', async () => {
    conRed = false;
    const usuario = abrirApp();
    await usuario.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await usuario.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /^Press de banca/ }));

    const tarjeta = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('li') as HTMLElement;
    expect(within(tarjeta).getByText('Pendiente de sincronizar')).toBeInTheDocument();
    const guardado = JSON.parse(localStorage.getItem(`gymtrack:cola:${USUARIO.id}`) ?? '{}');
    expect(guardado.pendientes).toEqual([expect.objectContaining({ metodo: 'POST', ruta: `/entrenamientos/${ENTRENAMIENTO}/ejercicios` })]);

    // Recarga: nueva instancia de la aplicación sobre el mismo localStorage, ya con red.
    cleanup();
    conRed = true;
    abrirApp();
    await waitFor(() => expect(creados).toHaveLength(1));
    expect(creados[0]).toMatchObject({ ejercicioId: PRESS.id, posicion: 1, id: guardado.pendientes[0].cuerpo.id });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`gymtrack:cola:${USUARIO.id}`) ?? '{}').pendientes).toEqual([]));
    const confirmada = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('li') as HTMLElement;
    await waitFor(() => expect(within(confirmada).queryByText('Pendiente de sincronizar')).not.toBeInTheDocument());
  });

  it('con conexión se confirma al momento y la cola queda vacía', async () => {
    const usuario = abrirApp();
    await usuario.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await usuario.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /^Press de banca/ }));
    await waitFor(() => expect(creados).toHaveLength(1));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`gymtrack:cola:${USUARIO.id}`) ?? '{}').pendientes).toEqual([]));
    expect(screen.queryByText('Pendiente de sincronizar')).not.toBeInTheDocument();
  });
});
