import { normalizarNombre } from '@gymtrack/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';

// Aceptación de interfaz de T014 (rojo hasta T025). Se renderiza la aplicación real y solo se
// sustituye la red por una API en memoria que responde según contracts/api.md.

interface EjercicioApi { id: string; nombre: string; grupoMuscular: string; propio: boolean; ultimoUso: string | null }
interface Peticion { metodo: string; ruta: string; query: URLSearchParams; cuerpo: unknown }

const ENTRENAMIENTO_ID = '20000000-0000-4000-8000-000000000141';
const EN_USO = '14000000-0000-4000-8000-000000000012';

function ejerciciosIniciales(): EjercicioApi[] {
  return [
    { id: '14000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null },
    { id: '14000000-0000-4000-8000-000000000002', nombre: 'Remo con barra', grupoMuscular: 'espalda', propio: false, ultimoUso: '2026-11-05T18:00:00Z' },
    { id: '14000000-0000-4000-8000-000000000003', nombre: 'Elevación lateral', grupoMuscular: 'hombros', propio: false, ultimoUso: null },
    { id: '14000000-0000-4000-8000-000000000011', nombre: 'Mi remo libre', grupoMuscular: 'espalda', propio: true, ultimoUso: null },
    { id: EN_USO, nombre: 'Mi press', grupoMuscular: 'pecho', propio: true, ultimoUso: '2026-11-08T18:00:00Z' },
  ];
}

/** Recientes primero (último uso descendente) y después alfabéticamente, como el contrato. */
function ordenar(lista: EjercicioApi[]) {
  return [...lista].sort((a, b) => (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? '') || a.nombre.localeCompare(b.nombre, 'es'));
}

function crearApi() {
  let ejercicios = ejerciciosIniciales();
  const peticiones: Peticion[] = [];
  const json = (status: number, cuerpo: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
  });
  const error = (status: number, codigo: string, actual: unknown = null) => json(status, { codigo, mensaje: 'Error simulado.', campos: null, actual });

  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'https://localhost');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const ruta = url.pathname.replace(/^\/api/, '');
    peticiones.push({ metodo, ruta, query: url.searchParams, cuerpo });
    const idEjercicio = /^\/ejercicios\/([^/]+)$/.exec(ruta)?.[1];

    if (metodo === 'GET' && ruta === '/auth/yo') {
      return json(200, { id: '00000000-0000-4000-8000-000000000141', email: 't014@example.invalid', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' });
    }
    if (metodo === 'GET' && ruta === '/entrenamientos/en-curso') {
      return json(200, {
        id: ENTRENAMIENTO_ID, estado: 'en_curso', inicio: '2026-11-13T18:00:00Z', fin: null, zonaHoraria: 'America/Bogota', nota: null,
        rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [], resumen: { ejercicios: 0, series: 0, volumenKg: 0, duracionMin: null },
      });
    }
    if (metodo === 'GET' && ruta === '/ejercicios') {
      const q = normalizarNombre(url.searchParams.get('q') ?? '');
      const limite = Number(url.searchParams.get('limite') ?? 20);
      return json(200, ordenar(ejercicios).filter((e) => normalizarNombre(e.nombre).includes(q)).slice(0, limite));
    }
    if (metodo === 'POST' && ruta === '/ejercicios') {
      const { nombre, grupoMuscular } = cuerpo as { nombre: string; grupoMuscular: string };
      const existente = ejercicios.find((e) => normalizarNombre(e.nombre) === normalizarNombre(nombre));
      if (existente) return error(409, 'EJERCICIO_DUPLICADO', existente);
      const nuevo = { id: '14000000-0000-4000-8000-000000000099', nombre: nombre.trim(), grupoMuscular, propio: true, ultimoUso: null };
      ejercicios.push(nuevo);
      return json(201, nuevo);
    }
    if (idEjercicio && metodo === 'GET') return error(404, 'NO_ENCONTRADO');
    if (idEjercicio && (metodo === 'PATCH' || metodo === 'DELETE')) {
      const ejercicio = ejercicios.find((e) => e.id === idEjercicio && e.propio);
      if (!ejercicio) return error(404, 'NO_ENCONTRADO');
      if (metodo === 'DELETE') {
        if (ejercicio.id === EN_USO) return error(409, 'EJERCICIO_EN_USO', { entrenamientos: 7, rutinas: ['Pecho y tríceps'] });
        ejercicios = ejercicios.filter((e) => e.id !== idEjercicio);
        return json(204, undefined);
      }
      Object.assign(ejercicio, cuerpo);
      return json(200, ejercicio);
    }
    if (metodo === 'GET' && /^\/ejercicios\/[^/]+\/ultima-sesion$/.test(ruta)) return json(200, null);
    if (metodo === 'POST' && ruta === `/entrenamientos/${ENTRENAMIENTO_ID}/ejercicios`) {
      const { id, ejercicioId, posicion } = cuerpo as { id: string; ejercicioId: string; posicion: number };
      const ejercicio = ejercicios.find((e) => e.id === ejercicioId);
      return json(201, { id, ejercicioId, nombre: ejercicio?.nombre, posicion, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] });
    }
    return error(404, 'NO_ENCONTRADO');
  });

  return { fetchFalso, peticiones };
}

let api: ReturnType<typeof crearApi>;

beforeEach(() => {
  api = crearApi();
  vi.stubGlobal('fetch', api.fetchFalso);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Abre el selector de ejercicios desde el entrenamiento en curso. */
async function abrirSelector() {
  const usuario = userEvent.setup();
  const router = createMemoryRouter(rutas, { initialEntries: ['/'] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  await usuario.click(await screen.findByRole('button', { name: /añadir ejercicio/i }));
  const selector = await screen.findByRole('dialog');
  const buscador = within(selector).getByLabelText(/buscar ejercicio/i);
  return { usuario, selector, buscador };
}

/** Nombres visibles en el orden en que aparecen en pantalla. */
function ordenVisible(contenedor: HTMLElement, nombres: string[]) {
  return nombres
    .map((nombre) => ({ nombre, nodo: within(contenedor).getByText(nombre) }))
    .sort((a, b) => (a.nodo.compareDocumentPosition(b.nodo) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(({ nombre }) => nombre);
}

describe('T014: aceptación de interfaz del selector de ejercicios', () => {
  it('abre un selector accesible con el buscador enfocado y los recientes primero', async () => {
    const { selector, buscador } = await abrirSelector();

    expect(buscador).toHaveFocus();
    expect(buscador).toHaveClass('min-h-11');
    await waitFor(() => expect(within(selector).getByText('Press de banca')).toBeInTheDocument());
    expect(ordenVisible(selector, ['Press de banca', 'Remo con barra', 'Elevación lateral', 'Mi press'])).toEqual(
      ['Mi press', 'Remo con barra', 'Elevación lateral', 'Press de banca'],
    );
    expect(api.peticiones.some((p) => p.metodo === 'GET' && p.ruta === '/ejercicios' && !p.query.get('q'))).toBe(true);
  });

  it('filtra sin distinguir mayúsculas ni tildes', async () => {
    const { usuario, selector, buscador } = await abrirSelector();

    await usuario.type(buscador, 'ELEVACION');

    await waitFor(() => expect(within(selector).queryByText('Press de banca')).not.toBeInTheDocument());
    expect(within(selector).getByText('Elevación lateral')).toBeInTheDocument();
  });

  it('sugiere el ejercicio existente en vez de crear un duplicado', async () => {
    const { usuario, selector, buscador } = await abrirSelector();

    await usuario.type(buscador, 'press de BANCA');

    await waitFor(() => expect(within(selector).getByText('Press de banca')).toBeInTheDocument());
    expect(within(selector).queryByRole('button', { name: /crear/i })).not.toBeInTheDocument();
    expect(api.peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/ejercicios')).toBe(false);
  });

  it('crea un ejercicio propio y lo añade de inmediato al entrenamiento', async () => {
    const { usuario, selector, buscador } = await abrirSelector();

    await usuario.type(buscador, 'Press Hammer');
    await usuario.click(await within(selector).findByRole('button', { name: /crear.*press hammer/i }));
    await usuario.selectOptions(within(selector).getByLabelText(/grupo muscular/i), 'pecho');
    await usuario.click(within(selector).getByRole('button', { name: /^guardar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.peticiones.find((p) => p.metodo === 'POST' && p.ruta === '/ejercicios')?.cuerpo).toEqual({ nombre: 'Press Hammer', grupoMuscular: 'pecho' });
    expect(await screen.findByRole('heading', { name: 'Press Hammer' })).toBeInTheDocument();
    await waitFor(() => expect(api.peticiones.find((p) => p.metodo === 'POST' && p.ruta === `/entrenamientos/${ENTRENAMIENTO_ID}/ejercicios`)?.cuerpo)
      .toMatchObject({ ejercicioId: '14000000-0000-4000-8000-000000000099' }));
  });

  it('renombra un ejercicio propio y no ofrece editar los del catálogo', async () => {
    const { usuario, selector } = await abrirSelector();

    await usuario.click(await within(selector).findByRole('button', { name: /renombrar mi remo libre/i }));
    const nombre = within(selector).getByLabelText(/^nombre/i);
    await usuario.clear(nombre);
    await usuario.type(nombre, 'Mi remo en máquina');
    await usuario.click(within(selector).getByRole('button', { name: /^guardar/i }));

    expect(await within(selector).findByText('Mi remo en máquina')).toBeInTheDocument();
    expect(api.peticiones.find((p) => p.metodo === 'PATCH')).toMatchObject({ ruta: '/ejercicios/14000000-0000-4000-8000-000000000011', cuerpo: { nombre: 'Mi remo en máquina' } });
    expect(within(selector).queryByRole('button', { name: /renombrar press de banca/i })).not.toBeInTheDocument();
    expect(within(selector).queryByRole('button', { name: /eliminar press de banca/i })).not.toBeInTheDocument();
  });

  it('explica por qué no se puede eliminar un ejercicio en uso y lo conserva', async () => {
    const { usuario, selector } = await abrirSelector();

    await usuario.click(await within(selector).findByRole('button', { name: /eliminar mi press/i }));
    await confirmarSiSePide(usuario);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/7 entrenamientos/i);
    expect(aviso).toHaveTextContent('Pecho y tríceps');
    expect(within(selector).getByText('Mi press')).toBeInTheDocument();
  });

  it('elimina un ejercicio propio sin uso', async () => {
    const { usuario, selector } = await abrirSelector();

    await usuario.click(await within(selector).findByRole('button', { name: /eliminar mi remo libre/i }));
    await confirmarSiSePide(usuario);

    await waitFor(() => expect(within(selector).queryByText('Mi remo libre')).not.toBeInTheDocument());
    expect(api.peticiones.some((p) => p.metodo === 'DELETE' && p.ruta === '/ejercicios/14000000-0000-4000-8000-000000000011')).toBe(true);
  });
});

/** La spec no exige confirmar el borrado de ejercicios; si la interfaz lo pide, se confirma. */
async function confirmarSiSePide(usuario: ReturnType<typeof userEvent.setup>) {
  const confirmacion = await screen.findByRole('alertdialog', {}, { timeout: 300 }).catch(() => null);
  if (confirmacion) await usuario.click(within(confirmacion).getByRole('button', { name: /eliminar/i }));
}
