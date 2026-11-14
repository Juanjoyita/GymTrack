import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, solicitar } from '../src/api/cliente';
import { Proveedores, crearClienteConsultas } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { registrarLimpiezaDeSesion } from '../src/app/sesion';
import { textos } from '../src/textos/es';

// Aceptación de interfaz de T024 con una API en memoria según contracts/api.md («Autenticación»).
// La sesión real vive en la cookie httpOnly: aquí solo se simula si /auth/yo responde 200 o 401.

const ANA = { id: '00000000-0000-4000-8000-000000000241', email: 'ana@example.invalid', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' };
const CONTRASENA = 'Contrasena-T024!';
const CREDENCIALES_INVALIDAS = 'No se pudo validar el acceso. Inicia sesión de nuevo.';

interface Peticion { metodo: string; ruta: string; cuerpo: unknown }

function crearApi(conSesion = false) {
  let usuario: typeof ANA | null = conSesion ? ANA : null;
  const peticiones: Peticion[] = [];
  let pausa: Promise<void> | null = null;
  const json = (status: number, cuerpo?: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
  });
  const error = (status: number, codigo: string, mensaje: string, campos: Record<string, string> | null = null) =>
    json(status, { codigo, mensaje, campos, actual: null });

  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const ruta = new URL(String(entrada), 'https://localhost').pathname.replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    peticiones.push({ metodo, ruta, cuerpo });
    if (pausa) await pausa;
    if (metodo === 'GET' && ruta === '/auth/yo') return usuario ? json(200, usuario) : error(401, 'NO_AUTENTICADO', CREDENCIALES_INVALIDAS);
    if (metodo === 'POST' && ruta === '/auth/login') {
      const { email, contrasena } = cuerpo as { email: string; contrasena: string };
      if (email !== ANA.email || contrasena !== CONTRASENA) return error(401, 'NO_AUTENTICADO', CREDENCIALES_INVALIDAS);
      usuario = ANA;
      return json(200, ANA);
    }
    if (metodo === 'POST' && ruta === '/auth/registro') {
      const { email } = cuerpo as { email: string };
      if (email === ANA.email) return error(409, 'EMAIL_EN_USO', 'Ese email ya está registrado.');
      if (email === 'rechazado@example.invalid') return error(400, 'VALIDACION', 'Revisa los campos marcados.', { contrasena: 'Valor inválido. Revisa el formato y los límites del campo.' });
      usuario = { ...ANA, id: '00000000-0000-4000-8000-000000000242', email };
      return json(201, usuario);
    }
    if (metodo === 'POST' && ruta === '/auth/logout') { usuario = null; return json(204); }
    if (!usuario) return error(401, 'NO_AUTENTICADO', CREDENCIALES_INVALIDAS);
    return error(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
  });

  return {
    fetchFalso, peticiones,
    caducarSesion: () => { usuario = null; },
    pausar: () => { let soltar = () => {}; pausa = new Promise((r) => { soltar = r; }); return () => { pausa = null; soltar(); }; },
  };
}

let api: ReturnType<typeof crearApi>;
let cliente: QueryClient;

function iniciar(ruta: string, conSesion = false) {
  api = crearApi(conSesion);
  vi.stubGlobal('fetch', api.fetchFalso);
  cliente = crearClienteConsultas();
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<Proveedores cliente={cliente}><RouterProvider router={router} /></Proveedores>);
  return { router, usuario: userEvent.setup() };
}

const tituloLogin = () => screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' });
const campoEmail = () => screen.getByLabelText('Correo electrónico');
const campoContrasena = () => screen.getByLabelText('Contraseña');

async function rellenarLogin(usuario: ReturnType<typeof userEvent.setup>, email: string, contrasena: string) {
  await usuario.type(campoEmail(), email);
  await usuario.type(campoContrasena(), contrasena);
  await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('T024: rutas protegidas', () => {
  it('sin sesión redirige a /login y no muestra la navegación privada', async () => {
    const { router } = iniciar('/historial');
    expect(await tituloLogin()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
    expect(document.title).toBe('Iniciar sesión · GymTrack');
  });

  it('con sesión, /login y /registro llevan a la aplicación', async () => {
    const { router } = iniciar('/registro', true);
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrenar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('anuncia la comprobación de sesión mientras se resuelve', async () => {
    api = crearApi(true);
    const soltar = api.pausar();
    vi.stubGlobal('fetch', api.fetchFalso);
    render(<Proveedores cliente={crearClienteConsultas()}><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/'] })} /></Proveedores>);
    expect(await screen.findByRole('status')).toHaveTextContent('Comprobando tu sesión');
    soltar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrenar' })).toBeInTheDocument();
  });
});

describe('T024: inicio de sesión', () => {
  it('ofrece campos etiquetados con autocompletado, área táctil y enlace a crear cuenta', async () => {
    iniciar('/login');
    await tituloLogin();
    expect(campoEmail()).toHaveAttribute('type', 'email');
    expect(campoEmail()).toHaveAttribute('autocomplete', 'email');
    expect(campoContrasena()).toHaveAttribute('type', 'password');
    expect(campoContrasena()).toHaveAttribute('autocomplete', 'current-password');
    for (const control of [campoEmail(), campoContrasena(), screen.getByRole('button', { name: 'Iniciar sesión' })]) {
      expect(control).toHaveClass('min-h-11');
    }
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
  });

  it('valida en el cliente, marca los campos y enfoca el primero inválido sin llamar a la API', async () => {
    const { usuario } = iniciar('/login');
    await tituloLogin();
    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(campoEmail()).toHaveAttribute('aria-invalid', 'true');
    expect(campoEmail()).toHaveAccessibleDescription(/correo electrónico válido/i);
    expect(campoContrasena()).toHaveAccessibleDescription(/escribe tu contraseña/i);
    expect(campoEmail()).toHaveFocus();
    expect(api.peticiones.some((p) => p.ruta === '/auth/login')).toBe(false);
  });

  it('inicia sesión, envía el contrato y vuelve a la página solicitada con el foco en su título', async () => {
    const { usuario, router } = iniciar('/historial');
    await tituloLogin();
    await rellenarLogin(usuario, `  ${ANA.email} `, CONTRASENA);
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Historial' });
    expect(router.state.location.pathname).toBe('/historial');
    expect(titulo).toHaveFocus();
    expect(api.peticiones.find((p) => p.ruta === '/auth/login')?.cuerpo).toEqual({ email: ANA.email, contrasena: CONTRASENA });
  });

  it('muestra el mismo aviso para credenciales incorrectas o cuenta desconocida y conserva el email', async () => {
    const { usuario } = iniciar('/login');
    await tituloLogin();
    const avisos: string[] = [];
    for (const email of [ANA.email, 'desconocido@example.invalid']) {
      await usuario.clear(campoEmail());
      await usuario.clear(campoContrasena());
      await rellenarLogin(usuario, email, 'incorrecta-123');
      const aviso = await screen.findByRole('alert');
      avisos.push(aviso.textContent ?? '');
      expect(campoEmail()).toHaveValue(email);
    }
    // Texto propio que indica cómo corregir; idéntico en ambos casos para no revelar qué cuentas existen.
    expect(avisos[0]).toBe(textos.acceso.credencialesIncorrectas);
    expect(avisos[1]).toBe(avisos[0]);
  });

  it('indica la carga durante el envío y evita envíos repetidos', async () => {
    const { usuario } = iniciar('/login');
    await tituloLogin();
    const soltar = api.pausar();
    await rellenarLogin(usuario, ANA.email, CONTRASENA);
    const boton = screen.getByRole('button', { name: /iniciando sesión/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await usuario.click(boton);
    soltar();
    await screen.findByRole('heading', { level: 1, name: 'Entrenar' });
    expect(api.peticiones.filter((p) => p.ruta === '/auth/login')).toHaveLength(1);
  });

  it('avisa si no hay conexión con el servidor', async () => {
    const { usuario } = iniciar('/login');
    await tituloLogin();
    api.fetchFalso.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await rellenarLogin(usuario, ANA.email, CONTRASENA);
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
  });
});

describe('T024: registro', () => {
  const tituloRegistro = () => screen.findByRole('heading', { level: 1, name: 'Crear cuenta' });

  it('ofrece los campos del contrato, la regla de longitud y enlace para iniciar sesión', async () => {
    iniciar('/registro');
    await tituloRegistro();
    expect(campoContrasena()).toHaveAttribute('autocomplete', 'new-password');
    expect(campoContrasena()).toHaveAccessibleDescription('Entre 8 y 128 caracteres.');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it.each([
    ['7 caracteres', 'ana@example.invalid', 'x'.repeat(7), 'Contraseña', /entre 8 y 128/i],
    ['129 caracteres', 'ana@example.invalid', 'x'.repeat(129), 'Contraseña', /entre 8 y 128/i],
    ['email inválido', 'ana', 'x'.repeat(8), 'Correo electrónico', /correo electrónico válido/i],
  ])('rechaza en el cliente %s con el esquema compartido', async (_caso, email, contrasena, campo, mensaje) => {
    const { usuario } = iniciar('/registro');
    await tituloRegistro();
    await usuario.type(campoEmail(), email);
    await usuario.click(campoContrasena());
    await usuario.paste(contrasena);
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const control = screen.getByLabelText(campo);
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription(mensaje);
    if (campo === 'Contraseña') expect(screen.queryByText('Entre 8 y 128 caracteres.')).not.toBeInTheDocument();
    expect(api.peticiones.some((p) => p.ruta === '/auth/registro')).toBe(false);
  });

  it('crea la cuenta con la zona horaria del dispositivo y entra en la aplicación', async () => {
    const { usuario, router } = iniciar('/registro');
    await tituloRegistro();
    await usuario.type(campoEmail(), 'beto@example.invalid');
    await usuario.type(campoContrasena(), 'x'.repeat(8));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrenar' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/');
    expect(api.peticiones.find((p) => p.ruta === '/auth/registro')?.cuerpo).toEqual({
      email: 'beto@example.invalid', contrasena: 'x'.repeat(8), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it('muestra junto al campo los errores del servidor: 409 EMAIL_EN_USO y 400 VALIDACION', async () => {
    const { usuario } = iniciar('/registro');
    await tituloRegistro();
    await usuario.type(campoEmail(), ANA.email);
    await usuario.type(campoContrasena(), CONTRASENA);
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(campoEmail()).toHaveAccessibleDescription('Ese email ya está registrado.'));
    expect(campoEmail()).toHaveFocus();

    await usuario.clear(campoEmail());
    await usuario.type(campoEmail(), 'rechazado@example.invalid');
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(campoContrasena()).toHaveAttribute('aria-invalid', 'true'));
    expect(campoContrasena()).toHaveAccessibleDescription(/valor inválido/i);
    expect(campoEmail()).not.toHaveAttribute('aria-invalid');
  });
});

describe('T024: cierre y cambio de sesión', () => {
  it('cierra sesión desde Cuenta, vacía los datos y bloquea volver a las páginas privadas', async () => {
    const { usuario, router } = iniciar('/cuenta', true);
    const limpieza = vi.fn();
    const quitar = registrarLimpiezaDeSesion(limpieza);
    cliente.setQueryData(['ejercicios'], [{ id: 'dato-de-ana' }]);
    const cuenta = await screen.findByRole('main');
    expect(within(cuenta).getByText(ANA.email)).toBeInTheDocument();

    await usuario.click(within(cuenta).getByRole('button', { name: 'Cerrar sesión' }));

    expect(await tituloLogin()).toHaveFocus();
    expect(api.peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/auth/logout')).toBe(true);
    expect(cliente.getQueryData(['ejercicios'])).toBeUndefined();
    expect(limpieza).toHaveBeenCalledTimes(1);
    await router.navigate('/');
    expect(await tituloLogin()).toBeInTheDocument();
    quitar();
  });

  it('al caducar la sesión vuelve a /login sin conservar datos del usuario anterior', async () => {
    const { router } = iniciar('/progreso', true);
    await screen.findByRole('heading', { level: 1, name: 'Progreso' });
    const limpieza = vi.fn();
    const quitar = registrarLimpiezaDeSesion(limpieza);
    cliente.setQueryData(['entrenamiento'], { id: 'dato-de-ana' });
    api.caducarSesion();

    await cliente.fetchQuery({ queryKey: ['privado'], queryFn: () => solicitar('/entrenamientos/en-curso') }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(ErrorApi);
    });

    expect(await tituloLogin()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(cliente.getQueryData(['entrenamiento'])).toBeUndefined();
    expect(limpieza).toHaveBeenCalled();
    quitar();
  });

  it('nunca guarda contraseñas ni tokens en el almacenamiento del navegador', async () => {
    localStorage.clear(); sessionStorage.clear();
    const { usuario } = iniciar('/login');
    await tituloLogin();
    await rellenarLogin(usuario, ANA.email, CONTRASENA);
    await screen.findByRole('heading', { level: 1, name: 'Entrenar' });
    const guardado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(guardado).not.toContain(CONTRASENA);
    expect(guardado).not.toMatch(/gt_sesion|token/i);
  });
});
