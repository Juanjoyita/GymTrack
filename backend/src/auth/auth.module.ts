import { CorreoModule } from '../correo/correo.module';
import { RecuperacionService } from './recuperacion.service';
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

const limiteAccesoPorMinuto = process.env.GYMTRACK_E2E === '1' ? 100 : 10;

// Acceso P1, con guard global al importar este módulo desde AppModule.
@Module({
  imports: [
    CorreoModule,
    TypeOrmModule.forFeature([Usuario]),
    JwtModule.registerAsync({ useFactory: () => opcionesJwt() }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: limiteAccesoPorMinuto }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, RecuperacionService, AuthGuard, ThrottlerGuard, SoloJsonGuard, { provide: APP_GUARD, useExisting: AuthGuard }],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
