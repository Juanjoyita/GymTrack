import { esquemaSerie, kgALb, lbAKg, redondearPesoParaMostrar } from '@gymtrack/domain';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { obtenerUltimaSesion } from '../../api/ejercicios';
import type { EjercicioRealizado, Serie } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { CampoArea } from '../../componentes/CampoArea';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoLapiz, IconoPapelera, IconoReloj } from '../../componentes/Iconos';
import type { NuevaOperacion } from '../../sincronizacion/cola';
import { textos } from '../../textos/es';
import { opAnadirSerie, opEditarSerie, opEliminarSerie, opNotaEjercicio, type PesoEntrada } from './operaciones';

const t = textos.entrenar;
const ts = t.serie;

/** Tiempo para «Deshacer» una eliminación antes de enviarla. */
export const PLAZO_DESHACER_MS = 6000;

type Unidad = 'kg' | 'lb';
const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
const enUnidad = (kg: number, unidad: Unidad) => redondearPesoParaMostrar(unidad === 'kg' ? kg : kgALb(kg));
export const textoPeso = (kg: number, unidad: Unidad) => `${numero.format(enUnidad(kg, unidad))} ${unidad}`;
const fechaCorta = (iso: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(iso));

interface Valores { peso: string; repeticiones: string }

interface TarjetaEjercicioProps {
  entrenamientoId: string;
  realizado: EjercicioRealizado;
  unidad: Unidad;
  /** El ejercicio aún no está confirmado por el servidor. */
  pendiente: boolean;
  /** Ids de recursos con operaciones pendientes en la cola. */
  pendientes: ReadonlySet<string>;
  encolar: (op: NuevaOperacion) => void;
  /** Permite a la página enviar una eliminación en espera antes de finalizar. */
  registrarEliminacion: (vaciar: (() => void) | null) => void;
}

/**
 * Un ejercicio del entrenamiento en curso con sus series (FR-008 a FR-011). Un único formulario
 * añade la siguiente serie, prellenada con la anterior o con la primera de la última sesión, o
 * edita una existente. Eliminar quita la serie al momento y permite deshacer durante unos segundos.
 */
export function TarjetaEjercicio({ entrenamientoId, realizado, unidad, pendiente, pendientes, encolar, registrarEliminacion }: TarjetaEjercicioProps) {
  const [editando, setEditando] = useState<Serie | null>(null);
  const [eliminando, setEliminando] = useState<{ serie: Serie; numero: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ultima = useQuery({ queryKey: ['ultima-sesion', realizado.ejercicioId], queryFn: () => obtenerUltimaSesion(realizado.ejercicioId), staleTime: 5 * 60_000, retry: false });

  const series = realizado.series.filter((s) => s.id !== eliminando?.serie.id);
  const anterior = series.at(-1);
  const primeraAnterior = ultima.data?.series[0];
  const prellenado: Valores = editando ? { peso: String(enUnidad(editando.pesoKg, unidad)), repeticiones: String(editando.repeticiones) }
    : anterior ? { peso: String(enUnidad(anterior.pesoKg, unidad)), repeticiones: String(anterior.repeticiones) }
      : primeraAnterior ? { peso: String(enUnidad(primeraAnterior.pesoKg, unidad)), repeticiones: String(primeraAnterior.repeticiones) }
        : { peso: '', repeticiones: '' };

  // Enviar la eliminación en espera (al vencer el plazo, al eliminar otra o al salir de la pantalla).
  const confirmarEliminacion = useRef<() => void>(() => {});
  confirmarEliminacion.current = () => {
    clearTimeout(temporizador.current);
    temporizador.current = undefined;
    if (eliminando) encolar(opEliminarSerie(entrenamientoId, realizado.id, eliminando.serie));
    setEliminando(null);
  };
  useEffect(() => {
    registrarEliminacion(eliminando ? () => confirmarEliminacion.current() : null);
  }, [eliminando, registrarEliminacion]);
  useEffect(() => () => { if (temporizador.current) confirmarEliminacion.current(); }, []);

  function eliminar(serie: Serie, numeroSerie: number) {
    if (eliminando) confirmarEliminacion.current();
    if (editando?.id === serie.id) setEditando(null);
    setEliminando({ serie, numero: numeroSerie });
    temporizador.current = setTimeout(() => confirmarEliminacion.current(), PLAZO_DESHACER_MS);
  }

  function deshacer() {
    clearTimeout(temporizador.current);
    temporizador.current = undefined;
    setEliminando(null);
  }

  function guardar(repeticiones: number, pesoEntrada: PesoEntrada) {
    const pesoKg = pesoEntrada.unidad === 'kg' ? pesoEntrada.valor : Number(lbAKg(pesoEntrada.valor).toFixed(4));
    if (editando) {
      encolar(opEditarSerie(entrenamientoId, realizado.id, editando, repeticiones, pesoEntrada, pesoKg));
      setEditando(null);
      return;
    }
    const orden = Math.max(0, ...realizado.series.map((s) => s.orden)) + 1;
    const serie: Serie = { id: crypto.randomUUID(), orden, repeticiones, pesoKg, registradaEn: new Date().toISOString(), version: 1 };
    encolar(opAnadirSerie(entrenamientoId, realizado.id, serie, pesoEntrada));
  }

  function guardarNota(texto: string) {
    const nota = texto.trim() || null;
    if (nota !== (realizado.nota ?? null)) encolar(opNotaEjercicio(entrenamientoId, realizado, nota));
  }

  const botonIcono = `${AREA_TACTIL} ${FOCO_VISIBLE} flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white`;

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-4 sm:p-5">
      <div>
        <h3 className="font-display text-2xl font-bold leading-tight text-white">{realizado.nombre}</h3>
        {pendiente && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-amber-300"><IconoReloj className="size-4" />{textos.entrenar.pendiente}</p>
        )}
        {ultima.data && (
          <p className="mt-1 text-sm text-slate-400">
            <span className="font-semibold text-slate-300">{ts.ultimaVez(fechaCorta(ultima.data.fecha))}</span>{' '}
            {ultima.data.series.map((s) => `${textoPeso(s.pesoKg, unidad)} × ${s.repeticiones}`).join(' · ')}
          </p>
        )}
      </div>

      {series.length ? (
        <ol className="flex flex-col divide-y divide-white/5 rounded-2xl border border-white/10">
          {series.map((serie, i) => (
            <li key={serie.id} className={`flex items-center gap-2 py-1 pl-4 pr-1 ${editando?.id === serie.id ? 'bg-lime-300/10' : ''}`}>
              <span className="w-16 shrink-0 text-sm font-semibold text-slate-400">{ts.titulo(i + 1)}</span>
              <span className="flex-1 font-display text-xl font-bold text-white">{`${textoPeso(serie.pesoKg, unidad)} × ${serie.repeticiones}`}</span>
              {pendientes.has(serie.id) && (
                <span className="text-amber-300" title={ts.pendiente}><IconoReloj className="size-4" /><span className="sr-only">{ts.pendiente}</span></span>
              )}
              <button type="button" onClick={() => setEditando(serie)} aria-label={ts.editar(i + 1)} className={botonIcono}><IconoLapiz className="size-5" /></button>
              <button type="button" onClick={() => eliminar(serie, i + 1)} aria-label={ts.eliminar(i + 1)} className={botonIcono}><IconoPapelera className="size-5" /></button>
            </li>
          ))}
        </ol>
      ) : !pendiente && !ultima.data && <p className="text-sm text-slate-400">{t.sinSeries}</p>}

      <FormularioSerie
        key={editando ? `editar-${editando.id}` : `nueva-${series.length}`}
        unidad={unidad}
        inicial={prellenado}
        editando={editando !== null}
        onGuardar={guardar}
        onCancelar={() => setEditando(null)}
      />

      {eliminando && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 py-1 pl-4 pr-1 text-sm text-slate-200">
          <span>{ts.eliminada(eliminando.numero)}</span>
          <Boton variante="secundario" onClick={deshacer}>{ts.deshacer}</Boton>
        </div>
      )}

      <CampoArea etiqueta={t.notaEjercicio} defaultValue={realizado.nota ?? ''} maxLength={1000} onBlur={(e) => guardarNota(e.target.value)} />
    </article>
  );
}

function FormularioSerie({ unidad, inicial, editando, onGuardar, onCancelar }: {
  unidad: Unidad; inicial: Valores; editando: boolean; onGuardar: (repeticiones: number, peso: PesoEntrada) => void; onCancelar: () => void;
}) {
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<{ peso?: string; repeticiones?: string }>({});
  // Si el prellenado llega después (la última sesión se consulta en red), se adopta solo mientras el
  // usuario no haya escrito nada: nunca se pisa lo que ya tecleó.
  const [tocado, setTocado] = useState(false);
  const { peso: pesoInicial, repeticiones: repeticionesInicial } = inicial;
  useEffect(() => { if (!tocado) setValores({ peso: pesoInicial, repeticiones: repeticionesInicial }); }, [tocado, pesoInicial, repeticionesInicial]);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => { formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errores]);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const peso = valores.peso.trim() === '' ? Number.NaN : Number(valores.peso.trim().replace(',', '.'));
    const repeticiones = valores.repeticiones.trim() === '' ? Number.NaN : Number(valores.repeticiones.trim());
    // Validación V4 con el esquema compartido (FR-008), con mensajes de la interfaz.
    const resultado = esquemaSerie.safeParse({ repeticiones, pesoEntrada: { valor: peso, unidad } });
    if (!resultado.success) {
      const nuevos: typeof errores = {};
      for (const problema of resultado.error.issues) {
        if (problema.path[0] === 'repeticiones') nuevos.repeticiones = ts.errorRepeticiones;
        if (problema.path[0] === 'pesoEntrada') nuevos.peso ??= problema.code === 'custom' ? problema.message : ts.errorPeso;
      }
      return setErrores(nuevos);
    }
    setErrores({});
    onGuardar(repeticiones, { valor: peso, unidad });
  }

  return (
    <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta={ts.peso(unidad)} inputMode="decimal" autoComplete="off" value={valores.peso} error={errores.peso}
          onChange={(e) => { setTocado(true); setValores((v) => ({ ...v, peso: e.target.value })); }} />
        <Campo etiqueta={ts.repeticiones} inputMode="numeric" autoComplete="off" value={valores.repeticiones} error={errores.repeticiones}
          onChange={(e) => { setTocado(true); setValores((v) => ({ ...v, repeticiones: e.target.value })); }} />
      </div>
      {editando ? (
        <div className="flex gap-2">
          <Boton type="submit" className="flex-1">{ts.guardarCambios}</Boton>
          <Boton variante="secundario" onClick={onCancelar}>{ts.cancelar}</Boton>
        </div>
      ) : (
        <Boton type="submit" className="w-full">{ts.anadir}</Boton>
      )}
    </form>
  );
}
