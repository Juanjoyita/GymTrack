import type { ReactNode } from 'react';
import type { Entrenamiento, Serie } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { IconoAlerta } from '../../componentes/Iconos';
import type { Conflicto } from '../../sincronizacion/cola';
import { textos } from '../../textos/es';
import { vista } from './operaciones';
import { textoPeso } from './TarjetaEjercicio';

const t = textos.conflictos;

/** Número visible de la serie («Serie N») en la vista actual, si sigue existiendo. */
function numeroSerie(e: Entrenamiento | null | undefined, serieId: string) {
  for (const r of e?.ejercicios ?? []) {
    const i = r.series.findIndex((s) => s.id === serieId);
    if (i >= 0) return i + 1;
  }
  return null;
}

/** Qué pasó y si tiene sentido repetir el cambio sobre la versión vigente. */
function describir(c: Conflicto, e: Entrenamiento | null | undefined, unidad: 'kg' | 'lb'): { titulo: string; texto: ReactNode; repetible: boolean } {
  const v = vista(c.operacion);
  const serie = (s: { pesoKg: number; repeticiones: number }) => <strong className="font-bold text-white">{`${textoPeso(s.pesoKg, unidad)} × ${s.repeticiones}`}</strong>;
  if (c.motivo === 'DEPENDENCIA') return { titulo: t.tituloGeneral, texto: t.dependencia, repetible: false };
  if (v?.tipo === 'iniciar') return { titulo: t.tituloGeneral, texto: t.yaEnCurso, repetible: false };
  if (v?.tipo === 'editar-serie' || v?.tipo === 'eliminar-serie') {
    const n = numeroSerie(e, v.serieId);
    if (c.motivo === 'ELIMINADO') return { titulo: t.tituloSerie(n), texto: t.serieEliminada, repetible: false };
    const vigente = c.actual as Serie | null;
    if (c.motivo === 'CONFLICTO_VERSION' && vigente) {
      return v.tipo === 'editar-serie'
        ? { titulo: t.tituloSerie(n), texto: <>{t.cambiada} {t.ahora} {serie(vigente)}. {t.tuCambio} {serie(v)}.</>, repetible: true }
        : { titulo: t.tituloSerie(n), texto: <>{t.cambiada} {t.ahora} {serie(vigente)}. {t.eliminarIgual}</>, repetible: true };
    }
  }
  if (c.motivo === 'CONFLICTO_VERSION' && (v?.tipo === 'nota' || v?.tipo === 'nota-ejercicio')) {
    const vigente = (c.actual as { nota?: string | null } | null)?.nota;
    return { titulo: t.tituloNota, texto: <>{t.notaCambiada} {t.ahora} «{vigente ?? t.sinNota}». {t.tuNota} «{v.nota ?? t.sinNota}».</>, repetible: true };
  }
  if (c.motivo === 'CONFLICTO_VERSION') return { titulo: t.tituloGeneral, texto: t.entrenamientoCambiado, repetible: true };
  if (c.motivo === 'ELIMINADO') return { titulo: t.tituloGeneral, texto: t.entrenamientoNoExiste, repetible: false };
  return { titulo: t.tituloGeneral, texto: t.rechazado, repetible: false };
}

interface AvisoConflictosProps {
  conflictos: readonly Conflicto[];
  entrenamiento: Entrenamiento | null | undefined;
  unidad: 'kg' | 'lb';
  onRepetir: (id: string) => void;
  onDescartar: (id: string) => void;
}

/**
 * Conflictos de sincronización (FR-031, R-09): explica qué cambió, muestra la versión vigente y deja
 * decidir. Nada se sobrescribe en silencio. Un único aviso agrupa todos los conflictos.
 */
export function AvisoConflictos({ conflictos, entrenamiento, unidad, onRepetir, onDescartar }: AvisoConflictosProps) {
  if (!conflictos.length) return null;
  return (
    <div role="alert" className="flex flex-col gap-3">
      {conflictos.map((c) => {
        const { titulo, texto, repetible } = describir(c, entrenamiento, unidad);
        return (
          <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4">
            <p className="flex items-start gap-2 font-bold text-amber-200"><IconoAlerta className="mt-0.5 size-5 shrink-0" />{titulo}</p>
            <p className="text-slate-200">{texto}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {repetible && <Boton onClick={() => onRepetir(c.id)} className="sm:flex-1">{t.repetir}</Boton>}
              <Boton variante="secundario" onClick={() => onDescartar(c.id)} className="sm:flex-1">{t.descartar}</Boton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
