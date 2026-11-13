import { z } from 'zod';
export const esquemaEjercicio = z.object({
  nombre: z.string().trim().min(1).max(100), grupoMuscular: z.string().trim().min(1).max(50).optional(),
});
