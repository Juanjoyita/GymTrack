import { calcularVolumen } from '@gymtrack/domain';
import type { ReactNode } from 'react';
import type { Entrenamiento } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { IconoCheck } from '../../componentes/Iconos';
import { textos } from '../../textos/es';

const t = textos.entrenar;

export interface Resumen { ejercicios: number; series: number; volumenKg: number; duracionMin: number }

export function resumenDe(e: Entrenamiento, fin = e.fin ?? new Date().toISOString()): Resumen {
  const series = e.ejercicios.flatMap((r) => r.series);
  return {
    ejercicios: e.ejercicios.length, series: series.length, volumenKg: calcularVolumen(series),
    duracionMin: Math.max(0, Math.round((new Date(fin).getTime() - new Date(e.inicio).getTime()) / 60_000)),
  };
}

/** Resumen de un entrenamiento terminado: ejercicios, series, duración y volumen (US1 escenario 10). */
export function ResumenFinal({ titulo = t.finalizado, resumen, onVolver, pendiente = false, contador }: {
  titulo?: string; resumen: Resumen; onVolver?: () => void; pendiente?: boolean; contador?: ReactNode;
}) {
  const volumen = new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(resumen.volumenKg);
  const datos = [[t.duracion, t.minutos(resumen.duracionMin)], [t.volumen, `${volumen} kg`]];
  return (
    <section aria-labelledby="titulo-final" className="flex flex-col gap-5 rounded-3xl border border-lime-300/30 bg-slate-900 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-lime-300 text-slate-950"><IconoCheck className="size-6" /></span>
        <h2 id="titulo-final" className="font-display text-3xl font-bold text-white">{titulo}</h2>
      </div>
      <p className="text-lg text-slate-200">{t.hiciste(t.ejercicios(resumen.ejercicios), t.series(resumen.series))}</p>
      {pendiente && <><p className="text-amber-300">{t.finalizadoPendiente}</p>{contador}</>}
      <dl className="grid grid-cols-2 gap-3">
        {datos.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-2xl bg-white/5 p-4">
            <dt className="text-sm text-slate-400">{etiqueta}</dt>
            <dd className="font-display text-2xl font-bold text-white">{valor}</dd>
          </div>
        ))}
      </dl>
      {onVolver && <Boton variante="secundario" onClick={onVolver}>{t.volver}</Boton>}
    </section>
  );
}
