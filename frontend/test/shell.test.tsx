import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Proveedores } from '../src/app/Proveedores';
import { rutas } from '../src/app/rutas';
import { textos } from '../src/textos/es';

function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return router;
}

const SECCIONES = [
  { ruta: '/', nombre: textos.navegacion.entrenar },
  { ruta: '/historial', nombre: textos.navegacion.historial },
  { ruta: '/progreso', nombre: textos.navegacion.progreso },
  { ruta: '/rutinas', nombre: textos.navegacion.rutinas },
  { ruta: '/cuenta', nombre: textos.navegacion.cuenta },
];

const RUTA_POR_SECCION = {
  entrenar: '/',
  historial: '/historial',
  progreso: '/progreso',
  rutinas: '/rutinas',
  cuenta: '/cuenta',
};

describe('shell móvil', () => {
  it('ofrece un enlace para saltar al contenido como primer elemento enfocable', async () => {
    renderizarEn('/');

    await userEvent.tab();

    const enlace = screen.getByRole('link', { name: textos.shell.saltarAlContenido });
    expect(enlace).toHaveFocus();
    expect(enlace).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });

  it('tiene cabecera con el nombre de la aplicación y navegación principal etiquetada', () => {
    renderizarEn('/');

    expect(within(screen.getByRole('banner')).getByText(textos.app.nombre)).toBeInTheDocument();
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });
    const enlaces = within(navegacion).getAllByRole('link');
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(SECCIONES.map((s) => s.nombre));
    for (const enlace of enlaces) {
      expect(enlace).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:outline-2');
    }
  });

  it.each(SECCIONES)('muestra la sección $nombre en $ruta y la marca como actual', ({ ruta, nombre }) => {
    renderizarEn(ruta);

    expect(screen.getByRole('heading', { level: 1, name: nombre })).toBeInTheDocument();
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });
    expect(within(navegacion).getByRole('link', { name: nombre })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe(`${nombre} · ${textos.app.nombre}`);
  });

  it('indica con texto que la sección aún no está disponible, sin implementar sus flujos', () => {
    renderizarEn('/historial');

    expect(screen.getByText(textos.shell.proximamente)).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each(Object.entries(RUTA_POR_SECCION))('describe el propósito de %s y lo que incluirá', (clave, ruta) => {
    const seccion = textos.secciones[clave as keyof typeof textos.secciones];
    renderizarEn(ruta);

    expect(screen.getByText(seccion.descripcion)).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: textos.shell.queIncluira });
    expect(within(lista).getAllByRole('listitem').map((item) => item.textContent)).toEqual([...seccion.incluira]);
  });

  it('los iconos son decorativos y no se anuncian', () => {
    renderizarEn('/');

    const iconos = document.querySelectorAll('svg');
    expect(iconos.length).toBeGreaterThan(0);
    for (const icono of iconos) {
      expect(icono).toHaveAttribute('aria-hidden', 'true');
      expect(icono).toHaveAttribute('focusable', 'false');
    }
  });

  it('al navegar con el teclado mueve el foco al título de la nueva sección', async () => {
    const router = renderizarEn('/');
    const navegacion = screen.getByRole('navigation', { name: textos.navegacion.etiqueta });

    within(navegacion).getByRole('link', { name: textos.navegacion.progreso }).focus();
    await userEvent.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe('/progreso');
    expect(screen.getByRole('heading', { level: 1, name: textos.navegacion.progreso })).toHaveFocus();
  });

  it('no roba el foco en la primera carga', () => {
    renderizarEn('/');

    expect(document.body).toHaveFocus();
  });

  it('muestra una página de no encontrada con enlace de vuelta al inicio', async () => {
    const router = renderizarEn('/no-existe');

    expect(screen.getByRole('heading', { level: 1, name: textos.noEncontrada.titulo })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: textos.noEncontrada.volver }));
    expect(router.state.location.pathname).toBe('/');
  });
});
