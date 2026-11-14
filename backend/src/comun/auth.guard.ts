import { Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { noAutenticado } from '../auth/auth.errors';
import { RUTA_PUBLICA } from '../auth/publico.decorator';
import type { PeticionAutenticada } from '../auth/auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(RUTA_PUBLICA, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<PeticionAutenticada>();
    // Ignorar identidad preexistente, Authorization, query y cuerpo: solo cookie firmada.
    delete req.usuario;
    const cookies = typeof req.headers.cookie === 'string' ? req.headers.cookie.split(';') : [];
    const matches = cookies.map((cookie) => cookie.trim()).filter((cookie) => cookie.startsWith('gt_sesion='));
    if (matches.length !== 1) throw noAutenticado();
    let token: string;
    try { token = decodeURIComponent(matches[0].slice('gt_sesion='.length)); }
    catch { throw noAutenticado(); }
    if (!token || token.length > 4096) throw noAutenticado();
    req.usuario = await this.auth.sesion(token);
    return true;
  }
}

// Los servicios futuros deben además consultar con usuario_id de req.usuario, incluso para recursos anidados.
export function exigirPropiedad<T extends { usuario_id: string }>(usuarioId: string, recurso: T | null | undefined): T {
  if (!recurso || recurso.usuario_id !== usuarioId) throw new NotFoundException({
    codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.', campos: null, actual: null,
  });
  return recurso;
}
