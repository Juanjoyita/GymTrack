import { z } from 'zod';

// Grupos musculares del enum grupo_muscular_enum (data-model «ejercicio»).
export const GRUPOS_MUSCULARES = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'antebrazos', 'cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'abdomen'] as const;
export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number];

const nombre = z.string().trim().min(1).max(80);
const grupoMuscular = z.enum(GRUPOS_MUSCULARES);

export const esquemaEjercicio = z.object({ nombre, grupoMuscular });

/** PATCH /ejercicios/:id: nombre y/o grupo muscular. */
export const esquemaActualizacionEjercicio = z.object({ nombre: nombre.optional(), grupoMuscular: grupoMuscular.optional() })
  .refine((datos) => datos.nombre !== undefined || datos.grupoMuscular !== undefined, { message: 'Indica nombre o grupo muscular.' });
