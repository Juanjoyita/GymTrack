import { describe, expect, it } from 'vitest';
import { esquemaRecuperar, esquemaRestablecer } from '../src/validacion/auth';

describe('T046: validación compartida de recuperación', () => {
  it('normaliza email y exige formato válido', () => {
    expect(esquemaRecuperar.parse({ email: '  T046@EXAMPLE.INVALID ' }).email).toBe('t046@example.invalid');
    expect(esquemaRecuperar.safeParse({ email: 'no-email' }).success).toBe(false);
  });
  it.each([8, 128])('acepta contraseña nueva de %i caracteres', (n) => {
    expect(esquemaRestablecer.safeParse({ token: 't'.repeat(64), contrasenaNueva: 'x'.repeat(n) }).success).toBe(true);
  });
  it.each([0, 7, 129])('rechaza contraseña nueva de %i caracteres', (n) => {
    expect(esquemaRestablecer.safeParse({ token: 't'.repeat(64), contrasenaNueva: 'x'.repeat(n) }).success).toBe(false);
  });
  it.each(['', 't'.repeat(513), null])('rechaza token vacío, excesivo o no textual', (token) => {
    expect(esquemaRestablecer.safeParse({ token, contrasenaNueva: 'x'.repeat(8) }).success).toBe(false);
  });
});
