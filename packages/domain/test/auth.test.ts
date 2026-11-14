import { describe, expect, it } from 'vitest';
import { esquemaLogin, esquemaRegistro } from '../src/validacion/auth';

// data-model «usuario»: contraseña de 8 a 128 caracteres.
describe('validación de acceso', () => {
  const email = 'ana@example.com';

  it.each([8, 128])('el registro acepta contraseñas de %i caracteres', (longitud) => {
    expect(esquemaRegistro.safeParse({ email, password: 'x'.repeat(longitud) }).success).toBe(true);
  });

  it.each([7, 129])('el registro rechaza contraseñas de %i caracteres', (longitud) => {
    expect(esquemaRegistro.safeParse({ email, password: 'x'.repeat(longitud) }).success).toBe(false);
  });

  it('exige un email válido y lo recorta', () => {
    expect(esquemaRegistro.parse({ email: '  ana@example.com ', password: 'x'.repeat(8) }).email).toBe(email);
    expect(esquemaRegistro.safeParse({ email: 'ana', password: 'x'.repeat(8) }).success).toBe(false);
  });

  it('el login solo exige una contraseña no vacía', () => {
    expect(esquemaLogin.safeParse({ email, password: 'x' }).success).toBe(true);
    expect(esquemaLogin.safeParse({ email, password: '' }).success).toBe(false);
  });
});
