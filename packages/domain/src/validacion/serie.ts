import { z } from 'zod';

const pesoEntrada = z.object({ valor: z.number().finite().min(0), unidad: z.enum(['kg', 'lb']) })
  .superRefine(({ valor, unidad }, ctx) => {
    if (Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-8) {
      ctx.addIssue({ code: 'custom', message: 'Máximo dos decimales.', path: ['valor'] });
    }
    if ((unidad === 'kg' ? valor : valor / 2.2046226218487757) > 500) {
      ctx.addIssue({ code: 'custom', message: 'No puede superar 500 kg.', path: ['valor'] });
    }
  });

export const esquemaSerie = z.object({
  repeticiones: z.number().int().min(1).max(100),
  pesoKg: z.number().finite().min(0).max(500).refine((peso) => Math.abs(peso * 100 - Math.round(peso * 100)) <= 1e-8, 'Máximo dos decimales.').optional(),
  pesoEntrada: pesoEntrada.optional(),
}).refine((serie) => serie.pesoKg !== undefined || serie.pesoEntrada !== undefined, {
  message: 'Se requiere un peso.', path: ['pesoKg'],
});
export type SerieValidada = z.infer<typeof esquemaSerie>;
