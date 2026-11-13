import { z } from 'zod';
export const esquemaRegistro = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });
export const esquemaLogin = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
