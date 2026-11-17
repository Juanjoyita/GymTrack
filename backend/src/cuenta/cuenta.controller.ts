import { Body, Controller, Delete, Get, HttpCode, Patch, Query, Req, Res, UseGuards } from '@nestjs/common';
import { COOKIE, COOKIE_SEGURA, type RespuestaCookie } from '../auth/auth.cookie';
import { CuentaService } from './cuenta.service';
import { SoloJsonGuard } from '../auth/solo-json.guard';
import { noAutenticado } from '../auth/auth.errors';
import type { PeticionAutenticada } from '../auth/auth.types';

function usuarioId(request: PeticionAutenticada) {
  if (!request.usuario) throw noAutenticado();
  return request.usuario.id;
}
interface RespuestaExportacion { setHeader(nombre: string, valor: string): void; send(contenido: unknown): void }

@Controller()
export class CuentaController {
  constructor(private readonly cuenta: CuentaService) {}

  @Patch('cuenta/preferencias')
  @UseGuards(SoloJsonGuard)
  preferencias(@Req() request: PeticionAutenticada, @Body() body: unknown) {
    return this.cuenta.preferencias(usuarioId(request), body);
  }

  @Delete('cuenta')
  @UseGuards(SoloJsonGuard)
  @HttpCode(204)
  async eliminar(@Req() request: PeticionAutenticada, @Body() body: unknown, @Res({ passthrough: true }) response: RespuestaCookie) {
    await this.cuenta.eliminar(usuarioId(request), body);
    response.clearCookie(COOKIE, { ...COOKIE_SEGURA });
  }

  @Get('exportacion')
  async exportacion(@Req() request: PeticionAutenticada, @Query('formato') formato: unknown, @Res() response: RespuestaExportacion) {
    const archivo = await this.cuenta.exportar(usuarioId(request), formato);
    response.setHeader('Content-Type', archivo.tipo);
    response.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(archivo.contenido);
  }
}
