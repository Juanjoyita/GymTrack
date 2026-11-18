import { kgALb } from '@gymtrack/domain';
import type { SesionProgreso } from '../../api/progreso';

export type Unidad = 'kg' | 'lb';

/** Punto de una sesión en la unidad del usuario. Los valores no se redondean: solo se formatean al mostrarlos. */
export interface PuntoProgreso {
  entrenamientoId: string;
  fecha: string;
  pesoMax: number;
  volumen: number;
  unoRm: number | null;
}

const enUnidad = (kg: number, unidad: Unidad) => (unidad === 'kg' ? kg : kgALb(kg));

/**
 * Única transformación de la respuesta de la API: alimenta el gráfico y la tabla, de modo que ambos
 * muestran exactamente los mismos datos (FR-019).
 */
export function puntosProgreso(sesiones: readonly SesionProgreso[], unidad: Unidad): PuntoProgreso[] {
  return sesiones.map((s) => ({
    entrenamientoId: s.entrenamientoId,
    fecha: s.fecha,
    pesoMax: enUnidad(s.pesoMaxKg, unidad),
    volumen: enUnidad(s.volumenKg, unidad),
    unoRm: s.unoRmKg === null ? null : enUnidad(s.unoRmKg, unidad),
  }));
}

export const convertir = enUnidad;

const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
const numeroCorto = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
// Las fechas de la API son días locales (YYYY-MM-DD): se formatean en UTC para no desplazarlas.
const fechaLarga = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

export const formatoNumero = (valor: number) => numero.format(valor);
export const formatoPeso = (valor: number, unidad: Unidad) => `${formatoNumero(valor)} ${unidad}`;
export const formatoEje = (valor: number) => numeroCorto.format(valor);
export const formatoFecha = (fecha: string) => fechaLarga.format(dia(fecha));
export const formatoFechaCorta = (fecha: string) => fechaCorta.format(dia(fecha));
