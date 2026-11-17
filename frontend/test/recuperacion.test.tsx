import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';

// T049: recuperación de contraseña (FR-001; contracts/api.md «POST /auth/recuperar» y
// «POST /auth/restablecer»). La respuesta nunca revela si el email tiene cuenta.

const NEUTRO = 'Si el email está registrado, recibirás un enlace en unos minutos.';
const USUARIO = { id: '00000000-0000-4000-8000-000000000490', email: 'ana@example.com', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' };

let sesion: typeof USUARIO | null;
let tokensValidos: Set<string>;
let recuperarResponde: number;
let sinRed: boolean;
let peticiones: { ruta: string; cuerpo: unknown }[];

const json = (status: number, cuerpo?: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
  status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sesion = null;
  tokensValidos = new Set(['token-valido']);
  recuperarResponde = 202;
  sinRed = false;
  peticiones = [];
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (sinRed) throw new TypeError('Failed to fetch');
    const ruta = new URL(String(entrada), 'https://localhost').pathname.replace(/^\/api/, '');
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    peticiones.push({ ruta, cuerpo });
    if (ruta === '/auth/yo') return sesion ? json(200, sesion) : json(401, { codigo: 'NO_AUTENTICADO', mensaje: 'No.', campos: null, actual: null });
    if (ruta === '/auth/recuperar') {
      if (recuperarResponde === 429) return json(429, { codigo: 'DEMASIADAS_PETICIONES', mensaje: 'Demasiadas.', campos: null, actual: null });
      return json(202, { mensaje: NEUTRO });
    }
    if (ruta === '/auth/restablecer') {
      if (!tokensValidos.delete(cuerpo.token)) return json(410, { codigo: 'ENLACE_INVALIDO', mensaje: 'El enlace no es válido, ya se usó o ha caducado. Solicita uno nuevo.', campos: null, actual: null });
      sesion = null; // El servidor cierra todas las sesiones.
      return json(204);
    }
    if (ruta === '/entrenamientos/en-curso') return json(204);
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

let router: ReturnType<typeof createMemoryRouter>;
function abrir(ruta: string) {
  router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<Proveedores><RouterProvider router={router} /></Proveedores>);
  return userEvent.setup();
}
const enviados = (ruta: string) => peticiones.filter((p) => p.ruta === ruta).map((p) => p.cuerpo);
/** Ni el email ni el token se guardan en el navegador. */
const almacenado = () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });

describe('T049: solicitar el enlace de recuperación', () => {
  it('se llega desde «Iniciar sesión» con un enlace accesible', async () => {
    const u = abrir('/login');
    await u.click(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recuperar contraseña' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('autocomplete', 'email');
  });

  it('también se puede abrir con una sesión iniciada (no redirige a Entrenar)', async () => {
    sesion = USUARIO;
    abrir('/recuperar');
    expect(await screen.findByRole('heading', { level: 1, name: 'Recuperar contraseña' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });

  it('valida el email antes de enviar', async () => {
    const u = abrir('/recuperar');
    await u.type(await screen.findByLabelText('Correo electrónico'), 'no-es-un-email');
    await u.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText(/escribe un correo electrónico válido/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(enviados('/auth/recuperar')).toHaveLength(0);
  });

  it('muestra siempre el mismo mensaje neutro, sin guardar el email', async () => {
    const u = abrir('/recuperar');
    await u.type(await screen.findByLabelText('Correo electrónico'), '  Ana@Example.com ');
    await u.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent(NEUTRO);
    expect(enviados('/auth/recuperar')).toEqual([{ email: 'Ana@Example.com' }]);
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(almacenado()).not.toMatch(/ana@example/i);
  });

  it('ante el límite de intentos avisa sin revelar si la cuenta existe', async () => {
    recuperarResponde = 429;
    const u = abrir('/recuperar');
    await u.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com');
    await u.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Has hecho demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.');
    expect(screen.queryByText(NEUTRO)).not.toBeInTheDocument();
  });

  it('sin conexión lo dice', async () => {
    const u = abrir('/recuperar');
    await u.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com');
    sinRed = true;
    await u.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
  });
});

describe('T049: restablecer la contraseña con el enlace', () => {
  it('quita el token de la dirección, valida la contraseña y al guardarla lleva a iniciar sesión', async () => {
    const u = abrir('/restablecer?token=token-valido');
    const campo = await screen.findByLabelText('Nueva contraseña');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'new-password');
    await u.type(campo, 'corta');
    await u.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('La contraseña debe tener entre 8 y 128 caracteres.')).toBeInTheDocument();
    expect(enviados('/auth/restablecer')).toHaveLength(0);
    await u.clear(campo); await u.type(campo, 'Nueva-T049-2026!');
    await u.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Contraseña cambiada. Inicia sesión con tu nueva contraseña.');
    expect(enviados('/auth/restablecer')).toEqual([{ token: 'token-valido', contrasenaNueva: 'Nueva-T049-2026!' }]);
    expect(almacenado()).not.toMatch(/token-valido|Nueva-T049/);
  });

  it('un enlace usado o caducado (410) se rechaza con un error claro y permite pedir otro', async () => {
    const u = abrir('/restablecer?token=token-usado');
    await u.type(await screen.findByLabelText('Nueva contraseña'), 'Nueva-T049-2026!');
    await u.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace no es válido, ya se usó o ha caducado. Solicita uno nuevo.');
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toHaveAttribute('href', '/recuperar');
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
  });

  it('sin token muestra el mismo error sin llamar a la API', async () => {
    abrir('/restablecer');
    expect(await screen.findByRole('alert')).toHaveTextContent(/el enlace no es válido/i);
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toBeInTheDocument();
    expect(enviados('/auth/restablecer')).toHaveLength(0);
  });

  it('con una sesión abierta en este navegador, al cambiar la contraseña la olvida y pide iniciar sesión', async () => {
    sesion = USUARIO;
    localStorage.setItem('gymtrack:ultima-sesion', JSON.stringify(USUARIO));
    const u = abrir('/restablecer?token=token-valido');
    await u.type(await screen.findByLabelText('Nueva contraseña'), 'Nueva-T049-2026!');
    await u.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem('gymtrack:ultima-sesion')).toBeNull();
    await act(async () => { await router.navigate('/'); });
    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
