import type { RecordPersonal, RecordsPersonales } from '../../api/progreso';
import { textos } from '../../textos/es';
import { convertir, formatoFecha, formatoPeso, type Unidad } from './datos';

const t = textos.progreso;

/** Récords personales (FR-021) como cifras destacadas, cada uno con la fecha en que se logró. */
export function TarjetasRecords({ records, unidad }: { records: RecordsPersonales; unidad: Unidad }) {
  const tarjetas: [string, RecordPersonal | null | undefined][] = [
    [t.pesoMax, records.pesoMax], [t.unoRm, records.unoRm], [t.mejorVolumen, records.volumenSesion],
  ];
  return (
    <section aria-labelledby="titulo-records" className="flex flex-col gap-3">
      <div>
        <h2 id="titulo-records" className="font-display text-2xl font-bold text-white">{t.records}</h2>
        <p className="text-sm text-slate-400">{t.recordsDetalle}</p>
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {tarjetas.map(([etiqueta, record]) => (
          <div key={etiqueta} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-white/10 bg-slate-900 p-3 sm:p-4">
            <dt className="text-xs font-semibold text-slate-400 sm:text-sm">{etiqueta}</dt>
            <dd className="font-display text-2xl font-extrabold italic leading-none text-white sm:text-3xl">
              {record ? formatoPeso(convertir(record.valorKg, unidad), unidad) : <span className="text-lg not-italic text-slate-400">{t.sinDatos}</span>}
            </dd>
            {record && <dd className="text-xs text-slate-400">{formatoFecha(record.fecha)}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
