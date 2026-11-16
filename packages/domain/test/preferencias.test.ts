import { describe, expect, it } from 'vitest';
import { esquemaPreferencias } from '../src/validacion/cuenta';

describe('T047: preferencias compartidas', () => {
  it.each([{ unidadPeso: 'kg' }, { unidadPeso: 'lb' }, { zonaHoraria: 'Europe/Madrid' }, { zonaHoraria: 'America/Bogota', unidadPeso: 'lb' }])('acepta un cambio parcial válido', (dato) => {
    expect(esquemaPreferencias.parse(dato)).toEqual(dato);
  });
  it.each([{}, { unidadPeso: 'oz' }, { zonaHoraria: 'No/Existe' }, { zonaHoraria: '' }, { usuarioId: 'otro', unidadPeso: 'lb' }])('rechaza preferencias inválidas o campos de identidad', (dato) => {
    expect(esquemaPreferencias.safeParse(dato).success).toBe(false);
  });
});
