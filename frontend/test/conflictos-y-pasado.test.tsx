import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { PRESS, instalarApi, reiniciarServidor, servidor, type EntrenamientoApi } from './utils/api-entrenamiento';

// T028: conflictos entre dispositivos (FR-031, V6), registro a posteriori (FR-014) y descartar un
// entrenamiento olvidado (V7). API en memoria con estado: test/utils/api-entrenamiento.ts.

const SERIE = '40000000-0000-4000-8000-000000000281';

function enCursoConUnaSerie(extra: Partial<EntrenamientoApi> = {}): EntrenamientoApi {
  return {
    id: '20000000-0000-4000-8000-000000000281', estado: 'en_curso', inicio: new Date(Date.now() - 30 * 60_000).toISOString(), fin: null, zonaHoraria: 'UTC',
    nota: null, rutinaOrigenId: null, inactivo: false, version: 1,
    ejercicios: [{ id: '30000000-0000-4000-8000-000000000281', ejercicioId: PRESS.id, nombre: PRESS.nombre, posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1,
      series: [{ id: SERIE, orden: 1, repeticiones: 8, pesoKg: 60, registradaEn: new Date(Date.now() - 20 * 60_000).toISOString(), version: 1 }] }],
    ...extra,
  };
}

const serieDelServidor = () => servidor.entrenamiento?.ejercicios[0].series.find((s) => s.id === SERIE);

function abrir() {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/'] })} /></Proveedores>);
  return userEvent.setup();
}

async function editarSerie1(u: ReturnType<typeof userEvent.setup>, peso: string) {
  await u.click(await screen.findByRole('button', { name: 'Editar serie 1' }));
  const campo = screen.getByLabelText(/^peso/i);
  await u.clear(campo); await u.type(campo, peso);
  await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
}

beforeEach(() => { localStorage.clear(); reiniciarServidor(); instalarApi(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('T028: conflictos entre dispositivos (V6)', () => {
  it('muestra la versión vigente y «Repetir mi cambio» lo aplica sobre ella', async () => {
    servidor.entrenamiento = enCursoConUnaSerie();
    const u = abrir();
    await screen.findByText('60 kg × 8');
    // Otro dispositivo cambia la serie 1 a 65 kg.
    Object.assign(serieDelServidor()!, { pesoKg: 65, version: 2 });

    await editarSerie1(u, '70');
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/conflicto/i);
    expect(aviso).toHaveTextContent('65 kg × 8');
    expect(aviso).toHaveTextContent('70 kg × 8');
    expect(await screen.findByText('65 kg × 8', { selector: 'span' })).toBeInTheDocument();

    await u.click(within(aviso).getByRole('button', { name: 'Repetir mi cambio' }));
    await waitFor(() => expect(serieDelServidor()).toMatchObject({ pesoKg: 70, version: 3 }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText('0 cambios pendientes de sincronizar')).toBeInTheDocument();
    expect(servidor.peticiones.filter((p) => p.metodo === 'PATCH').map((p) => (p.cuerpo as { version: number }).version)).toEqual([1, 2]);
  });

  it('«Descartar mi cambio» conserva la versión vigente sin enviar nada más', async () => {
    servidor.entrenamiento = enCursoConUnaSerie();
    const u = abrir();
    await screen.findByText('60 kg × 8');
    Object.assign(serieDelServidor()!, { pesoKg: 65, version: 2 });
    await editarSerie1(u, '70');
    await u.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Descartar mi cambio' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('65 kg × 8', { selector: 'span' })).toBeInTheDocument();
    expect(serieDelServidor()).toMatchObject({ pesoKg: 65, version: 2 });
    expect(servidor.peticiones.filter((p) => p.metodo === 'PATCH')).toHaveLength(1);
  });

  it('si la serie se eliminó en otro dispositivo, lo explica y solo ofrece descartar', async () => {
    servidor.entrenamiento = enCursoConUnaSerie();
    const u = abrir();
    await screen.findByText('60 kg × 8');
    servidor.entrenamiento!.ejercicios[0].series = [];
    await editarSerie1(u, '70');
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/se eliminó en otro dispositivo/i);
    expect(within(aviso).queryByRole('button', { name: 'Repetir mi cambio' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar serie 1' })).not.toBeInTheDocument());
    await u.click(within(aviso).getByRole('button', { name: 'Descartar mi cambio' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si ya hay un entrenamiento en curso en otro dispositivo, lo explica y muestra ese', async () => {
    const u = abrir();
    await screen.findByRole('button', { name: 'Iniciar entrenamiento' });
    servidor.entrenamiento = enCursoConUnaSerie();
    await u.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/otro dispositivo/i);
    await u.click(within(aviso).getByRole('button', { name: 'Descartar mi cambio' }));
    expect(await screen.findByText('60 kg × 8')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Press de banca' })).toBeInTheDocument();
  });
});

describe('T028: entrenamiento con fecha pasada (FR-014)', () => {
  const ayer = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };

  async function abrirFormulario(u: ReturnType<typeof userEvent.setup>) {
    await u.click(await screen.findByRole('button', { name: 'Registrar un entrenamiento pasado' }));
    return screen.findByRole('form', { name: 'Registrar un entrenamiento pasado' });
  }

  it('lo crea finalizado con la fecha y horas locales, permite añadir series y muestra el resumen', async () => {
    const u = abrir();
    const form = await abrirFormulario(u);
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: ayer() } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: '19:15' } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));

    expect(await screen.findByRole('heading', { name: /^entrenamiento del/i })).toBeInTheDocument();
    const post = servidor.peticiones.find((p) => p.metodo === 'POST' && p.ruta === '/entrenamientos');
    expect(post?.cuerpo).toEqual({ id: expect.any(String), inicio: new Date(`${ayer()}T18:00`).toISOString(), fin: new Date(`${ayer()}T19:15`).toISOString(), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone });

    await u.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
    const tarjeta = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
    await u.type(within(tarjeta).getByLabelText(/^peso/i), '50');
    await u.type(within(tarjeta).getByLabelText(/^repeticiones/i), '10');
    await u.click(within(tarjeta).getByRole('button', { name: 'Añadir serie' }));
    await waitFor(() => expect(servidor.pasados[0]?.ejercicios[0]?.series).toHaveLength(1));
    expect(servidor.entrenamiento).toBeNull();

    await u.click(screen.getByRole('button', { name: 'Listo' }));
    const resumen = (await screen.findByRole('heading', { name: 'Entrenamiento registrado' })).closest('section') as HTMLElement;
    expect(resumen).toHaveTextContent('1 ejercicio');
    expect(resumen).toHaveTextContent('1 serie');
    expect(resumen).toHaveTextContent('75 min');
    expect(resumen).toHaveTextContent('500 kg');
  });

  it('al volver, el entrenamiento pasado no aparece como si estuviera en curso', async () => {
    const u = abrir();
    const form = await abrirFormulario(u);
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: ayer() } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: '19:15' } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));
    await screen.findByRole('heading', { name: /^entrenamiento del/i });
    await waitFor(() => expect(servidor.pasados).toHaveLength(1));
    await u.click(screen.getByRole('button', { name: 'Listo' }));
    await u.click(await screen.findByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrenamiento en curso' })).not.toBeInTheDocument();
  });

  it('no pierde lo tecleado si la confirmación del ejercicio llega mientras se escribe', async () => {
    let soltar = () => {};
    servidor.ejercicioLento = new Promise((r) => { soltar = r; });
    const u = abrir();
    const form = await abrirFormulario(u);
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: ayer() } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: '19:15' } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));
    await u.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
    const tarjeta = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
    await u.type(within(tarjeta).getByLabelText(/^peso/i), '50');
    await u.type(within(tarjeta).getByLabelText(/^repeticiones/i), '10');
    await act(async () => { soltar(); });
    await waitFor(() => expect(servidor.pasados[0]?.ejercicios).toHaveLength(1));
    const confirmada = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
    expect(within(confirmada).getByLabelText(/^peso/i)).toHaveValue('50');
    await u.click(within(confirmada).getByRole('button', { name: 'Añadir serie' }));
    await waitFor(() => expect(servidor.pasados[0]?.ejercicios[0]?.series).toHaveLength(1));
  });

  it.each([
    ['fin anterior al inicio', () => ayer(), '19:00', '18:00', 'Hora de fin', /posterior a la de inicio/i],
    ['fecha futura', () => '2999-01-01', '18:00', '19:00', 'Fecha', /no puede ser futura/i],
    ['sin fecha', () => '', '18:00', '19:00', 'Fecha', /elige la fecha/i],
  ])('rechaza %s junto al campo sin enviar nada', async (_caso, fecha, inicio, fin, campo, mensaje) => {
    const u = abrir();
    const form = await abrirFormulario(u);
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: fecha() } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: inicio } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: fin } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));
    expect(within(form).getByLabelText(campo)).toHaveAccessibleDescription(mensaje);
    expect(servidor.peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/entrenamientos')).toBe(false);
  });

  it('«Cancelar» vuelve al estado vacío', async () => {
    const u = abrir();
    const form = await abrirFormulario(u);
    await u.click(within(form).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
  });
});

describe('T028: descartar un entrenamiento olvidado (V7)', () => {
  it('pide confirmación y lo elimina con la versión conocida', async () => {
    servidor.entrenamiento = enCursoConUnaSerie({ inactivo: true });
    const u = abrir();
    const dialogo = await screen.findByRole('dialog');
    await u.click(within(dialogo).getByRole('button', { name: 'Descartar entrenamiento' }));
    expect(dialogo).toHaveTextContent(/se borrará/i);
    await u.click(within(dialogo).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(servidor.entrenamiento).toBeNull());
    expect(servidor.peticiones.find((p) => p.metodo === 'DELETE')?.ruta).toBe(`/entrenamientos/${'20000000-0000-4000-8000-000000000281'}?version=1`);
    expect(await screen.findByRole('button', { name: 'Iniciar entrenamiento' })).toBeInTheDocument();
  });
});
