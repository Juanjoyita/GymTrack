import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { PeticionAutenticada } from '../auth/auth.types';
import { noAutenticado } from '../auth/auth.errors';
import { ProgresoService } from './progreso.service';

const usuario = (req: PeticionAutenticada) => {
  if (!req.usuario) throw noAutenticado();
  return req.usuario.id;
};

@Controller('progreso')
export class ProgresoController {
  constructor(private readonly progreso: ProgresoService) {}

  @Get(':ejercicioId/records')
  records(
    @Req() req: PeticionAutenticada,
    @Param('ejercicioId') ejercicioId: string,
    @Query('excluirEntrenamientoId') excluirEntrenamientoId?: string,
  ) {
    return this.progreso.records(usuario(req), ejercicioId, excluirEntrenamientoId);
  }

  @Get(':ejercicioId')
  obtener(
    @Req() req: PeticionAutenticada,
    @Param('ejercicioId') ejercicioId: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.progreso.obtener(usuario(req), ejercicioId, periodo);
  }
}
