import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { noAutenticado } from '../auth/auth.errors';
import type { PeticionAutenticada } from '../auth/auth.types';
import { EjerciciosService } from './ejercicios.service';

// El usuario sale siempre de la sesión que valida el AuthGuard global (R-03, R-04).
function usuarioId(request: PeticionAutenticada) {
  if (!request.usuario) throw noAutenticado();
  return request.usuario.id;
}

@Controller('ejercicios')
export class EjerciciosController {
  constructor(private readonly ejercicios: EjerciciosService) {}

  @Get()
  listar(@Req() request: PeticionAutenticada, @Query() consulta: { q?: unknown; limite?: unknown }) {
    return this.ejercicios.listar(usuarioId(request), consulta);
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
