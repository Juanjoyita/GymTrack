import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entrenamiento } from '../database/entities/entrenamiento';
import { Ejercicio } from '../database/entities/ejercicio';
import { EjercicioRealizado } from '../database/entities/ejercicio_realizado';
import { Serie } from '../database/entities/serie';
import { SesionesService } from './sesiones.service';
import { EjerciciosRealizadosService } from './ejercicios-realizados.service';
import { SeriesService } from './series.service';
import { PresentacionEntrenamientos } from './presentacion';
import { EntrenamientosController } from './entrenamientos.controller';
import { HistorialService } from './historial.service';

@Module({
  imports: [TypeOrmModule.forFeature([Entrenamiento, Ejercicio, EjercicioRealizado, Serie])],
  controllers: [EntrenamientosController],
  providers: [SesionesService, EjerciciosRealizadosService, SeriesService, PresentacionEntrenamientos, HistorialService],
})
export class EntrenamientosModule {}
