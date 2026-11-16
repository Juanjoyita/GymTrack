import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EjercicioRealizado } from '../src/api/entrenamientos';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { AvisoConflictos } from '../src/paginas/entrenamiento/AvisoConflictos';
import { opTerminarEjercicio } from '../src/paginas/entrenamiento/operaciones';
import type { Conflicto, Operacion } from '../src/sincronizacion/cola';
import fixture from '../../packages/domain/test/fixtures/progreso-referencia.json';
import { PRESS, instalarApi, reiniciarServidor, servidor } from './utils/api-entrenamiento';

// T041: avisos de récord durante el entrenamiento en curso (FR-022, R-11) y su integración en Entrenar.

// Récords previos de Press de banca según el fixture manual de T036: 75 kg, 1RM 87,5 kg y 868 kg.
const RECORDS_PRESS = fixture.records.pressDeBanca;

type Usuario = ReturnType<typeof userEvent.setup>;

function abrir(ruta = '/') {
  render(<Proveedores><RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} /></Proveedores>);
  return userEvent.setup();
}

async function iniciarYAnadir(u: Usuario) {
  await u.click(await screen.findByRole('button', { name: 'Iniciar entrenamiento' }));
  await screen.findByRole('heading', { name: 'Entrenamiento en curso' });
  await u.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
  await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
  return (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
}

async function anadirSerie(u: Usuario, t: HTMLElement, peso: string, reps: string) {
  const campoPeso = within(t).getByLabelText(/^peso/i);
  const campoReps = within(t).getByLabelText(/^repeticiones/i);
  await u.clear(campoPeso); await u.type(campoPeso, peso);
  await u.clear(campoReps); await u.type(campoReps, reps);
  await u.click(within(t).getByRole('button', { name: 'Añadir serie' }));
}

/** Única región que anuncia los récords (la que comprueban los E2E de T036). */
const anunciador = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const fila = (t: HTMLElement, n: number) => within(t).getByText(`Serie ${n}`).closest('li') as HTMLElement;
/** Espera a que la página tenga los récords del ejercicio (se piden al añadirlo). */
const recordsCargados = () => waitFor(() => expect(servidor.peticiones.some((p) => p.ruta.startsWith(`/progreso/${PRESS.id}/records`))).toBe(true));

beforeEach(() => {
  localStorage.clear();
  reiniciarServidor();
  instalarApi();
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('T041: récords de peso máximo y 1RM al registrar una serie', () => {
  it('pide los récords de sesiones anteriores excluyendo el entrenamiento en curso', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    await iniciarYAnadir(u);
    await recordsCargados();
    const peticion = servidor.peticiones.find((p) => p.ruta.startsWith(`/progreso/${PRESS.id}/records`));
    expect(peticion?.ruta).toBe(`/progreso/${PRESS.id}/records?excluirEntrenamientoId=${servidor.entrenamiento?.id}`);
  });

  it('al superar el récord lo anuncia sin mover el foco y marca la serie con una etiqueta', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '76', '5');
    await waitFor(() => expect(anunciador()).toHaveTextContent('Nuevo récord de peso máximo en Press de banca: 76 kg. Nuevo récord de 1RM estimado: 88,67 kg.'));
    // El anuncio no toma el foco: sigue en «Añadir serie» y la región no es enfocable.
    expect(within(t).getByRole('button', { name: 'Añadir serie' })).toHaveFocus();
    expect(anunciador()).not.toHaveAttribute('tabindex');
    expect(anunciador().contains(document.activeElement)).toBe(false);
    expect(within(fila(t, 1)).getByText('Récord de peso y 1RM')).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('igualar el récord no avisa ni marca la serie', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '75', '5');
    expect(await within(t).findByText('75 kg × 5')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
    expect(within(t).queryByText(/^récord de/i)).not.toBeInTheDocument();
  });

  it('en la primera sesión del ejercicio no avisa aunque las series crezcan', async () => {
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '40', '10');
    await anadirSerie(u, t, '50', '5');
    expect(await within(t).findByText('50 kg × 5')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
    expect(within(t).queryByText(/^récord de/i)).not.toBeInTheDocument();
  });

  it('anuncia solo el último evento: una serie sin récord vacía el anuncio anterior', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '76', '5');
    await waitFor(() => expect(anunciador()).toHaveTextContent(/récord/));
    await anadirSerie(u, t, '60', '8');
    expect(await within(t).findByText('60 kg × 8')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
    expect(within(fila(t, 1)).getByText('Récord de peso y 1RM')).toBeInTheDocument();
  });

  it('al editar una serie no anuncia, pero recalcula las etiquetas', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '70', '5');
    expect(await within(t).findByText('70 kg × 5')).toBeInTheDocument();
    await u.click(within(t).getByRole('button', { name: 'Editar serie 1' }));
    const campoPeso = within(t).getByLabelText(/^peso/i);
    await u.clear(campoPeso); await u.type(campoPeso, '80');
    await u.click(within(t).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(fila(t, 1)).findByText('Récord de peso y 1RM')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
  });

  it('sin récords fiables (la consulta falla) no avisa ni marca', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    servidor.recordsFallan = true;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '90', '5');
    expect(await within(t).findByText('90 kg × 5')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
    expect(within(t).queryByText(/^récord de/i)).not.toBeInTheDocument();
  });

  it('en un entrenamiento registrado a posteriori no consulta récords ni avisa', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    await u.click(await screen.findByRole('button', { name: 'Registrar un entrenamiento pasado' }));
    const form = await screen.findByRole('form', { name: 'Registrar un entrenamiento pasado' });
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
    fireEvent.change(within(form).getByLabelText('Fecha'), { target: { value: ayer } });
    fireEvent.change(within(form).getByLabelText('Hora de inicio'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('Hora de fin'), { target: { value: '19:00' } });
    await u.click(within(form).getByRole('button', { name: 'Registrar entrenamiento' }));
    await u.click(await screen.findByRole('button', { name: 'Añadir ejercicio' }));
    await u.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Press de banca' }));
    const t = (await screen.findByRole('heading', { level: 3, name: 'Press de banca' })).closest('article') as HTMLElement;
    await anadirSerie(u, t, '90', '5');
    expect(await within(t).findByText('90 kg × 5')).toBeInTheDocument();
    expect(servidor.peticiones.some((p) => p.ruta.startsWith('/progreso'))).toBe(false);
    expect(within(t).queryByText(/^récord de/i)).not.toBeInTheDocument();
    expect(within(t).queryByRole('button', { name: 'Terminar ejercicio' })).not.toBeInTheDocument();
  });
});

describe('T041: récord de volumen al terminar el ejercicio', () => {
  const patches = () => servidor.peticiones.filter((p) => p.metodo === 'PATCH' && /\/ejercicios\/[^/]+$/.test(p.ruta)).map((p) => p.cuerpo);

  async function conVolumen895(u: Usuario) {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    // Fixture T036 «volumen»: 75 × 5 + 65 × 8 = 895 kg > 868 kg; ninguna serie bate peso ni 1RM.
    await anadirSerie(u, t, '75', '5');
    await anadirSerie(u, t, '65', '8');
    expect(await within(t).findByText('65 kg × 8')).toBeInTheDocument();
    expect(anunciador()).not.toHaveTextContent(/volumen/);
    return t;
  }

  it('avisa al terminar, guarda el volumen notificado en la misma petición y deja el foco en el botón', async () => {
    const u = abrir();
    const t = await conVolumen895(u);
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('Nuevo récord de volumen en Press de banca: 895 kg.');
    expect(within(t).getByText('Récord de volumen: 895 kg')).toBeInTheDocument();
    expect(within(t).getByRole('button', { name: 'Reabrir ejercicio' })).toHaveFocus();
    expect(within(t).queryByRole('button', { name: 'Añadir serie' })).not.toBeInTheDocument();
    await waitFor(() => expect(patches()).toEqual([{ terminado: true, volumenNotificadoKg: 895, version: 1 }]));
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0]).toMatchObject({ volumenNotificadoKg: 895, terminadoEn: expect.any(String) }));
  });

  it('reabrir y terminar sin cambios no repite el aviso; con una serie más que lo supera, sí', async () => {
    const u = abrir();
    const t = await conVolumen895(u);
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    await u.click(within(t).getByRole('button', { name: 'Reabrir ejercicio' }));
    expect(anunciador()).toHaveTextContent('');
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('');
    await u.click(within(t).getByRole('button', { name: 'Reabrir ejercicio' }));
    await anadirSerie(u, t, '10', '1');
    await u.click(await within(t).findByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('Nuevo récord de volumen en Press de banca: 905 kg.');
    await waitFor(() => expect(patches()).toEqual([
      { terminado: true, volumenNotificadoKg: 895, version: 1 }, { terminado: false, version: 2 },
      { terminado: true, version: 3 }, { terminado: false, version: 4 }, { terminado: true, volumenNotificadoKg: 905, version: 5 },
    ]));
  });

  it('no avisa si el volumen solo iguala el récord ni en la primera sesión', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '62', '14'); // 868 kg, igual al récord.
    expect(await within(t).findByText('62 kg × 14')).toBeInTheDocument();
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('');
    await waitFor(() => expect(patches()).toEqual([{ terminado: true, version: 1 }]));
  });

  it('sin conexión terminar y reabrir se encolan y se envían en orden con versiones encadenadas', async () => {
    const u = abrir();
    const t = await conVolumen895(u);
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0].series).toHaveLength(2));
    servidor.sinRed = true;
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('Nuevo récord de volumen en Press de banca: 895 kg.');
    await u.click(within(t).getByRole('button', { name: 'Reabrir ejercicio' }));
    await u.click(within(t).getByRole('button', { name: 'Terminar ejercicio' }));
    expect(anunciador()).toHaveTextContent('');
    servidor.sinRed = false;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(servidor.entrenamiento?.ejercicios[0]).toMatchObject({ terminadoEn: expect.any(String), volumenNotificadoKg: 895, version: 4 }));
    expect(await screen.findByText('0 cambios pendientes de sincronizar')).toBeInTheDocument();
  });
});

describe('T041: récords al finalizar el entrenamiento', () => {
  const resumen = async () => (await screen.findByRole('heading', { name: 'Entrenamiento finalizado' })).closest('section') as HTMLElement;

  it('sin terminar el ejercicio, comprueba el volumen al finalizar y lo muestra en el resumen', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '75', '5');
    await anadirSerie(u, t, '65', '8');
    expect(await within(t).findByText('65 kg × 8')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    await waitFor(() => expect(anunciador()).toHaveTextContent('Nuevo récord de volumen en Press de banca: 895 kg.'));
    const r = await resumen();
    const lista = within(r).getByRole('list', { name: 'Récords de esta sesión' });
    expect(within(lista).getByText('Press de banca')).toBeInTheDocument();
    expect(within(lista).getByText('Volumen: 895 kg')).toBeInTheDocument();
  });

  it('el resumen recoge los récords de peso y 1RM sin volver a anunciarlos', async () => {
    servidor.records[PRESS.id] = RECORDS_PRESS;
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '76', '5');
    await waitFor(() => expect(anunciador()).toHaveTextContent(/peso máximo/));
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    const lista = within(await resumen()).getByRole('list', { name: 'Récords de esta sesión' });
    expect(within(lista).getByText('Peso máximo: 76 kg')).toBeInTheDocument();
    expect(within(lista).getByText('1RM estimado: 88,67 kg')).toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
  });

  it('en la primera sesión el resumen no muestra récords', async () => {
    const u = abrir();
    const t = await iniciarYAnadir(u);
    await recordsCargados();
    await anadirSerie(u, t, '50', '5');
    expect(await within(t).findByText('50 kg × 5')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(within(await resumen()).queryByRole('list', { name: 'Récords de esta sesión' })).not.toBeInTheDocument();
    expect(anunciador()).toHaveTextContent('');
  });
});

const realizado: EjercicioRealizado = {
  id: 'er1', ejercicioId: 'ej1', nombre: 'Press de banca', posicion: 1, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [],
};

describe('T041: conflicto al terminar o reabrir un ejercicio', () => {
  it('explica el estado vigente del ejercicio y permite repetir el cambio', () => {
    const operacion = { ...opTerminarEjercicio('en1', realizado), id: 'op', creadaEn: '' } as Operacion;
    const conflicto = { id: 'c1', motivo: 'CONFLICTO_VERSION', actual: { ...realizado, version: 2 }, operacion } as unknown as Conflicto;
    render(<AvisoConflictos conflictos={[conflicto]} entrenamiento={null} unidad="kg" onRepetir={vi.fn()} onDescartar={vi.fn()} />);
    expect(screen.getByText('Conflicto en un ejercicio')).toBeInTheDocument();
    expect(screen.getByText(/El ejercicio se cambió en otro dispositivo\. Ahora: sin terminar\. Tu cambio: terminarlo\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repetir mi cambio' })).toBeInTheDocument();
  });
});
