import { UnauthorizedException } from '@nestjs/common';

export function noAutenticado() {
  // Idéntico para cuenta inexistente, contraseña incorrecta y sesión inválida.
  return new UnauthorizedException({ codigo: 'NO_AUTENTICADO', mensaje: 'No se pudo validar el acceso. Inicia sesión de nuevo.', campos: null, actual: null });
}
