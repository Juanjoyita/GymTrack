import { CuentaModule } from './cuenta/cuenta.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { EjerciciosModule } from './ejercicios/ejercicios.module';
import { EntrenamientosModule } from './entrenamientos/entrenamientos.module';
import { databaseOptions } from './database/data-source';
import { ProgresoModule } from './progreso/progreso.module';
import { RutinasModule } from './rutinas/rutinas.module';

@Module({
  imports: [TypeOrmModule.forRootAsync({
    useFactory: () => ({ ...databaseOptions(), retryAttempts: 0, verboseRetryLog: false })
  }), AuthModule, EjerciciosModule, EntrenamientosModule, ProgresoModule, CuentaModule, RutinasModule]
})
export class AppModule {}
