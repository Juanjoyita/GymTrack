import type { JwtModuleOptions } from '@nestjs/jwt';

export const DURACION_SESION_SEGUNDOS = 7 * 24 * 60 * 60;

export function opcionesJwt(env: NodeJS.ProcessEnv = process.env): JwtModuleOptions {
  const secret = env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret.trim()) < 32) {
    throw new Error('Configura JWT_SECRET con al menos 32 bytes aleatorios antes de habilitar AuthModule.');
  }
  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: DURACION_SESION_SEGUNDOS, issuer: 'gymtrack', audience: 'gymtrack-web' },
    verifyOptions: { algorithms: ['HS256'], issuer: 'gymtrack', audience: 'gymtrack-web' },
  };
}
