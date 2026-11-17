import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { PRESS, REMO, SENTADILLA, instalarApi, reiniciarServidor, servidor, type RutinaApi } from './utils/api-entrenamiento';

// T055: rutinas (FR-028 a FR-030; contracts/api.md «Rutinas — P5»). API en memoria con estado:
// test/utils/api-entrenamiento.ts. Los nombres de controles siguen el E2E de T051.

const rutina = (id: string, nombre: string, diaSemana: number, ejercicios: { id: string; nombre: string }[], version = 1): RutinaApi => ({
  id, nombre, diaSemana, version, ejercicios: ejercicios.map((e, i) => ({ posicion: i + 1, ejercicioId: e.id, nombre: e.nombre })),
});
const R1 = '55000000-0000-4000-8000-000000000001';
const R2 = '55000000-0000-4000-8000-000000000002';
const R3 = '55000000-0000-4000-8000-000000000003';
/** Día ISO de hoy (1 = lunes … 7 = domingo). */
const hoy = () => ((new Date().getDay() + 6) % 7) + 1;
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

let router: ReturnType<typeof createMemoryRouter>;
function abrir(ruta = '/rutinas') {
  router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<Proveedores><RouterProvider router={router} /></Proveedores>);
  return userEvent.setup();
}
const ir = (ruta: string) => act(async () => { await router.navigate(ruta); });
const tarjeta = async (nombre: string) => (await screen.findByRole('heading', { level: 3, name: nombre })).closest('article') as HTMLElement;
const peticiones = (metodo: string, prefijo: string) => servidor.peticiones.filter((p) => p.metodo === metodo && p.ruta.startsWith(prefijo));

beforeEach(() => {
  localStorage.clear();
  reiniciarServidor();
  instalarApi();
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('T055: lista de rutinas', () => {
  it('agrupa por día de la semana en el orden de la API, marca las de hoy y muestra los ejercicios en orden', async () => {
    const otroDia = (hoy() % 7) + 1;
    servidor.rutinas = [
      rutina(R1, 'Pecho', hoy(), [PRESS, REMO]),
      rutina(R2, 'Pierna', otroDia, [SENTADILLA]),
      rutina(R3, 'Espalda', hoy(), [REMO]),
    ];
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rutinas' })).toBeInTheDocument();
    const grupoHoy = (await screen.findByRole('heading', { level: 2, name: new RegExp(`^${DIAS[hoy() - 1]}`) })).closest('section') as HTMLElement;
    expect(within(grupoHoy).getByText('Hoy')).toBeInTheDocument();
    expect(within(grupoHoy).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Espalda', 'Pecho']);
    const grupoOtro = screen.getByRole('heading', { level: 2, name: new RegExp(`^${DIAS[otroDia - 1]}`) }).closest('section') as HTMLElement;
    expect(within(grupoOtro).queryByText('Hoy')).not.toBeInTheDocument();
    const pecho = await tarjeta('Pecho');
    expect(within(pecho).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Press de banca', 'Remo con barra']);
    for (const accion of ['Iniciar', 'Editar', 'Eliminar']) expect(within(pecho).getByRole('button', { name: `${accion} Pecho` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear rutina' })).toBeInTheDocument();
  });

  it('sin rutinas invita a crear la primera', async () => {
    abrir();
    expect(await screen.findByText('Aún no tienes rutinas.')).toBeInTheDocument();
    // Un único botón (el E2E de T051 lo busca en modo estricto).
    expect(screen.getAllByRole('button', { name: 'Crear rutina' })).toHaveLength(1);
  });

  it('si la API falla lo explica y «Reintentar» recupera la lista', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS])];
    servidor.rutinasFallan = true;
    const u = abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus rutinas.');
    servidor.rutinasFallan = false;
    await u.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await tarjeta('Pecho')).toBeInTheDocument();
  });

  it('sin conexión dice que no hay conexión', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'Rutinas' });
    await ir('/');
    servidor.sinRed = true;
    await ir('/rutinas');
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
  });
});

describe('T055: crear una rutina y ordenar sus ejercicios', () => {
  const orden = () => within(screen.getByRole('list', { name: 'Orden de la rutina' })).queryAllByRole('listitem').map((li) => within(li).getByTestId('nombre-ejercicio').textContent);

  async function abrirEditor() {
    const u = abrir();
    await u.click(await screen.findByRole('button', { name: 'Crear rutina' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Nueva rutina' })).toBeInTheDocument();
    await screen.findByRole('checkbox', { name: 'Press de banca' });
    return u;
  }

  it('muestra nombre, día (hoy por defecto) y el catálogo como casillas agrupadas por músculo', async () => {
    await abrirEditor();
    expect(screen.getByLabelText('Nombre de la rutina')).toHaveAttribute('maxlength', '80');
    const dia = screen.getByRole('combobox', { name: 'Día de la semana' });
    expect(dia).toHaveValue(String(hoy()));
    expect(within(dia).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent])).toEqual(DIAS.map((d, i) => [String(i + 1), d]));
    expect(within(screen.getByRole('group', { name: 'Pecho' })).getByRole('checkbox', { name: 'Press de banca' })).not.toBeChecked();
    expect(within(screen.getByRole('group', { name: 'Espalda' })).getByRole('checkbox', { name: 'Remo con barra' })).toBeInTheDocument();
    expect(screen.getByText('Aún no has elegido ejercicios.')).toBeInTheDocument();
  });

  it('valida antes de guardar: nombre y al menos un ejercicio', async () => {
    const u = await abrirEditor();
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    expect(await screen.findByText('Escribe un nombre para la rutina.')).toBeInTheDocument();
    expect(screen.getByText('Elige al menos un ejercicio.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la rutina')).toHaveFocus();
    expect(peticiones('POST', '/rutinas')).toHaveLength(0);
  });

  it('el orden es el de marcado y se cambia con Subir, Bajar y Quitar, conservando el foco', async () => {
    const u = await abrirEditor();
    for (const nombre of ['Remo con barra', 'Press de banca', 'Sentadilla']) await u.click(screen.getByRole('checkbox', { name: nombre }));
    expect(orden()).toEqual(['Remo con barra', 'Press de banca', 'Sentadilla']);
    expect(screen.getByRole('button', { name: 'Subir Remo con barra' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Sentadilla' })).toBeDisabled();

    await u.click(screen.getByRole('button', { name: 'Subir Sentadilla' }));
    expect(orden()).toEqual(['Remo con barra', 'Sentadilla', 'Press de banca']);
    expect(screen.getByRole('button', { name: 'Subir Sentadilla' })).toHaveFocus();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Sentadilla, posición 2 de 3.');

    await u.click(screen.getByRole('button', { name: 'Subir Sentadilla' }));
    // Ya es el primero: «Subir» se deshabilita y el foco pasa a «Bajar» del mismo ejercicio.
    expect(orden()).toEqual(['Sentadilla', 'Remo con barra', 'Press de banca']);
    expect(screen.getByRole('button', { name: 'Bajar Sentadilla' })).toHaveFocus();

    await u.click(screen.getByRole('button', { name: 'Quitar Remo con barra' }));
    expect(orden()).toEqual(['Sentadilla', 'Press de banca']);
    expect(screen.getByRole('checkbox', { name: 'Remo con barra' })).not.toBeChecked();
    await u.click(screen.getByRole('checkbox', { name: 'Press de banca' }));
    expect(orden()).toEqual(['Sentadilla']);
  });

  it('buscar filtra el catálogo sin perder lo elegido', async () => {
    const u = await abrirEditor();
    await u.click(screen.getByRole('checkbox', { name: 'Press de banca' }));
    await u.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'remo');
    expect(screen.queryByRole('checkbox', { name: 'Press de banca' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Remo con barra' })).toBeInTheDocument();
    expect(orden()).toEqual(['Press de banca']);
  });

  it('guarda nombre, día y ejercicios en orden y vuelve a la lista con la rutina nueva', async () => {
    const u = await abrirEditor();
    await u.type(screen.getByLabelText('Nombre de la rutina'), '  Pierna y espalda ');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Día de la semana' }), '1');
    for (const nombre of ['Sentadilla', 'Remo con barra']) await u.click(screen.getByRole('checkbox', { name: nombre }));
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    expect(await tarjeta('Pierna y espalda')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rutinas');
    expect(peticiones('POST', '/rutinas').map((p) => p.cuerpo)).toEqual([{ nombre: 'Pierna y espalda', diaSemana: 1, ejercicioIds: [SENTADILLA.id, REMO.id] }]);
    expect(screen.getByRole('status')).toHaveTextContent('Rutina «Pierna y espalda» guardada.');
  });

  it('si no se puede guardar lo explica y conserva lo escrito', async () => {
    const u = await abrirEditor();
    await u.type(screen.getByLabelText('Nombre de la rutina'), 'Pecho');
    await u.click(screen.getByRole('checkbox', { name: 'Press de banca' }));
    servidor.rutinasFallan = true;
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la rutina. Inténtalo de nuevo.');
    expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('Pecho');
    expect(orden()).toEqual(['Press de banca']);
    servidor.rutinasFallan = false;
    servidor.sinRed = true;
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor.'));
  });

  it('«Cancelar» vuelve a la lista sin guardar', async () => {
    const u = await abrirEditor();
    await u.type(screen.getByLabelText('Nombre de la rutina'), 'Borrador');
    await u.click(screen.getByRole('link', { name: 'Cancelar' }));
    expect(await screen.findByText('Aún no tienes rutinas.')).toBeInTheDocument();
    expect(peticiones('POST', '/rutinas')).toHaveLength(0);
  });
});

describe('T055: editar una rutina', () => {
  const orden = () => within(screen.getByRole('list', { name: 'Orden de la rutina' })).getAllByRole('listitem').map((li) => within(li).getByTestId('nombre-ejercicio').textContent);

  async function editar(u: ReturnType<typeof userEvent.setup>, nombre: string) {
    await u.click(within(await tarjeta(nombre)).getByRole('button', { name: `Editar ${nombre}` }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar rutina' })).toBeInTheDocument();
    await screen.findByRole('checkbox', { name: 'Press de banca' });
  }

  it('abre con los datos de la rutina y guarda la lista completa con la versión', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 3, [REMO, PRESS])];
    const u = abrir();
    await editar(u, 'Pecho');
    expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('Pecho');
    expect(screen.getByRole('combobox', { name: 'Día de la semana' })).toHaveValue('3');
    expect(screen.getByRole('checkbox', { name: 'Press de banca' })).toBeChecked();
    expect(orden()).toEqual(['Remo con barra', 'Press de banca']);

    // Como el E2E de T051: desmarcar saca de la lista y marcar añade al final.
    await u.click(screen.getByRole('checkbox', { name: 'Press de banca' }));
    await u.click(screen.getByRole('checkbox', { name: 'Sentadilla' }));
    const campo = screen.getByLabelText('Nombre de la rutina');
    await u.clear(campo); await u.type(campo, 'Espalda y pierna');
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));

    const t = await tarjeta('Espalda y pierna');
    expect(within(t).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Remo con barra', 'Sentadilla']);
    expect(peticiones('PATCH', `/rutinas/${R1}`).map((p) => p.cuerpo)).toEqual([{ nombre: 'Espalda y pierna', diaSemana: 3, ejercicioIds: [REMO.id, SENTADILLA.id], version: 1 }]);
  });

  it('si cambió en otro dispositivo (409) muestra la versión vigente sin sobrescribirla y permite guardar después', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS])];
    const u = abrir();
    await editar(u, 'Pecho');
    // Otro dispositivo la renombra mientras tanto.
    Object.assign(servidor.rutinas[0], { nombre: 'Pecho pesado', version: 2 });
    await u.click(screen.getByRole('checkbox', { name: 'Remo con barra' }));
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta rutina cambió en otro dispositivo. Se muestra la versión actual: revisa los cambios y vuelve a guardar.');
    expect(screen.getByLabelText('Nombre de la rutina')).toHaveValue('Pecho pesado');
    expect(orden()).toEqual(['Press de banca']);
    expect(servidor.rutinas[0]).toMatchObject({ nombre: 'Pecho pesado', version: 2 });

    await u.click(screen.getByRole('checkbox', { name: 'Remo con barra' }));
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    expect(await tarjeta('Pecho pesado')).toBeInTheDocument();
    expect(peticiones('PATCH', `/rutinas/${R1}`).at(-1)?.cuerpo).toMatchObject({ ejercicioIds: [PRESS.id, REMO.id], version: 2 });
  });

  it('una rutina que ya no existe lo indica y permite volver', async () => {
    abrir(`/rutinas/${R2}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta rutina ya no existe.');
    expect(screen.getByRole('link', { name: 'Volver a rutinas' })).toHaveAttribute('href', '/rutinas');
  });
});

describe('T055: eliminar una rutina con confirmación (FR-030)', () => {
  async function pedirEliminar(u: ReturnType<typeof userEvent.setup>, nombre: string) {
    await u.click(within(await tarjeta(nombre)).getByRole('button', { name: `Eliminar ${nombre}` }));
    return screen.findByRole('dialog', { name: `¿Eliminar «${nombre}»?` });
  }

  it('el diálogo explica que los entrenamientos no cambian, enfoca «Cancelar» y cancelar no borra nada', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS])];
    const u = abrir();
    const dialogo = await pedirEliminar(u, 'Pecho');
    expect(dialogo).toHaveTextContent('Tus entrenamientos anteriores no cambian.');
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Pecho' })).toHaveFocus();
    expect(await tarjeta('Pecho')).toBeInTheDocument();
    expect(peticiones('DELETE', '/rutinas')).toHaveLength(0);
  });

  it('al confirmar la elimina con su versión, sin tocar los entrenamientos, y lo confirma', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS]), rutina(R2, 'Pierna', 2, [SENTADILLA])];
    const u = abrir();
    const dialogo = await pedirEliminar(u, 'Pecho');
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar rutina' }));
    expect(await screen.findByText('Rutina «Pecho» eliminada.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('heading', { level: 3, name: 'Pecho' })).not.toBeInTheDocument();
    expect(await tarjeta('Pierna')).toBeInTheDocument();
    expect(peticiones('DELETE', '/rutinas').map((p) => p.ruta)).toEqual([`/rutinas/${R1}?version=1`]);
    expect(servidor.peticiones.filter((p) => p.ruta.startsWith('/entrenamientos') && p.metodo !== 'GET')).toEqual([]);
  });

  it('si el servidor la rechaza, la rutina sigue y se explica', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS])];
    const u = abrir();
    const dialogo = await pedirEliminar(u, 'Pecho');
    servidor.rutinasFallan = true;
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar rutina' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se pudo eliminar la rutina. Inténtalo de nuevo.');
    servidor.rutinasFallan = false;
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(await tarjeta('Pecho')).toBeInTheDocument();
    expect(servidor.rutinas).toHaveLength(1);
  });

  it('si cambió en otro dispositivo (409) no la elimina: muestra la versión actual para decidir de nuevo', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', 1, [PRESS])];
    const u = abrir();
    const dialogo = await pedirEliminar(u, 'Pecho');
    Object.assign(servidor.rutinas[0], { nombre: 'Pecho pesado', version: 2 });
    await u.click(within(dialogo).getByRole('button', { name: 'Eliminar rutina' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta rutina cambió en otro dispositivo y no se eliminó. Revisa la versión actual.');
    expect(await tarjeta('Pecho pesado')).toBeInTheDocument();
    expect(servidor.rutinas).toHaveLength(1);
  });
});

describe('T055: iniciar un entrenamiento desde una rutina (FR-029, FR-030)', () => {
  const tarjetaEjercicio = async (nombre: string) => (await screen.findByRole('heading', { level: 3, name: nombre })).closest('article') as HTMLElement;
  const ejerciciosSesion = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

  async function anadirSerie(u: ReturnType<typeof userEvent.setup>, t: HTMLElement, peso: string, reps: string) {
    const campoPeso = within(t).getByLabelText(/^peso/i);
    const campoReps = within(t).getByLabelText(/^repeticiones/i);
    await u.clear(campoPeso); await u.type(campoPeso, peso);
    await u.clear(campoReps); await u.type(campoReps, reps);
    await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
  }

  it('crea la sesión en el servidor con la rutina y abre Entrenar con sus ejercicios en orden', async () => {
    servidor.rutinas = [rutina(R1, 'Espalda', 1, [REMO, PRESS])];
    const u = abrir();
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Iniciar Espalda' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento en curso' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    await waitFor(() => expect(ejerciciosSesion()).toEqual(['Remo con barra', 'Press de banca']));
    const inicio = peticiones('POST', '/entrenamientos').map((p) => p.cuerpo);
    expect(inicio).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), inicio: expect.any(String), zonaHoraria: expect.any(String), rutinaId: R1 }]);
    // No pasa por la cola: no hay operaciones pendientes con identificadores del cliente.
    expect(screen.getByText('0 cambios pendientes de sincronizar')).toBeInTheDocument();
  });

  it('la sesión y la plantilla son independientes en ambos sentidos', async () => {
    servidor.rutinas = [rutina(R1, 'Espalda', 1, [REMO, PRESS])];
    const u = abrir();
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Iniciar Espalda' }));
    // Cambiar la sesión (series y un ejercicio más) no toca la rutina.
    await anadirSerie(u, await tarjetaEjercicio('Press de banca'), '60', '8');
    await u.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Sentadilla' }));
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios.map((e) => e.nombre)).toEqual(['Remo con barra', 'Press de banca', 'Sentadilla']));
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[1].series).toHaveLength(1));
    expect(servidor.rutinas[0]).toMatchObject({ version: 1, ejercicios: [{ ejercicioId: REMO.id }, { ejercicioId: PRESS.id }] });
    expect(servidor.peticiones.filter((p) => p.ruta.startsWith('/rutinas') && p.metodo !== 'GET')).toEqual([]);

    // Editar y eliminar la rutina no toca la sesión.
    const antes = servidor.peticiones.length;
    await ir('/rutinas');
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Editar Espalda' }));
    await u.click(await screen.findByRole('checkbox', { name: 'Remo con barra' }));
    await u.click(screen.getByRole('button', { name: 'Guardar rutina' }));
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Eliminar Espalda' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar rutina' }));
    await screen.findByText('Rutina «Espalda» eliminada.');
    expect(servidor.peticiones.slice(antes).filter((p) => p.ruta.startsWith('/entrenamientos') && p.metodo !== 'GET')).toEqual([]);
    expect(servidor.entrenamiento?.ejercicios.map((e) => e.nombre)).toEqual(['Remo con barra', 'Press de banca', 'Sentadilla']);
  });

  it('una vez iniciado, registrar series sigue funcionando sin conexión', async () => {
    servidor.rutinas = [rutina(R1, 'Espalda', 1, [REMO])];
    const u = abrir();
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Iniciar Espalda' }));
    const remo = await tarjetaEjercicio('Remo con barra');
    servidor.sinRed = true;
    await anadirSerie(u, remo, '50', '10');
    expect(await screen.findByText('1 cambio pendiente de sincronizar')).toBeInTheDocument();
    expect(within(remo).getByText('50 kg × 10')).toBeInTheDocument();
  });

  it('sin conexión no inicia y lo dice claramente', async () => {
    servidor.rutinas = [rutina(R1, 'Espalda', 1, [REMO])];
    const u = abrir();
    const t = await tarjeta('Espalda');
    servidor.sinRed = true;
    await u.click(within(t).getByRole('button', { name: 'Iniciar Espalda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Necesitas conexión para iniciar desde una rutina.');
    expect(router.state.location.pathname).toBe('/rutinas');
    expect(localStorage.getItem(`gymtrack:cola:${'00000000-0000-4000-8000-000000000271'}`) ?? '').not.toMatch(/rutinaId/);
  });

  it('con un entrenamiento ya en curso lo explica y ofrece ir a él', async () => {
    servidor.rutinas = [rutina(R1, 'Espalda', 1, [REMO])];
    servidor.entrenamiento = { id: '55000000-0000-4000-8000-0000000000e0', estado: 'en_curso', inicio: new Date().toISOString(), fin: null, zonaHoraria: 'America/Bogota', nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [] };
    const u = abrir();
    await u.click(within(await tarjeta('Espalda')).getByRole('button', { name: 'Iniciar Espalda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes un entrenamiento en curso. Termínalo antes de empezar otro.');
    expect(screen.getByRole('link', { name: 'Ir a Entrenar' })).toHaveAttribute('href', '/');
  });
});

describe('T055: atajo de rutinas de hoy en Entrenar', () => {
  it('sin entrenamiento muestra solo las rutinas de hoy, conserva «Iniciar entrenamiento» y arranca con un toque', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', hoy(), [PRESS, REMO]), rutina(R2, 'Pierna', (hoy() % 7) + 1, [SENTADILLA])];
    const u = abrir('/');
    const atajo = (await screen.findByRole('heading', { level: 3, name: 'Rutinas de hoy' })).closest('section') as HTMLElement;
    expect(within(atajo).getByRole('button', { name: 'Iniciar rutina Pecho' })).toBeInTheDocument();
    expect(within(atajo).queryByText('Pierna')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
    await u.click(within(atajo).getByRole('button', { name: 'Iniciar rutina Pecho' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento en curso' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Press de banca', 'Remo con barra']));
    // Con el entrenamiento en curso el atajo desaparece.
    expect(screen.queryByRole('heading', { name: 'Rutinas de hoy' })).not.toBeInTheDocument();
  });

  it('sin rutinas para hoy ofrece «Ver rutinas»', async () => {
    servidor.rutinas = [rutina(R2, 'Pierna', (hoy() % 7) + 1, [SENTADILLA])];
    const u = abrir('/');
    await u.click(await screen.findByRole('link', { name: 'Ver rutinas' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rutinas' })).toBeInTheDocument();
  });

  it('no aparece con un entrenamiento en curso', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', hoy(), [PRESS])];
    servidor.entrenamiento = { id: '55000000-0000-4000-8000-0000000000e0', estado: 'en_curso', inicio: new Date().toISOString(), fin: null, zonaHoraria: 'America/Bogota', nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [] };
    abrir('/');
    expect(await screen.findByRole('heading', { name: 'Entrenamiento en curso' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rutinas de hoy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver rutinas' })).not.toBeInTheDocument();
  });

  it('sin conexión conserva las opciones que funcionan sin red', async () => {
    servidor.rutinas = [rutina(R1, 'Pecho', hoy(), [PRESS])];
    servidor.rutinasFallan = true;
    const u = abrir('/');
    expect(await screen.findByRole('link', { name: 'Ver rutinas' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    servidor.sinRed = true;
    await u.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));
    expect(await screen.findByRole('heading', { name: 'Entrenamiento en curso' })).toBeInTheDocument();
    expect(await screen.findByText('1 cambio pendiente de sincronizar')).toBeInTheDocument();
  });
});
