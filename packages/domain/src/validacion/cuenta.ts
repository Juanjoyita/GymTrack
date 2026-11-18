import { z } from 'zod';
import { esquemaLogin } from './auth';

const zonaHoraria = z.string().min(1).max(64).refine((zona) => {
  try { new Intl.DateTimeFormat('es', { timeZone: zona }); return true; }
  catch { return false; }
});
export const esquemaPreferencias = z.object({
  unidadPeso: z.enum(['kg', 'lb']).optional(), zonaHoraria: zonaHoraria.optional(),
}).strict().refine((data) => data.unidadPeso !== undefined || data.zonaHoraria !== undefined);

export const esquemaEliminarCuenta = z.object({ contrasena: esquemaLogin.shape.password }).strict();
