import { GRUPOS_MUSCULARES, esquemaEjercicio, normalizarNombre } from '@gymtrack/domain';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useId, useRef, useState, type FormEvent, type HTMLAttributes } from 'react';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { crearEjercicio, eliminarEjercicio, listarEjercicios, renombrarEjercicio, type Ejercicio, type UsoEjercicio } from '../../api/ejercicios';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { CampoSeleccion } from '../../componentes/CampoSeleccion';
import { Dialogo } from '../../componentes/Dialogo';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoCargando, IconoLapiz, IconoMas, IconoPapelera } from '../../componentes/Iconos';
import { AvisoError } from '../auth/AvisoError';
import { textos } from '../../textos/es';

const t = textos.selector;
const OPCIONES_GRUPO = GRUPOS_MUSCULARES.map((valor) => ({ valor, texto: textos.gruposMusculares[valor] }));

const mensajeDeError = (error: unknown) => (error instanceof ErrorRed ? textos.errores.sinConexion
  : error instanceof ErrorApi ? error.mensaje : textos.errores.generico);

interface SelectorEjercicioProps {
  onElegir: (ejercicio: Ejercicio) => void;
  onCerrar: () => void;
}

/**
 * Selector de ejercicios (FR-004 a FR-006): recientes primero, búsqueda sin mayúsculas ni tildes,
 * creación inmediata de propios y renombrado o borrado de propios con la explicación del bloqueo.
 */
export function SelectorEjercicio({ onElegir, onCerrar }: SelectorEjercicioProps) {
  const cliente = useQueryClient();
  const buscador = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const busqueda = useDeferredValue(texto.trim());
  const [creando, setCreando] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<Ejercicio | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Tras renombrar o cerrar la confirmación, el foco vuelve al botón que inició la acción.
  const contenido = useRef<HTMLDivElement>(null);
  const [devolverFoco, setDevolverFoco] = useState<string | null>(null);
  useEffect(() => {
    if (!devolverFoco) return;
    const destino = contenido.current?.querySelector<HTMLElement>(`[data-foco="${devolverFoco}"]`) ?? buscador.current;
    destino?.focus();
    setDevolverFoco(null);
  }, [devolverFoco]);

  // Sin reintentos automáticos: ante un fallo de red se ofrece «Reintentar» de inmediato.
  const lista = useQuery({
    queryKey: ['ejercicios', busqueda],
    queryFn: ({ signal }) => listarEjercicios(busqueda, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const ejercicios = lista.data ?? [];
  const actualizarLista = () => cliente.invalidateQueries({ queryKey: ['ejercicios'] });

  // Si el nombre ya existe (sin mayúsculas ni tildes) se sugiere el existente en vez de crear otro.
  const existeExacto = ejercicios.some((e) => normalizarNombre(e.nombre) === normalizarNombre(texto));
  const ofrecerCrear = texto.trim().length > 0 && !existeExacto && !lista.isPlaceholderData && !lista.isFetching && lista.isSuccess;

  const eliminar = useMutation({
    mutationFn: (ejercicio: Ejercicio) => eliminarEjercicio(ejercicio.id),
    onSuccess: () => { setPorEliminar(null); setDevolverFoco('buscador'); void actualizarLista(); },
    onError: (error, ejercicio) => {
      setPorEliminar(null);
      setDevolverFoco(`eliminar-${ejercicio.id}`);
      if (error instanceof ErrorApi && error.codigo === 'EJERCICIO_EN_USO') {
        const uso = error.actual as UsoEjercicio;
        setAviso(t.enUso(ejercicio.nombre, uso.entrenamientos, uso.rutinas));
      } else setAviso(mensajeDeError(error));
    },
  });

  // Con la confirmación de borrado abierta, el resto del diálogo queda fuera del foco y del lector.
  const inerte = (porEliminar ? { inert: '' } : {}) as HTMLAttributes<HTMLDivElement>;
  const recientes = ejercicios.filter((e) => e.ultimoUso);
  const resto = ejercicios.filter((e) => !e.ultimoUso);
  const grupos = busqueda ? [{ titulo: t.resultados, items: ejercicios }] : [{ titulo: t.recientes, items: recientes }, { titulo: t.todos, items: resto }];

  return (
    <Dialogo titulo={t.titulo} onCerrar={onCerrar} focoInicial={buscador} textoCerrar={t.cerrar}>
      <div className="border-b border-white/10 px-5 py-4" {...inerte}>
        <Campo ref={buscador} etiqueta={t.buscar} type="search" value={texto} autoComplete="off" enterKeyHint="search"
          onChange={(e) => { setTexto(e.target.value); setCreando(false); setAviso(null); }} />
      </div>

      <div ref={contenido} className="flex-1 overflow-y-auto px-5 py-4" {...inerte}>
        {aviso && <div className="mb-4"><AvisoError mensaje={aviso} /></div>}

        {creando ? (
          <FormularioNuevo nombreInicial={texto.trim()} onVolver={() => setCreando(false)} onCreado={onElegir} />
        ) : lista.isError ? (
          <div className="flex flex-col gap-3">
            <AvisoError mensaje={mensajeDeError(lista.error)} />
            <Boton variante="secundario" onClick={() => lista.refetch()}>{textos.acceso.reintentar}</Boton>
          </div>
        ) : lista.isPending ? (
          <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargando}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {ofrecerCrear && (
              <Boton variante="secundario" onClick={() => setCreando(true)} className="w-full justify-start border-dashed">
                <IconoMas className="size-5 text-lime-300" />{t.crear(texto.trim())}
              </Boton>
            )}
            {!ejercicios.length && <p className="text-slate-400">{t.sinResultados}</p>}
            {grupos.filter((g) => g.items.length).map((grupo) => (
              <section key={grupo.titulo} aria-label={grupo.titulo}>
                <h3 className="mb-2 text-sm font-semibold text-slate-400">{grupo.titulo}</h3>
                <ul className="flex flex-col gap-2">
                  {grupo.items.map((ejercicio) => (
                    <li key={ejercicio.id}>
                      {renombrando === ejercicio.id ? (
                        <FormularioRenombrar ejercicio={ejercicio} onTerminar={(cambio) => {
                          setRenombrando(null); setDevolverFoco(`renombrar-${ejercicio.id}`);
                          if (cambio) void actualizarLista();
                        }} />
                      ) : (
                        <FilaEjercicio ejercicio={ejercicio} onElegir={() => onElegir(ejercicio)}
                          onRenombrar={() => { setAviso(null); setRenombrando(ejercicio.id); }}
                          onEliminar={() => { setAviso(null); setPorEliminar(ejercicio); }} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {porEliminar && (
        <ConfirmarEliminar ejercicio={porEliminar} eliminando={eliminar.isPending}
          onConfirmar={() => eliminar.mutate(porEliminar)}
          onCancelar={() => { setDevolverFoco(`eliminar-${porEliminar.id}`); setPorEliminar(null); }} />
      )}
    </Dialogo>
  );
}

function FilaEjercicio({ ejercicio, onElegir, onRenombrar, onEliminar }: { ejercicio: Ejercicio; onElegir: () => void; onRenombrar: () => void; onEliminar: () => void }) {
  const iconoBoton = `${AREA_TACTIL} ${FOCO_VISIBLE} flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white`;
  const idDetalle = useId();
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-900 pr-1 transition-colors hover:border-white/25">
      {/* Nombre accesible = nombre del ejercicio; el grupo muscular queda como descripción. */}
      <button type="button" onClick={onElegir} aria-label={ejercicio.nombre} aria-describedby={idDetalle} className={`${FOCO_VISIBLE} flex min-h-14 flex-1 flex-col items-start justify-center rounded-2xl px-4 py-2 text-left`}>
        <span className="text-base font-semibold text-white">{ejercicio.nombre}</span>
        <span id={idDetalle} className="text-sm text-slate-400">
          {textos.gruposMusculares[ejercicio.grupoMuscular]}{ejercicio.propio ? ` · ${t.propio}` : ''}
        </span>
      </button>
      {ejercicio.propio && (
        <>
          <button type="button" onClick={onRenombrar} data-foco={`renombrar-${ejercicio.id}`} aria-label={t.renombrar(ejercicio.nombre)} className={iconoBoton}><IconoLapiz className="size-5" /></button>
          <button type="button" onClick={onEliminar} data-foco={`eliminar-${ejercicio.id}`} aria-label={t.eliminar(ejercicio.nombre)} className={iconoBoton}><IconoPapelera className="size-5" /></button>
        </>
      )}
    </div>
  );
}

function FormularioNuevo({ nombreInicial, onVolver, onCreado }: { nombreInicial: string; onVolver: () => void; onCreado: (e: Ejercicio) => void }) {
  const [errores, setErrores] = useState<{ nombre?: string; grupoMuscular?: string }>({});
  const [duplicado, setDuplicado] = useState<Ejercicio | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const crear = useMutation({ mutationFn: crearEjercicio });

  useEffect(() => { formulario.current?.querySelector<HTMLElement>('select')?.focus(); }, []);
  useEffect(() => { formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errores]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setDuplicado(null); setAviso(null);
    const resultado = esquemaEjercicio.safeParse({ nombre: String(datos.get('nombre') ?? ''), grupoMuscular: String(datos.get('grupoMuscular') ?? '') || undefined });
    if (!resultado.success) {
      const campos = new Set(resultado.error.issues.map((i) => i.path[0]));
      return setErrores({ nombre: campos.has('nombre') ? t.errorNombre : undefined, grupoMuscular: campos.has('grupoMuscular') ? t.errorGrupo : undefined });
    }
    setErrores({});
    crear.mutate(resultado.data, {
      onSuccess: onCreado,
      onError: (error) => {
        if (error instanceof ErrorApi && error.codigo === 'EJERCICIO_DUPLICADO') return setDuplicado(error.actual as Ejercicio);
        if (error instanceof ErrorApi && error.campos) return setErrores({ nombre: error.campos.nombre, grupoMuscular: error.campos.grupoMuscular });
        setAviso(mensajeDeError(error));
      },
    });
  }

  return (
    <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <h3 className="font-display text-2xl font-bold">{t.nuevo}</h3>
      {duplicado && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-lime-300/30 bg-lime-300/10 p-4 text-base text-lime-100">
          <p>{t.yaExiste(duplicado.nombre)}</p>
          <Boton onClick={() => onCreado(duplicado)}>{t.usar(duplicado.nombre)}</Boton>
        </div>
      )}
      {aviso && <AvisoError mensaje={aviso} />}
      <Campo etiqueta={t.nombre} name="nombre" defaultValue={nombreInicial} autoComplete="off" error={errores.nombre} />
      <CampoSeleccion etiqueta={t.grupoMuscular} name="grupoMuscular" vacio={t.elegirGrupo} opciones={OPCIONES_GRUPO} defaultValue="" error={errores.grupoMuscular} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Boton type="submit" cargando={crear.isPending} className="sm:flex-1">{crear.isPending ? t.guardando : t.guardarYAnadir}</Boton>
        <Boton variante="secundario" onClick={onVolver}>{t.volver}</Boton>
      </div>
    </form>
  );
}

function FormularioRenombrar({ ejercicio, onTerminar }: { ejercicio: Ejercicio; onTerminar: (cambio: boolean) => void }) {
  const [error, setError] = useState<string | undefined>();
  const formulario = useRef<HTMLFormElement>(null);
  const renombrar = useMutation({ mutationFn: (nombre: string) => renombrarEjercicio(ejercicio.id, nombre) });

  useEffect(() => { formulario.current?.querySelector<HTMLInputElement>('input')?.select(); }, []);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nombre = String(new FormData(evento.currentTarget).get('nombre') ?? '').trim();
    if (!nombre || nombre.length > 80) return setError(t.errorNombre);
    if (nombre === ejercicio.nombre) return onTerminar(false);
    renombrar.mutate(nombre, {
      onSuccess: () => onTerminar(true),
      onError: (e) => setError(e instanceof ErrorApi && e.codigo === 'EJERCICIO_DUPLICADO' ? t.yaExiste((e.actual as Ejercicio).nombre)
        : e instanceof ErrorApi && e.campos?.nombre ? e.campos.nombre : mensajeDeError(e)),
    });
  }

  return (
    <form ref={formulario} noValidate onSubmit={enviar} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onTerminar(false); } }}
      className="flex flex-col gap-3 rounded-2xl border border-lime-300/40 bg-slate-900 p-4">
      <Campo etiqueta={t.nombre} name="nombre" defaultValue={ejercicio.nombre} autoComplete="off" error={error} />
      <div className="flex gap-2">
        <Boton type="submit" cargando={renombrar.isPending} className="flex-1">{t.guardar}</Boton>
        <Boton variante="secundario" onClick={() => onTerminar(false)}>{t.cancelar}</Boton>
      </div>
    </form>
  );
}

function ConfirmarEliminar({ ejercicio, eliminando, onConfirmar, onCancelar }: { ejercicio: Ejercicio; eliminando: boolean; onConfirmar: () => void; onCancelar: () => void }) {
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelar.current?.focus(); }, []);
  return (
    <div className="absolute inset-0 flex items-end bg-black/60 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar(); } }}
        className="w-full rounded-3xl border border-white/10 bg-slate-900 p-5">
        <h3 id="confirmar-titulo" className="text-lg font-bold text-white">{t.confirmarTitulo(ejercicio.nombre)}</h3>
        <p id="confirmar-texto" className="mt-1 text-slate-300">{t.confirmarTexto}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Boton variante="peligro" onClick={onConfirmar} cargando={eliminando} className="sm:flex-1">{t.eliminarBoton}</Boton>
          <Boton ref={cancelar} variante="secundario" onClick={onCancelar}>{t.cancelar}</Boton>
        </div>
      </div>
    </div>
  );
}
