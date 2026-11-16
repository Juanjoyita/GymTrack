import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { textos } from '../src/textos/es';

// Desde T024 las secciones son privadas: se simula una sesión iniciada (GET /auth/yo → 200).
const USUARIO = { id: '00000000-0000-4000-8000-000000000101', email: 't010@example.invalid', unidadPeso: 'kg', zonaHoraria: 'America/Bogota' };

// Desde T025, Entrenar consulta el entrenamiento en curso: aquí no hay ninguno (204).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL) => {
    const ruta = new URL(String(entrada), 'https://localhost').pathname.replace(/^\/api/, '');
    if (ruta === '/auth/yo') return new Response(JSON.stringify(USUARIO), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (ruta === '/entrenamientos') return new Response(JSON.stringify({ elementos: [], siguienteCursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (ruta === '/ejercicios') return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  await screen.findByRole('main');
  return router;
}

const SECCIONES = [
  { ruta: '/', nombre: textos.navegacion.entrenar },
  { ruta: '/historial', nombre: textos.navegacion.historial },
  { ruta: '/progreso', nombre: textos.navegacion.progreso },
  { ruta: '/rutinas', nombre: textos.navegacion.rutinas },
  { ruta: '/cuenta', nombre: textos.navegacion.cuenta },
];

// Secciones que aún son marcadores «Próximamente».
const RUTA_POR_SECCION = {
  progreso: '/progreso',
  rutinas: '/rutinas',
  cuenta: '/cuenta',
};

describe('shell móvil', () => {
  it('ofrece un enlace para saltar al contenido como primer elemento enfocable', async () => {
    await renderizarEn('/');

    await userEvent.tab();

    const enlace = screen.getByRole('link', { name: textos.shell.saltarAlContenido });
    expect(enlace).toHaveFocus();
    expect(enlace).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });

  it('tiene cabecera con el nombre de la aplicación y navegación principal etiquetada', async () => {
    await renderizarEn('/');

    expect(within(screen.getByRole('banner')).getByText(textos.app.nombre)).toBeInTheDocument();
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });
    const enlaces = within(navegacion).getAllByRole('link');
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(SECCIONES.map((s) => s.nombre));
    for (const enlace of enlaces) {
      expect(enlace).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:outline-2');
    }
  });

  it.each(SECCIONES)('muestra la sección $nombre en $ruta y la marca como actual', async ({ ruta, nombre }) => {
    await renderizarEn(ruta);

    const titulo = ruta === '/historial' ? textos.historial.titulo : nombre;
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });
    expect(within(navegacion).getByRole('link', { name: nombre })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe(`${titulo} · ${textos.app.nombre}`);
  });

  it('muestra el estado vacío y el acceso al registro pasado del historial', async () => {
    await renderizarEn('/historial');

    expect(await screen.findByText(textos.historial.sinResultados)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: textos.historial.registrarPasado })).toHaveAttribute('href', '/?registrarPasado=1');
    expect(screen.queryByText(textos.shell.proximamente)).not.toBeInTheDocument();
  });

  it.each(Object.entries(RUTA_POR_SECCION))('describe el propósito de %s y lo que incluirá', async (clave, ruta) => {
    const seccion = textos.secciones[clave as keyof typeof textos.secciones];
    await renderizarEn(ruta);

    expect(screen.getByText(seccion.descripcion)).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: textos.shell.queIncluira });
    expect(within(lista).getAllByRole('listitem').map((item) => item.textContent)).toEqual([...seccion.incluira]);
  });

  it('los iconos son decorativos y no se anuncian', async () => {
    await renderizarEn('/');

    const iconos = document.querySelectorAll('svg');
    expect(iconos.length).toBeGreaterThan(0);
    for (const icono of iconos) {
      expect(icono).toHaveAttribute('aria-hidden', 'true');
      expect(icono).toHaveAttribute('focusable', 'false');
    }
  });

  it('al navegar con el teclado mueve el foco al título de la nueva sección', async () => {
    const router = await renderizarEn('/');
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });

    within(navegacion).getByRole('link', { name: textos.navegacion.progreso }).focus();
    await userEvent.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe('/progreso');
    expect(screen.getByRole('heading', { level: 1, name: textos.navegacion.progreso })).toHaveFocus();
  });

  it('no roba el foco en la primera carga', async () => {
    await renderizarEn('/');

    expect(document.body).toHaveFocus();
  });

  it('muestra una página de no encontrada con enlace de vuelta al inicio', async () => {
    const router = await renderizarEn('/no-existe');

    expect(screen.getByRole('heading', { level: 1, name: textos.noEncontrada.titulo })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: textos.noEncontrada.volver }));
    expect(router.state.location.pathname).toBe('/');
  });
});
