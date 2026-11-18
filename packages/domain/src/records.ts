import type { MetricaSesion } from './metricas';

export interface RecordPersonal {
  valorKg: number;
  fecha: string;
  entrenamientoId: string;
}

export interface RecordsPersonales {
  sesionesAnteriores: number;
  pesoMax: RecordPersonal | null;
  unoRm: RecordPersonal | null;
  volumenSesion: RecordPersonal | null;
}

/** Deriva los máximos desde las métricas actuales, por lo que ediciones y borrados se reflejan. */
export function detectarRecordsPersonales(sesiones: readonly MetricaSesion[]): RecordsPersonales {
  const ordenadas = [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const mayor = (valor: (sesion: MetricaSesion) => number | null): RecordPersonal | null => {
    let record: RecordPersonal | null = null;
    for (const sesion of ordenadas) {
      const candidato = valor(sesion);
      if (candidato !== null && (record === null || candidato > record.valorKg)) {
        record = { valorKg: candidato, fecha: sesion.fecha, entrenamientoId: sesion.entrenamientoId };
      }
    }
    return record;
  };

  return {
    sesionesAnteriores: sesiones.length,
    pesoMax: mayor((sesion) => sesion.pesoMaxKg),
    unoRm: mayor((sesion) => sesion.unoRmKg),
    volumenSesion: mayor((sesion) => sesion.volumenKg),
  };
}
