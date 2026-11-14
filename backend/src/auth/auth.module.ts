import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../database/entities/usuario';
import { AuthGuard } from '../comun/auth.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SoloJsonGuard } from './solo-json.guard';
import { opcionesJwt } from './auth.config';

// Preparado para importar en AppModule en T023; no expone rutas de producto todavía.
@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    JwtModule.registerAsync({ useFactory: () => opcionesJwt() }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, ThrottlerGuard, SoloJsonGuard, { provide: APP_GUARD, useExisting: AuthGuard }],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
