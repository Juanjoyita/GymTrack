import { z } from 'zod';
// Contraseña de 8 a 128 caracteres (data-model «usuario»).
export const esquemaRegistro = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });
export const esquemaLogin = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
