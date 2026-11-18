import { normalizarNombre } from '@gymtrack/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';

// Pruebas de T025 que complementan la aceptación de interfaz de T014 (catalogo.test.tsx):
// teclado y foco del diálogo, estado sin entrenamiento, elegir existente, errores del servidor y de red.

const ENTRENAMIENTO_ID = '20000000-0000-4000-8000-000000000251';
const CATALOGO = [
  { id: '25000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null },
  { id: '25000000-0000-4000-8000-000000000002', nombre: 'Elevación lateral', grupoMuscular: 'hombros', propio: false, ultimoUso: null },
  { id: '25000000-0000-4000-8000-000000000003', nombre: 'Mi remo', grupoMuscular: 'espalda', propio: true, ultimoUso: null },
];

interface Opciones {
  enCurso?: boolean;
  /** Ejercicio que el servidor conoce pero no devuelve en la búsqueda (p. ej., fuera del límite). */
  oculto?: { id: string; nombre: string; grupoMuscular: string; propio: boolean; ultimoUso: null };
  sinRedAlBuscar?: boolean;
}

function iniciar({ enCurso = true, oculto, sinRedAlBuscar = false }: Opciones = {}) {
  const peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
  let fallarBusqueda = sinRedAlBuscar;
  const json = (status: number, cuerpo?: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'https://localhost');
    const ruta = url.pathname.replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    peticiones.push({ metodo, ruta, cuerpo });
    if (ruta === '/auth/yo') return json(200, { id: '00000000-0000-4000-8000-000000000251', email: 't025@example.invalid', unidadPeso: 'kg', zonaHoraria: 'UTC' });
    if (ruta === '/entrenamientos/en-curso') {
      return enCurso
        ? json(200, { id: ENTRENAMIENTO_ID, estado: 'en_curso', inicio: '2026-11-14T18:00:00Z', fin: null, zonaHoraria: 'UTC', nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [], resumen: { ejercicios: 0, series: 0, volumenKg: 0, duracionMin: null } })
        : json(204);
    }
    if (metodo === 'GET' && ruta === '/ejercicios') {
      if (fallarBusqueda) throw new TypeError('Failed to fetch');
      const q = normalizarNombre(url.searchParams.get('q') ?? '');
      return json(200, CATALOGO.filter((e) => normalizarNombre(e.nombre).includes(q)));
    }
    if (metodo === 'POST' && ruta === '/ejercicios') {
      const { nombre } = cuerpo as { nombre: string };
      if (oculto && normalizarNombre(oculto.nombre) === normalizarNombre(nombre)) {
        return json(409, { codigo: 'EJERCICIO_DUPLICADO', mensaje: 'Ya existe.', campos: null, actual: oculto });
      }
      return json(201, { id: '25000000-0000-4000-8000-000000000099', nombre, grupoMuscular: 'pecho', propio: true, ultimoUso: null });
    }
    if (metodo === 'PATCH' && ruta.startsWith('/ejercicios/')) {
      return json(409, { codigo: 'EJERCICIO_DUPLICADO', mensaje: 'Ya existe.', campos: null, actual: CATALOGO[0] });
    }
    if (metodo === 'POST' && ruta === `/entrenamientos/${ENTRENAMIENTO_ID}/ejercicios`) {
      const { id, ejercicioId, posicion } = cuerpo as { id: string; ejercicioId: string; posicion: number };
      const nombre = [...CATALOGO, ...(oculto ? [oculto] : [])].find((e) => e.id === ejercicioId)?.nombre;
      return json(201, { id, ejercicioId, nombre, posicion, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] });
    }
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado.', campos: null, actual: null });
  }));
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/'] })} /></Proveedores>);
  return { usuario: userEvent.setup(), peticiones, recuperarRed: () => { fallarBusqueda = false; } };
}

async function abrir(usuario: ReturnType<typeof userEvent.setup>) {
  const boton = await screen.findByRole('button', { name: 'Añadir ejercicio' });
  await usuario.click(boton);
  return { boton, selector: await screen.findByRole('dialog', { name: 'Elegir ejercicio' }) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('T025: entrenamiento en curso', () => {
  it('pide la lista completa para poder recorrer todo el catálogo sin buscar', async () => {
    const { usuario, peticiones } = iniciar();
    await abrir(usuario);
    await waitFor(() => expect(peticiones.some((p) => p.ruta === '/ejercicios')).toBe(true));
    expect(peticiones.filter((p) => p.ruta === '/ejercicios').every((p) => p.cuerpo === undefined)).toBe(true);
    const consulta = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([u]) => String(u)).find((u) => u.includes('/ejercicios'));
    expect(new URL(consulta ?? '', 'https://localhost').searchParams.get('limite')).toBe('100');
  });


  it('sin entrenamiento en curso muestra un estado vacío sin ofrecer añadir ejercicios', async () => {
    iniciar({ enCurso: false });
    expect(await screen.findByText('No tienes un entrenamiento en curso.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Entrenar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir ejercicio' })).not.toBeInTheDocument();
  });

  it('elegir un ejercicio existente lo añade al entrenamiento y cierra el selector', async () => {
    const { usuario, peticiones } = iniciar();
    const { selector } = await abrir(usuario);
    await usuario.click(await within(selector).findByRole('button', { name: /^elevación lateral/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 3, name: 'Elevación lateral' })).toBeInTheDocument();
    expect(peticiones.find((p) => p.ruta === `/entrenamientos/${ENTRENAMIENTO_ID}/ejercicios`)?.cuerpo)
      .toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), ejercicioId: CATALOGO[1].id, posicion: 1 });
  });
});

describe('T025: teclado y foco del selector', () => {
  it('Escape cierra el selector y devuelve el foco a «Añadir ejercicio»', async () => {
    const { usuario } = iniciar();
    const { boton } = await abrir(usuario);
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('el foco no sale del selector al tabular y el botón de cerrar lo cierra', async () => {
    const { usuario } = iniciar();
    const { selector } = await abrir(usuario);
    await within(selector).findByRole('button', { name: /^press de banca/i });
    for (let i = 0; i < 12; i++) {
      await usuario.tab();
      expect(selector.contains(document.activeElement)).toBe(true);
    }
    await usuario.click(within(selector).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('T025: foco tras acciones dentro del selector', () => {
  it('tras cancelar un renombrado el foco vuelve a su botón y Escape sigue cerrando el selector', async () => {
    const { usuario } = iniciar();
    const { selector, boton } = await abrir(usuario);
    await usuario.click(await within(selector).findByRole('button', { name: 'Renombrar Mi remo' }));
    await usuario.click(within(selector).getByRole('button', { name: 'Cancelar' }));
    expect(within(selector).getByRole('button', { name: 'Renombrar Mi remo' })).toHaveFocus();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('tras cancelar un borrado el foco vuelve a su botón', async () => {
    const { usuario } = iniciar();
    const { selector } = await abrir(usuario);
    await usuario.click(await within(selector).findByRole('button', { name: 'Eliminar Mi remo' }));
    await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(within(selector).getByRole('button', { name: 'Eliminar Mi remo' })).toHaveFocus();
  });

  it('si el foco queda fuera del diálogo, Escape lo cierra igualmente', async () => {
    const { usuario } = iniciar();
    await abrir(usuario);
    (document.activeElement as HTMLElement | null)?.blur();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('T025: errores', () => {
  it('si el servidor detecta un duplicado, sugiere usar el existente y lo añade', async () => {
    const oculto = { id: '25000000-0000-4000-8000-000000000050', nombre: 'Sentadilla búlgara', grupoMuscular: 'cuadriceps', propio: false, ultimoUso: null };
    const { usuario, peticiones } = iniciar({ oculto });
    const { selector } = await abrir(usuario);
    await usuario.type(within(selector).getByLabelText('Buscar ejercicio'), 'sentadilla bulgara');
    await usuario.click(await within(selector).findByRole('button', { name: /crear.*sentadilla bulgara/i }));
    await usuario.selectOptions(within(selector).getByLabelText('Grupo muscular'), 'cuadriceps');
    await usuario.click(within(selector).getByRole('button', { name: /^guardar/i }));
    const aviso = await within(selector).findByRole('alert');
    expect(aviso).toHaveTextContent('Sentadilla búlgara');
    await usuario.click(within(aviso).getByRole('button', { name: 'Usar «Sentadilla búlgara»' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Sentadilla búlgara' })).toBeInTheDocument();
    expect(peticiones.find((p) => p.ruta === `/entrenamientos/${ENTRENAMIENTO_ID}/ejercicios`)?.cuerpo).toMatchObject({ ejercicioId: oculto.id });
  });

  it('exige elegir el grupo muscular antes de crear', async () => {
    const { usuario, peticiones } = iniciar();
    const { selector } = await abrir(usuario);
    await usuario.type(within(selector).getByLabelText('Buscar ejercicio'), 'Press Hammer');
    await usuario.click(await within(selector).findByRole('button', { name: /crear.*press hammer/i }));
    await usuario.click(within(selector).getByRole('button', { name: /^guardar/i }));
    expect(within(selector).getByLabelText('Grupo muscular')).toHaveAccessibleDescription(/elige el grupo muscular/i);
    expect(peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/ejercicios')).toBe(false);
  });

  it('avisa sin conexión al buscar y permite reintentar', async () => {
    const { usuario, recuperarRed } = iniciar({ sinRedAlBuscar: true });
    const { selector } = await abrir(usuario);
    expect(await within(selector).findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    recuperarRed();
    await usuario.click(within(selector).getByRole('button', { name: 'Reintentar' }));
    expect(await within(selector).findByRole('button', { name: /^press de banca/i })).toBeInTheDocument();
  });

  it('al renombrar a un nombre existente muestra el error junto al campo y conserva el nombre', async () => {
    const { usuario } = iniciar();
    const { selector } = await abrir(usuario);
    await usuario.click(await within(selector).findByRole('button', { name: 'Renombrar Mi remo' }));
    const campo = within(selector).getByLabelText('Nombre');
    await usuario.clear(campo);
    await usuario.type(campo, 'press de banca');
    await usuario.click(within(selector).getByRole('button', { name: /^guardar/i }));
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'));
    expect(campo).toHaveAccessibleDescription(/ya existe «press de banca»/i);
  });

  it('pide confirmar antes de eliminar y se puede cancelar', async () => {
    const { usuario, peticiones } = iniciar();
    const { selector } = await abrir(usuario);
    await usuario.click(await within(selector).findByRole('button', { name: 'Eliminar Mi remo' }));
    const confirmacion = await screen.findByRole('alertdialog');
    expect(confirmacion).toHaveTextContent('Mi remo');
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(within(selector).getByText('Mi remo')).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === 'DELETE')).toBe(false);
  });
});
