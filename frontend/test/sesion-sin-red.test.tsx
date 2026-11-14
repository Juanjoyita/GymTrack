import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';

// T026A: recargar sin red con el shell en caché solo sirve si la sesión conocida sigue disponible.
// Se guarda la última sesión válida (sin contraseña ni token) y solo se usa si la red falla.

const CLAVE = 'gymtrack:ultima-sesion';
const ANA = { id: '00000000-0000-4000-8000-0000000002a1', email: 'ana@example.invalid', unidadPeso: 'kg', zonaHoraria: 'UTC' };
let modo: 'red' | 'sin-red' | 'caducada' = 'red';

beforeEach(() => {
  modo = 'red';
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (modo === 'sin-red') throw new TypeError('Failed to fetch');
    const ruta = new URL(String(entrada), 'https://localhost').pathname.replace(/^\/api/, '');
    if (ruta === '/auth/logout') return new Response(null, { status: 204 });
    if (ruta === '/auth/yo') {
      return modo === 'caducada'
        ? new Response(JSON.stringify({ codigo: 'NO_AUTENTICADO', mensaje: 'Sin sesión.', campos: null, actual: null }), { status: 401, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify(ANA), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    void init;
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const abrir = (ruta = '/') => {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} /></Proveedores>);
  return userEvent.setup();
};

describe('T026A: sesión conocida sin red', () => {
  it('guarda la última sesión válida sin contraseña ni token', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'Entrenar' });
    expect(JSON.parse(localStorage.getItem(CLAVE) ?? 'null')).toEqual(ANA);
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/contrasena|password|token|gt_sesion/i);
  });

  it('sin red usa la sesión conocida y abre la aplicación', async () => {
    localStorage.setItem(CLAVE, JSON.stringify(ANA));
    modo = 'sin-red';
    abrir('/cuenta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument();
    expect(screen.getByText(ANA.email)).toBeInTheDocument();
  });

  it('sin red y sin sesión conocida avisa y permite reintentar', async () => {
    modo = 'sin-red';
    abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('si el servidor responde 401, se olvida la sesión conocida', async () => {
    localStorage.setItem(CLAVE, JSON.stringify(ANA));
    modo = 'caducada';
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('cerrar sesión olvida la sesión conocida', async () => {
    const usuario = abrir('/cuenta');
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' });
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });
});
