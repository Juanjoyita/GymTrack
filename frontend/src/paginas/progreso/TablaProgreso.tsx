import { textos } from '../../textos/es';
import { formatoFecha, formatoNumero, type PuntoProgreso, type Unidad } from './datos';

const t = textos.progreso;

/** Tabla equivalente al gráfico (FR-019, Principio VI): los mismos puntos, sesión a sesión. La unidad va en la cabecera. */
export function TablaProgreso({ puntos, unidad }: { puntos: readonly PuntoProgreso[]; unidad: Unidad }) {
  const celda = 'whitespace-nowrap px-3 py-2.5 text-right tabular-nums';
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <caption className="px-3 pb-2 pt-3 text-left">
          <span className="block font-display text-xl font-bold text-white">{t.tabla}</span>
          <span className="block text-sm text-slate-400">{t.tablaDetalle}</span>
        </caption>
        <thead>
          <tr className="border-y border-white/10 bg-white/5 text-xs text-slate-300">
            <th scope="col" className="px-3 py-2 text-left font-semibold">{t.fecha}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t.conUnidad(t.pesoMax, unidad)}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t.conUnidad(t.volumen, unidad)}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t.conUnidad(t.unoRm, unidad)}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {puntos.map((p) => (
            <tr key={p.entrenamientoId}>
              <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-slate-200">{formatoFecha(p.fecha)}</th>
              <td className={`${celda} text-white`}>{formatoNumero(p.pesoMax)}</td>
              <td className={`${celda} text-white`}>{formatoNumero(p.volumen)}</td>
              <td className={`${celda} ${p.unoRm === null ? 'text-slate-400' : 'text-white'}`}>{p.unoRm === null ? t.sin1rm : formatoNumero(p.unoRm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
