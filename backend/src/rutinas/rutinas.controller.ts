import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { PeticionAutenticada } from '../auth/auth.types';
import { noAutenticado } from '../auth/auth.errors';
import { entero, uuid, versionQuery } from '../entrenamientos/entradas';
import { RutinasService } from './rutinas.service';

const usuario = (req: PeticionAutenticada) => {
  if (!req.usuario) throw noAutenticado();
  return req.usuario.id;
};

@Controller('rutinas')
export class RutinasController {
  constructor(private readonly rutinas: RutinasService) {}

  @Get()
  listar(@Req() req: PeticionAutenticada) {
    return this.rutinas.listar(usuario(req));
  }

  @Post()
  crear(@Req() req: PeticionAutenticada, @Body() body: unknown) {
    return this.rutinas.crear(usuario(req), body);
  }

  @Get(':id')
  obtener(@Req() req: PeticionAutenticada, @Param('id') id: string) {
    return this.rutinas.obtener(usuario(req), uuid(id));
  }

  @Patch(':id')
  actualizar(@Req() req: PeticionAutenticada, @Param('id') id: string, @Body() body: unknown) {
    return this.rutinas.actualizar(usuario(req), uuid(id), body);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Req() req: PeticionAutenticada, @Param('id') id: string, @Query('version') version: string) {
    await this.rutinas.eliminar(usuario(req), uuid(id), entero(versionQuery(version), 'version'));
  }
}
