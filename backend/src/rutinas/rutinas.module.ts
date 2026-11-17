import { Module } from '@nestjs/common';
import { RutinasController } from './rutinas.controller';
import { RutinasService } from './rutinas.service';

@Module({ controllers: [RutinasController], providers: [RutinasService] })
export class RutinasModule {}
