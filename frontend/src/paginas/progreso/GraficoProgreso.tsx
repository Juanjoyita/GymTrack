import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { textos } from '../../textos/es';
import { formatoEje, formatoFecha, formatoFechaCorta, formatoPeso, type PuntoProgreso, type Unidad } from './datos';

const t = textos.progreso;

// Paleta validada con el script de la skill dataviz sobre la superficie slate-950/900 (modo oscuro):
// banda de luminosidad, croma, separación con daltonismo (ΔE ≥ 26) y contraste ≥ 3:1. El lima de marca
// (#bef264) es demasiado claro para marcas de gráfico; se usa su paso lime-600.
const SERIE = { pesoMax: '#65a30d', unoRm: '#3987e5', volumen: '#d95926' } as const;
const TINTA = { secundaria: '#94a3b8', rejilla: 'rgba(255,255,255,0.08)', superficie: '#0f172a' } as const;

const ejeX = { dataKey: 'fecha', tickFormatter: formatoFechaCorta, tick: { fill: TINTA.secundaria, fontSize: 12 }, tickLine: false, axisLine: { stroke: TINTA.rejilla }, minTickGap: 16 };
const ejeY = { tick: { fill: TINTA.secundaria, fontSize: 12 }, tickFormatter: formatoEje, tickLine: false, axisLine: false, width: 44 };

function Ayuda({ active, payload, label, unidad }: TooltipProps<number, string> & { unidad: Unidad }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-white">{formatoFecha(String(label))}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-300">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-white">{p.value === null || p.value === undefined ? t.sin1rm : formatoPeso(Number(p.value), unidad)}</span>
        </p>
      ))}
    </div>
  );
}

function Leyenda({ elementos }: { elementos: { nombre: string; color: string; discontinua?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
      {elementos.map((e) => (
        <li key={e.nombre} className="flex items-center gap-2">
          <svg aria-hidden width="22" height="10" viewBox="0 0 22 10">
            <line x1="1" y1="5" x2="21" y2="5" stroke={e.color} strokeWidth="2" strokeDasharray={e.discontinua ? '4 3' : undefined} />
            <circle cx="11" cy="5" r="3" fill={e.color} />
          </svg>
          {e.nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Peso máximo y 1RM comparten escala (kg) y van en un panel de líneas; el volumen tiene otra escala y
 * va en su propio panel de barras (nunca doble eje). Toda la figura es una imagen con nombre accesible:
 * la tabla equivalente ofrece los mismos valores para lectores de pantalla y teclado.
 */
export function GraficoProgreso({ ejercicio, puntos, unidad }: { ejercicio: string; puntos: readonly PuntoProgreso[]; unidad: Unidad }) {
  const datos = [...puntos];
  const ayuda = <Tooltip content={<Ayuda unidad={unidad} />} cursor={{ stroke: 'rgba(255,255,255,0.25)', fill: 'rgba(255,255,255,0.04)' }} />;
  return (
    <figure role="img" aria-label={t.grafico(ejercicio, puntos.length)} className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-bold text-white">{t.panelPeso(unidad)}</p>
        <Leyenda elementos={[{ nombre: t.pesoMax, color: SERIE.pesoMax }, { nombre: t.unoRm, color: SERIE.unoRm, discontinua: true }]} />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={TINTA.rejilla} />
              <XAxis {...ejeX} />
              <YAxis {...ejeY} domain={['auto', 'auto']} />
              {ayuda}
              <Line type="linear" dataKey="pesoMax" name={t.pesoMax} stroke={SERIE.pesoMax} strokeWidth={2} isAnimationActive={false}
                dot={{ r: 5, fill: SERIE.pesoMax, stroke: TINTA.superficie, strokeWidth: 2 }} activeDot={{ r: 6, stroke: TINTA.superficie, strokeWidth: 2 }} />
              <Line type="linear" dataKey="unoRm" name={t.unoRm} stroke={SERIE.unoRm} strokeWidth={2} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false}
                dot={{ r: 5, fill: SERIE.unoRm, stroke: TINTA.superficie, strokeWidth: 2 }} activeDot={{ r: 6, stroke: TINTA.superficie, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-bold text-white">{t.panelVolumen(unidad)}</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={TINTA.rejilla} />
              <XAxis {...ejeX} />
              <YAxis {...ejeY} />
              {ayuda}
              <Bar dataKey="volumen" name={t.volumen} fill={SERIE.volumen} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}
