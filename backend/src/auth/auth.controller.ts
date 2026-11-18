import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { RecuperacionService } from './recuperacion.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SoloJsonGuard } from './solo-json.guard';
import { Publico } from './publico.decorator';
import { DURACION_SESION_SEGUNDOS } from './auth.config';
import { noAutenticado } from './auth.errors';
import type { PeticionAutenticada } from './auth.types';

import { COOKIE, COOKIE_SEGURA, type RespuestaCookie } from './auth.cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly recuperacion: RecuperacionService) {}

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

  @Publico()
  @UseGuards(ThrottlerGuard, SoloJsonGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('recuperar')
  @HttpCode(202)
  recuperar(@Body() body: unknown) { return this.recuperacion.recuperar(body); }

  @Publico()
  @UseGuards(ThrottlerGuard, SoloJsonGuard)
  @Post('restablecer')
  @HttpCode(204)
  restablecer(@Body() body: unknown) { return this.recuperacion.restablecer(body); }

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
