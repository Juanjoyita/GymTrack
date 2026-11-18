import { z } from 'zod';
// Contraseña de 8 a 128 caracteres (data-model «usuario»).
export const esquemaRegistro = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });
export const esquemaLogin = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

export const esquemaRecuperar = z.object({ email: esquemaRegistro.shape.email.transform((email) => email.toLowerCase()) }).strict();
export const esquemaRestablecer = z.object({
  token: z.string().min(1).max(512),
  contrasenaNueva: esquemaRegistro.shape.password,
}).strict();
