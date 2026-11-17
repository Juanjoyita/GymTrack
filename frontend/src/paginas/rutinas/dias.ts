import { textos } from '../../textos/es';

/** Día ISO 8601 de una fecha: 1 = lunes … 7 = domingo (data-model, rutina.dia_semana). */
export const diaIso = (fecha = new Date()) => ((fecha.getDay() + 6) % 7) + 1;

export const nombreDia = (dia: number) => textos.rutinas.dias[dia - 1];
