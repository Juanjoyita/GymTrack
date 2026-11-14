import { calcularVolumen } from '@gymtrack/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ErrorRed } from '../../api/cliente';
import type { Ejercicio } from '../../api/ejercicios';
import { CLAVE_EN_CURSO, obtenerEntrenamientoEnCurso, type Entrenamiento } from '../../api/entrenamientos';
import { useSesion } from '../../app/sesion';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { Boton } from '../../componentes/Boton';
import { CampoArea } from '../../componentes/CampoArea';
import { Dialogo } from '../../componentes/Dialogo';
import { IconoCargando, IconoCheck, IconoMancuerna, IconoMas, IconoReloj } from '../../componentes/Iconos';
import type { NuevaOperacion } from '../../sincronizacion/cola';
import { useAlConfirmar, useCola, useConflictos, usePendientes } from '../../sincronizacion/contexto';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';
import { leerCopia } from './copiaLocal';
import { conPendientes, esFinalizar, opAnadirEjercicio, opFinalizar, opIniciar, opNota } from './operaciones';
import { SelectorEjercicio } from './SelectorEjercicio';
import { TarjetaEjercicio } from './TarjetaEjercicio';

const t = textos.entrenar;
const HORA_MS = 3_600_000;

interface Resumen { ejercicios: number; series: number; volumenKg: number; duracionMin: number }

function horaLocal(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria }).format(new Date(iso));
}

function resumenDe(e: Entrenamiento, fin = new Date().toISOString()): Resumen {
  const series = e.ejercicios.flatMap((r) => r.series);
  return {
    ejercicios: e.ejercicios.length, series: series.length, volumenKg: calcularVolumen(series),
    duracionMin: Math.max(0, Math.round((new Date(fin).getTime() - new Date(e.inicio).getTime()) / 60_000)),
  };
}

/**
 * Sección Entrenar (US1): iniciar, registrar series, notas y finalizar. Cada cambio se guarda primero
 * en la cola duradera (R-08) y se ve al instante; la copia local permite verlo al reabrir sin red.
 */
export function PaginaEntrenar() {
  useTituloDocumento(textos.navegacion.entrenar);
  const { data: usuario } = useSesion();
  const usuarioId = usuario?.id ?? '';
  const unidad = usuario?.unidadPeso ?? 'kg';
  const cola = useCola();
  const cliente = useQueryClient();
  const pendientes = usePendientes();
  const conflictos = useConflictos();
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: 'resumen'; resumen: Resumen } | { tipo: 'descartado' } | null>(null);
  const [inactividadDescartada, setInactividadDescartada] = useState(false);
  const enCurso = useQuery({
    queryKey: CLAVE_EN_CURSO, queryFn: obtenerEntrenamientoEnCurso,
    // La copia local se muestra al instante (y sin red); se actualiza en cuanto responde el servidor.
    initialData: () => leerCopia(usuarioId), initialDataUpdatedAt: 0,
  });

  const finalizacion = pendientes.find(esFinalizar);
  const base = enCurso.data;
  const entrenamiento = base === undefined ? undefined : conPendientes(base, pendientes.filter((o) => !esFinalizar(o)));
  const conCola = new Set(pendientes.map((o) => o.recurso));

  // Eliminaciones en espera de «Deshacer»: se envían antes de finalizar para que entren en el resumen.
  const eliminaciones = useRef(new Map<string, () => void>());
  const registros = useRef(new Map<string, (vaciar: (() => void) | null) => void>());
  const registrarPara = useCallback((id: string) => {
    let registro = registros.current.get(id);
    if (!registro) {
      registro = (vaciar) => { if (vaciar) eliminaciones.current.set(id, vaciar); else eliminaciones.current.delete(id); };
      registros.current.set(id, registro);
    }
    return registro;
  }, []);

  const encolar = useCallback((op: NuevaOperacion) => { cola.encolar(op); }, [cola]);

  useAlConfirmar((op, respuesta) => {
    if (!esFinalizar(op)) return;
    // La sesión recién finalizada pasa a ser «la última vez» de sus ejercicios.
    void cliente.invalidateQueries({ queryKey: ['ultima-sesion'] });
    const final = respuesta as (Entrenamiento & { descartado?: boolean }) | undefined;
    setResultado(final?.descartado ? { tipo: 'descartado' } : { tipo: 'resumen', resumen: final ? resumenDe(final, final.fin ?? undefined) : { ejercicios: 0, series: 0, volumenKg: 0, duracionMin: 0 } });
  });

  function iniciar() {
    setResultado(null);
    setInactividadDescartada(false);
    encolar(opIniciar({
      id: crypto.randomUUID(), estado: 'en_curso', inicio: new Date().toISOString(), fin: null, zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [], resumen: { ejercicios: 0, series: 0, volumenKg: 0, duracionMin: null },
    }));
  }

  function finalizar(actual: Entrenamiento, fin?: string) {
    for (const vaciar of [...eliminaciones.current.values()]) vaciar();
    setInactividadDescartada(true);
    encolar(opFinalizar(actual, fin));
  }

  function elegir(actual: Entrenamiento, ejercicio: Ejercicio) {
    setSelectorAbierto(false);
    encolar(opAnadirEjercicio(actual.id, {
      id: crypto.randomUUID(), ejercicioId: ejercicio.id, nombre: ejercicio.nombre, posicion: actual.ejercicios.length + 1,
      nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [],
    }));
  }

  function guardarNota(actual: Entrenamiento, texto: string) {
    const nota = texto.trim() || null;
    if (nota !== (actual.nota ?? null)) encolar(opNota(actual, nota));
  }

  const contador = <p role="status" className="flex items-center gap-1.5 text-sm text-slate-400"><IconoReloj className="size-4" />{t.pendientes(pendientes.length)}</p>;

  let contenido;
  if (resultado?.tipo === 'resumen') {
    contenido = <ResumenFinal resumen={resultado.resumen} onVolver={() => setResultado(null)} />;
  } else if (finalizacion && entrenamiento) {
    contenido = navigator.onLine
      ? <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.finalizando}</p>
      : <ResumenFinal resumen={resumenDe(entrenamiento)} pendiente contador={contador} />;
  } else if (entrenamiento === undefined) {
    contenido = enCurso.isError ? (
      <div className="flex flex-col gap-3">
        <AvisoError mensaje={enCurso.error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico} />
        <Boton variante="secundario" onClick={() => enCurso.refetch()}>{textos.acceso.reintentar}</Boton>
      </div>
    ) : <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargando}</p>;
  } else if (!entrenamiento) {
    contenido = (
      <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed border-white/15 p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lime-300"><IconoMancuerna className="size-6" /></span>
        <div>
          <p className="text-lg font-semibold text-white">{t.sinEntrenamiento}</p>
          <p className="text-slate-400">{t.iniciarTexto}</p>
        </div>
        <Boton onClick={iniciar} className="w-full">{t.iniciar}</Boton>
      </div>
    );
  } else {
    const actual = entrenamiento;
    const ultimaSerie = actual.ejercicios.flatMap((r) => r.series).map((s) => s.registradaEn).sort().at(-1);
    const horasInactivo = Math.floor((Date.now() - new Date(ultimaSerie ?? actual.inicio).getTime()) / HORA_MS);
    contenido = (
      <section aria-labelledby="titulo-en-curso" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-en-curso" className="font-display text-3xl font-bold leading-tight text-white">{t.enCurso}</h2>
          <p className="text-sm text-slate-400">{t.desde} {horaLocal(actual.inicio, actual.zonaHoraria)}</p>
          {contador}
        </div>
        {actual.ejercicios.length ? (
          <ol className="flex flex-col gap-4">
            {actual.ejercicios.map((r) => (
              <li key={r.id}>
                <TarjetaEjercicio entrenamientoId={actual.id} realizado={r} unidad={unidad} pendiente={pendientes.some((o) => o.recurso === r.id && o.metodo === 'POST')}
                  pendientes={conCola} encolar={encolar} registrarEliminacion={registrarPara(r.id)} />
              </li>
            ))}
          </ol>
        ) : <p className="text-slate-400">{t.sinEjercicios}</p>}
        <Boton variante="secundario" onClick={() => setSelectorAbierto(true)} className="w-full">
          <IconoMas className="size-5 text-lime-300" />{t.anadirEjercicio}
        </Boton>
        <CampoArea etiqueta={t.notaEntrenamiento} defaultValue={actual.nota ?? ''} maxLength={1000} onBlur={(e) => guardarNota(actual, e.target.value)} />
        <Boton onClick={() => finalizar(actual)} className="w-full">{t.finalizar}</Boton>

        {selectorAbierto && <SelectorEjercicio onElegir={(e) => elegir(actual, e)} onCerrar={() => setSelectorAbierto(false)} />}
        {actual.inactivo && !inactividadDescartada && (
          <Dialogo titulo={t.inactivoTitulo} onCerrar={() => setInactividadDescartada(true)} textoCerrar={textos.selector.cerrar}>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-lg text-white">{t.inactivoTexto(horasInactivo)}</p>
              <p className="text-slate-400">{t.inactivoDetalle}</p>
              <Boton onClick={() => finalizar(actual, ultimaSerie)}>{t.inactivoFinalizar}</Boton>
              <Boton variante="secundario" onClick={() => setInactividadDescartada(true)}>{t.seguir}</Boton>
            </div>
          </Dialogo>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col gap-6">
      <h1 id="titulo-pagina" tabIndex={-1} className="font-display text-6xl font-extrabold italic leading-none text-white focus:outline-none">
        {textos.navegacion.entrenar}
      </h1>
      {conflictos.length > 0 && <AvisoError mensaje={t.conflictos(conflictos.length)} />}
      {resultado?.tipo === 'descartado' && <AvisoError mensaje={t.descartado} />}
      {contenido}
    </section>
  );
}

function ResumenFinal({ resumen, onVolver, pendiente = false, contador }: { resumen: Resumen; onVolver?: () => void; pendiente?: boolean; contador?: ReactNode }) {
  const volumen = new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(resumen.volumenKg);
  const datos = [[t.duracion, t.minutos(resumen.duracionMin)], [t.volumen, `${volumen} kg`]];
  return (
    <section aria-labelledby="titulo-final" className="flex flex-col gap-5 rounded-3xl border border-lime-300/30 bg-slate-900 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-lime-300 text-slate-950"><IconoCheck className="size-6" /></span>
        <h2 id="titulo-final" className="font-display text-3xl font-bold text-white">{t.finalizado}</h2>
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
