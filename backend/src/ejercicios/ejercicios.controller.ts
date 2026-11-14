import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { noAutenticado } from '../auth/auth.errors';
import type { PeticionAutenticada } from '../auth/auth.types';
import { UltimaSesionService } from './ultima-sesion.service';
import { uuid } from '../entrenamientos/entradas';
import { EjerciciosService } from './ejercicios.service';

// El usuario sale siempre de la sesión que valida el AuthGuard global (R-03, R-04).
function usuarioId(request: PeticionAutenticada) {
  if (!request.usuario) throw noAutenticado();
  return request.usuario.id;
}

@Controller('ejercicios')
export class EjerciciosController {
  constructor(private readonly ejercicios: EjerciciosService, private readonly ultimaSesion: UltimaSesionService) {}

  @Get()
  listar(@Req() request: PeticionAutenticada, @Query() consulta: { q?: unknown; limite?: unknown }) {
    return this.ejercicios.listar(usuarioId(request), consulta);
  }

  @Get(':id/ultima-sesion')
  async ultima(@Req() request: PeticionAutenticada, @Param('id') id: string, @Res() response: { json(body: unknown): unknown }) {
    // Nest envía cuerpo vacío al devolver null; el contrato requiere JSON null explícito.
    return response.json(await this.ultimaSesion.obtener(usuarioId(request), uuid(id)));
  }

  @Post()
  crear(@Req() request: PeticionAutenticada, @Body() body: unknown) {
    return this.ejercicios.crear(usuarioId(request), body);
  }

  @Patch(':id')
  actualizar(@Req() request: PeticionAutenticada, @Param('id') id: string, @Body() body: unknown) {
    return this.ejercicios.actualizar(usuarioId(request), id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Req() request: PeticionAutenticada, @Param('id') id: string) {
    await this.ejercicios.eliminar(usuarioId(request), id);
  }
}
