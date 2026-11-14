import { Module } from '@nestjs/common';
import { EjerciciosController } from './ejercicios.controller';
import { EjerciciosService } from './ejercicios.service';

// Preparado para importar en AppModule en T023, junto con AuthModule (guard global).
// GET /ejercicios/:id/ultima-sesion corresponde a T022.
@Module({
  controllers: [EjerciciosController],
  providers: [EjerciciosService],
  exports: [EjerciciosService],
})
export class EjerciciosModule {}
