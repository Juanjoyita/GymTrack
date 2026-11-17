import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { CONTRASENA, PRESS, instalarApi, reiniciarServidor, servidor, usuario, type EntrenamientoApi } from './utils/api-entrenamiento';

// T049: Cuenta (FR-024 a FR-026) y recuperación (FR-001), con la API en memoria de
// test/utils/api-entrenamiento.ts y los contratos de contracts/api.md («Autenticación y cuenta»).

const W1 = '49000000-0000-4000-8000-000000000001';
const pasado = (pesoKg: number): EntrenamientoApi => ({
  id: W1, estado: 'finalizado', inicio: '2026-11-02T18:00:00.000Z', fin: '2026-11-02T19:00:00.000Z', zonaHoraria: 'America/Bogota', nota: null, rutinaOrigenId: null, inactivo: false, version: 1,
  ejercicios: [{
    id: '49000000-0000-4000-8000-0000000000e1', ejercicioId: PRESS.id, nombre: PRESS.nombre, posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1,
    series: [{ id: '49000000-0000-4000-8000-0000000000s1', orden: 1, repeticiones: 8, pesoKg, registradaEn: '2026-11-02T18:01:00.000Z', version: 1 }],
  }],
});

let router: ReturnType<typeof createMemoryRouter>;
function abrir(ruta = '/cuenta') {
  router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<Proveedores><RouterProvider router={router} /></Proveedores>);
  return userEvent.setup();
}
const ir = (ruta: string) => act(async () => { await router.navigate(ruta); });
const patches = () => servidor.peticiones.filter((p) => p.metodo === 'PATCH' && p.ruta === '/cuenta/preferencias').map((p) => p.cuerpo);

beforeEach(() => {
  localStorage.clear();
  reiniciarServidor();
  instalarApi();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('T049: preferencias de unidad de peso (FR-024)', () => {
  it('muestra la unidad actual, un ejemplo convertido con el dominio y mantiene el cierre de sesión', async () => {
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument();
    const unidad = await screen.findByRole('combobox', { name: 'Unidad de peso' });
    expect(unidad).toHaveValue('kg');
    expect(screen.getByText(/100 kg = 220,46 lb/)).toBeInTheDocument();
    expect(screen.getByText(/tus pesos guardados no cambian/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('guarda solo la unidad (sin tocar la zona horaria), confirma y la aplica en toda la app sin cambiar los pesos guardados', async () => {
    servidor.pasados = [pasado(60)];
    const u = abrir();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Unidad de peso' }), 'lb');
    await u.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(await screen.findByText('Preferencias guardadas.')).toHaveAttribute('role', 'status');
    expect(patches()).toEqual([{ unidadPeso: 'lb' }]);
    expect(usuario.zonaHoraria).toBe('America/Bogota');
    expect(JSON.parse(localStorage.getItem('gymtrack:ultima-sesion')!)).toMatchObject({ unidadPeso: 'lb' });

    // Historial (detalle y lista) y Progreso muestran lb; el dato guardado sigue en kg.
    await ir(`/historial/${W1}`);
    expect(await screen.findByText('132,28 lb × 8')).toBeInTheDocument();
    await ir('/historial');
    expect(await screen.findByText(/1058,2 lb/)).toBeInTheDocument();
    await ir('/progreso');
    expect(await screen.findByRole('columnheader', { name: 'Peso máximo (lb)' })).toBeInTheDocument();
    expect(servidor.pasados[0].ejercicios[0].series[0].pesoKg).toBe(60);
  });

  it('al editar una serie en Historial con lb, el formulario usa lb y envía la unidad elegida', async () => {
    servidor.pasados = [pasado(60)];
    usuario.unidadPeso = 'lb';
    const u = abrir(`/historial/${W1}`);
    // Sesión y detalle se cargan en cadena: con la suite en paralelo puede pasar de 1 s.
    await u.click(await screen.findByRole('button', { name: 'Editar serie 1' }, { timeout: 3000 }));
    const peso = screen.getByLabelText('Peso (lb)');
    expect(peso).toHaveValue('132.28');
    await u.clear(peso); await u.type(peso, '135');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(servidor.peticiones.find((p) => p.metodo === 'PATCH' && p.ruta.includes('/series/'))?.cuerpo)
      .toMatchObject({ pesoEntrada: { valor: 135, unidad: 'lb' }, repeticiones: 8 }));
  });

  it('si falla al guardar lo explica, conserva la elección y no cambia la unidad de la app', async () => {
    servidor.cuentaFalla = true;
    const u = abrir();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Unidad de peso' }), 'lb');
    await u.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron guardar las preferencias.');
    expect(screen.getByRole('combobox', { name: 'Unidad de peso' })).toHaveValue('lb');
    expect(usuario.unidadPeso).toBe('kg');
    expect(screen.getByText(/100 kg = 220,46 lb/)).toBeInTheDocument();
  });

  it('sin conexión dice que no hay conexión', async () => {
    const u = abrir();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Unidad de peso' }), 'lb');
    servidor.sinRed = true;
    await u.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
  });

  it('el selector tiene etiqueta y tamaño táctil', async () => {
    abrir();
    const unidad = await screen.findByRole('combobox', { name: 'Unidad de peso' });
    expect(unidad.className).toMatch(/min-h-11/);
    expect(within(unidad).getAllByRole('option').map((o) => o.textContent)).toEqual(['Kilogramos (kg)', 'Libras (lb)']);
  });
});

describe('T049: exportación de datos en JSON y CSV (FR-025)', () => {
  let descargas: { nombre: string; href: string }[];
  let blobs: Map<string, Blob>;
  beforeEach(() => {
    descargas = [];
    blobs = new Map();
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { const href = `blob:gymtrack/${++n}`; blobs.set(href, blob); return href; }),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push({ nombre: this.download, href: this.href });
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['JSON', 'CSV'] as const)('descarga %s con el nombre que da el servidor y el contenido íntegro', async (formato) => {
    servidor.pasados = [pasado(60)];
    const u = abrir();
    await u.click(await screen.findByRole('button', { name: `Exportar ${formato}` }));
    await waitFor(() => expect(descargas).toHaveLength(1));
    const extension = formato.toLowerCase();
    expect(descargas[0].nombre).toBe(`gymtrack-2026-11-16.${extension}`);
    expect(servidor.peticiones.some((p) => p.ruta === `/exportacion?formato=${extension}`)).toBe(true);
    const contenido = await blobs.get(descargas[0].href)!.text();
    if (formato === 'JSON') expect(JSON.parse(contenido).entrenamientos[0].id).toBe(W1);
    else expect(contenido.split('\r\n')[1]).toBe('2026-11-02,Press de banca,1,8,60');
    expect(await screen.findByText(`Descarga lista: gymtrack-2026-11-16.${extension}`)).toHaveAttribute('role', 'status');
    // El enlace temporal se libera.
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(descargas[0].href));
  });

  it('si el servidor falla no descarga nada y lo explica', async () => {
    servidor.cuentaFalla = true;
    const u = abrir();
    await u.click(await screen.findByRole('button', { name: 'Exportar JSON' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron exportar tus datos. Inténtalo de nuevo.');
    expect(descargas).toHaveLength(0);
  });

  it('sin conexión no descarga y dice que no hay conexión', async () => {
    const u = abrir();
    const boton = await screen.findByRole('button', { name: 'Exportar CSV' });
    servidor.sinRed = true;
    await u.click(boton);
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    expect(descargas).toHaveLength(0);
  });
});

describe('T049: eliminar la cuenta (FR-026)', () => {
  const clavesDe = (id: string) => [`gymtrack:cola:${id}`, `gymtrack:entrenamiento:${id}`];
  const OTRO = '00000000-0000-4000-8000-0000000000aa';

  async function abrirDialogo(u: ReturnType<typeof userEvent.setup>) {
    await u.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    return screen.findByRole('dialog', { name: '¿Eliminar tu cuenta?' });
  }

  it('pide confirmación explícita: el diálogo explica qué se borra y cancelar no hace nada', async () => {
    const u = abrir();
    const dialogo = await abrirDialogo(u);
    expect(dialogo).toHaveTextContent(/se eliminarán de forma permanente tu cuenta, tus entrenamientos, series, ejercicios propios y rutinas/i);
    expect(within(dialogo).getByLabelText('Contraseña')).toHaveFocus();
    expect(within(dialogo).getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar cuenta' })).toHaveFocus();
    expect(servidor.peticiones.some((p) => p.ruta === '/cuenta')).toBe(false);
  });

  it('sin contraseña no envía nada', async () => {
    const u = abrir();
    const dialogo = await abrirDialogo(u);
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar definitivamente' }));
    expect(await within(dialogo).findByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(servidor.peticiones.some((p) => p.ruta === '/cuenta')).toBe(false);
  });

  it('con una contraseña incorrecta (401) lo indica junto al campo y conserva la sesión y los datos locales', async () => {
    const u = abrir();
    const dialogo = await abrirDialogo(u);
    await screen.findByText(/sesión iniciada como/i);
    for (const clave of clavesDe(usuario.id)) localStorage.setItem(clave, 'null');
    await u.type(within(dialogo).getByLabelText('Contraseña'), 'incorrecta-123');
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar definitivamente' }));
    expect(await within(dialogo).findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Contraseña')).toHaveFocus();
    expect(servidor.cuentaEliminada).toBe(false);
    for (const clave of [...clavesDe(usuario.id), 'gymtrack:ultima-sesion']) expect(localStorage.getItem(clave)).not.toBeNull();
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument();
  });

  it('si falla la red no borra nada', async () => {
    const u = abrir();
    const dialogo = await abrirDialogo(u);
    await u.type(within(dialogo).getByLabelText('Contraseña'), CONTRASENA);
    servidor.sinRed = true;
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar definitivamente' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    expect(localStorage.getItem('gymtrack:ultima-sesion')).not.toBeNull();
  });

  it('tras el 204 olvida la sesión, la caché y los datos locales del usuario (no los de otros) y no reenvía lo pendiente', async () => {
    // Un cambio pendiente sin red: iniciar un entrenamiento.
    const u = abrir('/');
    await screen.findByRole('button', { name: 'Iniciar entrenamiento' });
    servidor.sinRed = true;
    await u.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));
    expect(await screen.findByText('1 cambio pendiente de sincronizar')).toBeInTheDocument();
    localStorage.setItem(`gymtrack:cola:${OTRO}`, '{"pendientes":[],"conflictos":[]}');
    localStorage.setItem(`gymtrack:entrenamiento:${OTRO}`, 'null');

    await act(async () => { await router.navigate('/cuenta'); });
    servidor.sinRed = false;
    const dialogo = await abrirDialogo(u);
    expect(dialogo).toHaveTextContent('Tienes 1 cambio sin sincronizar que también se perderá.');
    await u.type(within(dialogo).getByLabelText('Contraseña'), CONTRASENA);
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar definitivamente' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(servidor.peticiones.find((p) => p.metodo === 'DELETE' && p.ruta === '/cuenta')?.cuerpo).toEqual({ contrasena: CONTRASENA });
    for (const clave of [...clavesDe(usuario.id), 'gymtrack:ultima-sesion']) expect(localStorage.getItem(clave)).toBeNull();
    expect(localStorage.getItem(`gymtrack:cola:${OTRO}`)).not.toBeNull();
    expect(localStorage.getItem(`gymtrack:entrenamiento:${OTRO}`)).not.toBeNull();

    // Aunque vuelva la conexión, lo pendiente del usuario eliminado no se envía.
    const antes = servidor.peticiones.length;
    await act(async () => { window.dispatchEvent(new Event('online')); await new Promise((r) => setTimeout(r, 50)); });
    expect(servidor.peticiones.slice(antes).filter((p) => p.ruta.startsWith('/entrenamientos'))).toEqual([]);
    expect(localStorage.getItem(clavesDe(usuario.id)[0])).toBeNull();
  });
});
