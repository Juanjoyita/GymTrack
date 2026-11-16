import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorRed } from '../../api/cliente';
import { CLAVE_EN_CURSO, obtenerEntrenamientoEnCurso, type Entrenamiento } from '../../api/entrenamientos';
import { useSesion } from '../../app/sesion';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { Boton } from '../../componentes/Boton';
import { CampoArea } from '../../componentes/CampoArea';
import { Dialogo } from '../../componentes/Dialogo';
import { IconoCargando, IconoMancuerna, IconoReloj } from '../../componentes/Iconos';
import type { NuevaOperacion } from '../../sincronizacion/cola';
import { useAlConfirmar, useCola, useConflictos, usePendientes } from '../../sincronizacion/contexto';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';
import { AvisoConflictos } from './AvisoConflictos';
import { leerCopia } from './copiaLocal';
import { EntrenamientoPasado } from './EntrenamientoPasado';
import { ListaEjercicios, useEliminacionesEnEspera, type Avisos } from './ListaEjercicios';
import { conPendientes, esFinalizar, opDescartar, opFinalizar, opIniciar, opNota, opRegistrarPasado, vista } from './operaciones';
import { clavesProgreso, type RecordsPersonales } from '../../api/progreso';
import { recordsDeSesion, type RecordSesion } from './records';
import { RegistroPasado } from './RegistroPasado';
import { ResumenFinal, resumenDe, type Resumen } from './ResumenFinal';
import { textoPeso } from './TarjetaEjercicio';

const t = textos.entrenar;
const HORA_MS = 3_600_000;

function horaLocal(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria }).format(new Date(iso));
}

const nuevoEntrenamiento = (inicio: Date, fin: Date | null): Entrenamiento => ({
  id: crypto.randomUUID(), estado: fin ? 'finalizado' : 'en_curso', inicio: inicio.toISOString(), fin: fin?.toISOString() ?? null,
  zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone, nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [],
  resumen: { ejercicios: 0, series: 0, volumenKg: 0, duracionMin: null },
});

type Modo =
  | { tipo: 'normal' }
  | { tipo: 'registrar-pasado' }
  | { tipo: 'pasado'; entrenamiento: Entrenamiento }
  | { tipo: 'resumen'; titulo: string; resumen: Resumen; records?: RecordSesion[] }
  | { tipo: 'descartado' };

/**
 * Sección Entrenar (US1): iniciar, registrar series, notas, finalizar, registrar a posteriori y
 * resolver conflictos. Cada cambio se guarda primero en la cola duradera (R-08) y se ve al instante;
 * la copia local permite verlo al reabrir sin red.
 */
export function PaginaEntrenar() {
  useTituloDocumento(textos.navegacion.entrenar);
  const [parametros, setParametros] = useSearchParams();
  const registrarPasadoSolicitado = parametros.get('registrarPasado') === '1';
  const { data: usuario } = useSesion();
  const usuarioId = usuario?.id ?? '';
  const unidad = usuario?.unidadPeso ?? 'kg';
  const cola = useCola();
  const cliente = useQueryClient();
  const pendientes = usePendientes();
  const conflictos = useConflictos();
  const [modo, setModo] = useState<Modo>(() => registrarPasadoSolicitado ? { tipo: 'registrar-pasado' } : { tipo: 'normal' });
  const [inactividadDescartada, setInactividadDescartada] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const { registrarPara, enviarTodas } = useEliminacionesEnEspera();
  // Último aviso de récord (FR-022): una sola región aria-live, sin mover el foco; cada evento la reemplaza.
  const [anuncio, setAnuncio] = useState<string | null>(null);
  const avisos = useMemo<Avisos>(() => ({ anunciar: setAnuncio }), []);
  // Récords de la sesión calculados al pulsar «Finalizar», para el resumen.
  const [recordsFinal, setRecordsFinal] = useState<RecordSesion[]>([]);
  const enCurso = useQuery({
    queryKey: CLAVE_EN_CURSO, queryFn: obtenerEntrenamientoEnCurso,
    // La copia local se muestra al instante (y sin red); se actualiza en cuanto responde el servidor.
    initialData: () => leerCopia(usuarioId), initialDataUpdatedAt: 0,
  });

  useEffect(() => {
    if (!registrarPasadoSolicitado) return;
    setModo({ tipo: 'registrar-pasado' });
    setParametros((actuales) => {
      const siguientes = new URLSearchParams(actuales);
      siguientes.delete('registrarPasado');
      return siguientes;
    }, { replace: true });
  }, [registrarPasadoSolicitado, setParametros]);

  const finalizacion = pendientes.find(esFinalizar);
  const base = enCurso.data;
  const entrenamiento = base === undefined ? undefined : conPendientes(base, pendientes.filter((o) => !esFinalizar(o)));
  const encolar = useCallback((op: NuevaOperacion) => { cola.encolar(op); }, [cola]);

  useAlConfirmar((op, respuesta) => {
    if (!esFinalizar(op) || modo.tipo === 'pasado') return;
    // La sesión recién finalizada pasa a ser «la última vez» de sus ejercicios.
    void cliente.invalidateQueries({ queryKey: ['ultima-sesion'] });
    const final = respuesta as (Entrenamiento & { descartado?: boolean }) | undefined;
    setModo(final?.descartado ? { tipo: 'descartado' } : { tipo: 'resumen', titulo: t.finalizado, resumen: final ? resumenDe(final) : resumenDe(nuevoEntrenamiento(new Date(), new Date())), records: recordsFinal });
  });

  function repetir(id: string) { cola.repetir(id); }
  function descartarConflicto(id: string) {
    const conflicto = conflictos.find((c) => c.id === id);
    cola.descartar(id);
    // Al descartar, la vista vuelve a la versión del servidor.
    if (conflicto && vista(conflicto.operacion)?.tipo !== 'registrar-pasado') void cliente.invalidateQueries({ queryKey: CLAVE_EN_CURSO });
  }

  function iniciar() {
    setModo({ tipo: 'normal' });
    setInactividadDescartada(false);
    setAnuncio(null);
    setRecordsFinal([]);
    encolar(opIniciar(nuevoEntrenamiento(new Date(), null)));
  }

  function registrarPasado(inicio: Date, fin: Date) {
    const pasado = nuevoEntrenamiento(inicio, fin);
    encolar(opRegistrarPasado(pasado));
    setModo({ tipo: 'pasado', entrenamiento: pasado });
  }

  function finalizar(actual: Entrenamiento, fin?: string) {
    enviarTodas();
    // Volumen de los ejercicios sin terminar (R-11): se comprueba con los récords ya cargados en la sesión.
    const previos = new Map(actual.ejercicios.map((r) => [r.ejercicioId, cliente.getQueryData<RecordsPersonales>(clavesProgreso.recordsPrevios(r.ejercicioId, actual.id))]));
    const records = recordsDeSesion(actual, previos);
    setRecordsFinal(records);
    const nuevos = records.filter((x) => x.volumenNuevo && x.volumenKg !== undefined);
    setAnuncio(nuevos.length ? nuevos.map((x) => t.record.anuncio(x.nombre, [{ nombre: t.record.metrica.volumen, valor: textoPeso(x.volumenKg!, unidad) }])).join(' ') : null);
    setInactividadDescartada(true);
    encolar(opFinalizar(actual, fin));
  }

  function descartar(actual: Entrenamiento) {
    enviarTodas();
    setInactividadDescartada(true);
    setConfirmarDescarte(false);
    encolar(opDescartar(actual));
  }

  function guardarNota(actual: Entrenamiento, texto: string) {
    const nota = texto.trim() || null;
    if (nota !== (actual.nota ?? null)) encolar(opNota(actual, nota));
  }

  const contador = <p role="status" className="flex items-center gap-1.5 text-sm text-slate-400"><IconoReloj className="size-4" />{t.pendientes(pendientes.length)}</p>;
  const volver = () => setModo({ tipo: 'normal' });

  let contenido;
  if (modo.tipo === 'resumen') {
    contenido = <ResumenFinal titulo={modo.titulo} resumen={modo.resumen} onVolver={volver} records={modo.records} unidad={unidad} />;
  } else if (modo.tipo === 'registrar-pasado') {
    contenido = <RegistroPasado onRegistrar={registrarPasado} onCancelar={volver} />;
  } else if (modo.tipo === 'pasado') {
    contenido = <EntrenamientoPasado inicial={modo.entrenamiento} unidad={unidad} encolar={encolar} contador={contador}
      onListo={(resumen) => setModo({ tipo: 'resumen', titulo: t.pasado.registrado, resumen })} />;
  } else if (finalizacion && entrenamiento) {
    contenido = navigator.onLine
      ? <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.finalizando}</p>
      : <ResumenFinal resumen={resumenDe(entrenamiento, new Date().toISOString())} pendiente contador={contador} records={recordsFinal} unidad={unidad} />;
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
        <Boton variante="secundario" onClick={() => setModo({ tipo: 'registrar-pasado' })} className="w-full">{t.pasado.abrir}</Boton>
      </div>
    );
  } else {
    const actual = entrenamiento;
    const ultimaSerie = actual.ejercicios.flatMap((r) => r.series).map((s) => s.registradaEn).sort().at(-1);
    const totalSeries = actual.ejercicios.reduce((n, r) => n + r.series.length, 0);
    const horasInactivo = Math.floor((Date.now() - new Date(ultimaSerie ?? actual.inicio).getTime()) / HORA_MS);
    contenido = (
      <section aria-labelledby="titulo-en-curso" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-en-curso" className="font-display text-3xl font-bold leading-tight text-white">{t.enCurso}</h2>
          <p className="text-sm text-slate-400">{t.desde} {horaLocal(actual.inicio, actual.zonaHoraria)}</p>
          {contador}
        </div>
        <ListaEjercicios entrenamiento={actual} unidad={unidad} pendientes={pendientes} encolar={encolar} registrarPara={registrarPara} avisos={avisos} />
        <CampoArea etiqueta={t.notaEntrenamiento} defaultValue={actual.nota ?? ''} maxLength={1000} onBlur={(e) => guardarNota(actual, e.target.value)} />
        <Boton onClick={() => finalizar(actual)} className="w-full">{t.finalizar}</Boton>

        {actual.inactivo && !inactividadDescartada && (
          <Dialogo titulo={t.inactivoTitulo} onCerrar={() => setInactividadDescartada(true)} textoCerrar={textos.selector.cerrar}>
            <div className="flex flex-col gap-4 p-5">
              {confirmarDescarte ? (
                <>
                  <p className="text-lg text-white">{t.descartarTexto(totalSeries)}</p>
                  <Boton variante="peligro" onClick={() => descartar(actual)}>{t.descartarConfirmar}</Boton>
                  <Boton variante="secundario" onClick={() => setConfirmarDescarte(false)}>{t.volver}</Boton>
                </>
              ) : (
                <>
                  <p className="text-lg text-white">{t.inactivoTexto(horasInactivo)}</p>
                  <p className="text-slate-400">{t.inactivoDetalle}</p>
                  <Boton onClick={() => finalizar(actual, ultimaSerie)}>{t.inactivoFinalizar}</Boton>
                  <Boton variante="secundario" onClick={() => setConfirmarDescarte(true)}>{t.descartarEntrenamiento}</Boton>
                  <Boton variante="secundario" onClick={() => setInactividadDescartada(true)}>{t.seguir}</Boton>
                </>
              )}
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
      <AvisoConflictos conflictos={conflictos} entrenamiento={entrenamiento} unidad={unidad} onRepetir={repetir} onDescartar={descartarConflicto} />
      {modo.tipo === 'descartado' && <AvisoError mensaje={t.descartado} />}
      {contenido}
      <p aria-live="polite" className="sr-only">{anuncio}</p>
    </section>
  );
}
