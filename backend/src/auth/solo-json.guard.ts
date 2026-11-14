import { BadRequestException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

@Injectable()
export class SoloJsonGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const type = request.headers['content-type'];
    if (typeof type !== 'string' || !/^application\/json(?:\s*;|$)/i.test(type)) {
      throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Envía la solicitud como JSON.', campos: null, actual: null });
    }
    return true;
  }
}
