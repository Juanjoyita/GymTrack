import { z } from 'zod';

const nombre = z.string().trim().min(1).max(80);
const diaSemana = z.number().int().min(1).max(7);
const ejercicioIds = z.array(z.uuid()).min(1);

/** Datos compartidos para crear una rutina y establecer el orden completo de sus ejercicios. */
export const esquemaRutina = z.object({ nombre, diaSemana, ejercicioIds });

/** Una actualización sustituye, si se envía, la lista completa en el orden recibido. */
export const esquemaActualizacionRutina = z.object({
  nombre: nombre.optional(),
  diaSemana: diaSemana.optional(),
  ejercicioIds: ejercicioIds.optional(),
  version: z.number().int().min(1),
}).refine((entrada) => entrada.nombre !== undefined
  || entrada.diaSemana !== undefined
  || entrada.ejercicioIds !== undefined, { message: 'Indica al menos un campo para actualizar.' });
