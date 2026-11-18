import { z } from 'zod';
export const esquemaEntrenamiento = z.object({
  inicio: z.string().datetime({ offset: true }).optional(), fecha: z.string().date().optional(),
  zonaHoraria: z.string().min(1).max(100).optional(), nota: z.string().max(2000).nullable().optional(),
});
