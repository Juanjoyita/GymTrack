import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Boton } from '../src/componentes/Boton';
import { Campo } from '../src/componentes/Campo';

// jsdom no calcula tamaños: se comprueban las clases que garantizan 44×44 px (h-11/w-11 = 2.75rem).
const TAMANO_TACTIL = ['min-h-11', 'min-w-11'];
const FOCO_VISIBLE = 'focus-visible:outline-2';

describe('Boton', () => {
  it('es un botón accesible con área táctil mínima y foco visible', () => {
    render(<Boton>Guardar</Boton>);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toHaveAttribute('type', 'button');
    for (const clase of TAMANO_TACTIL) expect(boton).toHaveClass(clase);
    expect(boton).toHaveClass(FOCO_VISIBLE);
  });

  it('se activa con el teclado', async () => {
    const alPulsar = vi.fn();
    render(<Boton onClick={alPulsar}>Guardar</Boton>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(alPulsar).toHaveBeenCalledTimes(2);
  });
});

describe('Campo', () => {
  it('asocia la etiqueta visible con el control', () => {
    render(<Campo etiqueta="Email" type="email" />);

    const control = screen.getByLabelText('Email');
    expect(control).toHaveAttribute('type', 'email');
    expect(control).not.toHaveAttribute('aria-invalid');
    for (const clase of TAMANO_TACTIL) expect(control).toHaveClass(clase);
    expect(control).toHaveClass(FOCO_VISIBLE);
  });

  it('muestra el error junto al campo y lo anuncia como descripción', () => {
    render(<Campo etiqueta="Repeticiones" error="Debe ser un número entero entre 1 y 100." />);

    const control = screen.getByLabelText('Repeticiones');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription('Debe ser un número entero entre 1 y 100.');
  });

  it('el error no depende solo del color: incluye texto', () => {
    render(<Campo etiqueta="Peso" error="Máximo 500 kg." />);

    expect(screen.getByText('Máximo 500 kg.')).toBeVisible();
  });
});
