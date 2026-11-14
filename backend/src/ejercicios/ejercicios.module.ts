import { Module } from '@nestjs/common';
import { EjerciciosController } from './ejercicios.controller';
import { UltimaSesionService } from './ultima-sesion.service';
import { EjerciciosService } from './ejercicios.service';

// Rutas P1 protegidas por el guard global de AuthModule.
@Module({
  controllers: [EjerciciosController],
  providers: [EjerciciosService, UltimaSesionService],
  exports: [EjerciciosService],
})
export class EjerciciosModule {}
