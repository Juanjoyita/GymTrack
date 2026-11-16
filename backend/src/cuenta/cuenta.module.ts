import { Module } from '@nestjs/common';
import { CuentaController } from './cuenta.controller';
import { CuentaService } from './cuenta.service';
import { SoloJsonGuard } from '../auth/solo-json.guard';

@Module({ controllers: [CuentaController], providers: [CuentaService, SoloJsonGuard] })
export class CuentaModule {}
