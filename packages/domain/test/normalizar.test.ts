import { describe, expect, it } from 'vitest';
import { normalizarNombre } from '../src/normalizar';

describe('normalización de nombres', () => {
  it('elimina tildes y pasa a minúsculas', () => {
    expect(normalizarNombre('  Press de BÁNCA  ')).toBe('press de banca');
  });

  it('normaliza caracteres acentuados sin alterar el texto restante', () => {
    expect(normalizarNombre('Extensión de tríceps')).toBe('extension de triceps');
  });
});
