import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SoloJsonGuard } from './solo-json.guard';
import { Publico } from './publico.decorator';
import { DURACION_SESION_SEGUNDOS } from './auth.config';
import { noAutenticado } from './auth.errors';
import type { PeticionAutenticada } from './auth.types';

const COOKIE = 'gt_sesion';
const COOKIE_SEGURA = Object.freeze({ httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' });
interface RespuestaCookie {
  cookie(name: string, value: string, options: typeof COOKIE_SEGURA & { maxAge: number }): unknown;
  clearCookie(name: string, options: typeof COOKIE_SEGURA): unknown;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @UseGuards(ThrottlerGuard, SoloJsonGuard)
  @Post('registro')
  async registro(@Body() body: unknown, @Res({ passthrough: true }) response: RespuestaCookie) {
    const acceso = await this.auth.registro(body);
    response.cookie(COOKIE, acceso.token, { ...COOKIE_SEGURA, maxAge: DURACION_SESION_SEGUNDOS * 1000 });
    return acceso.usuario;
  }

  @Publico()
  @UseGuards(ThrottlerGuard, SoloJsonGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: RespuestaCookie) {
    const acceso = await this.auth.login(body);
    response.cookie(COOKIE, acceso.token, { ...COOKIE_SEGURA, maxAge: DURACION_SESION_SEGUNDOS * 1000 });
    return acceso.usuario;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: RespuestaCookie) {
    // Cierra este navegador; los otros dispositivos conservan su propia cookie.
    response.clearCookie(COOKIE, { ...COOKIE_SEGURA });
  }

  @Get('yo')
  yo(@Req() request: PeticionAutenticada) {
    if (!request.usuario) throw noAutenticado();
    return request.usuario;
  }
}
