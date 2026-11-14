import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorRed } from '../../api/cliente';
import type { Ejercicio } from '../../api/ejercicios';
import { CLAVE_EN_CURSO, obtenerEntrenamientoEnCurso, type Entrenamiento } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { IconoCargando, IconoMancuerna, IconoMas, IconoReloj } from '../../componentes/Iconos';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { useCola, useConflictos, usePendientes } from '../../sincronizacion/contexto';
import { AvisoError } from '../auth/AvisoError';
import { textos } from '../../textos/es';
import { SelectorEjercicio } from './SelectorEjercicio';

const t = textos.entrenar;

function horaLocal(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria }).format(new Date(iso));
}

/**
 * Sección Entrenar: entrenamiento en curso con sus ejercicios. Añadir un ejercicio se guarda primero
 * en la cola duradera (R-08) y se muestra al instante como pendiente hasta que el servidor confirma.
 * Iniciar, registrar series y finalizar llegan en T027.
 */
export function PaginaEntrenar() {
  useTituloDocumento(textos.navegacion.entrenar);
  const cola = useCola();
  const pendientes = usePendientes();
  const conflictos = useConflictos();
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const enCurso = useQuery({ queryKey: CLAVE_EN_CURSO, queryFn: obtenerEntrenamientoEnCurso });
  const entrenamiento = enCurso.data;

  // Ejercicios del servidor más los añadidos que siguen en la cola, marcados como pendientes.
  const rutaEjercicios = entrenamiento && `/entrenamientos/${entrenamiento.id}/ejercicios`;
  const enCola = pendientes.filter((o) => o.metodo === 'POST' && o.ruta === rutaEjercicios);
  const ejercicios = entrenamiento ? [
    ...entrenamiento.ejercicios.map((e) => ({ id: e.id, nombre: e.nombre, pendiente: pendientes.some((o) => o.recurso === e.id) })),
    ...enCola.filter((o) => !entrenamiento.ejercicios.some((e) => e.id === o.recurso))
      .map((o) => ({ id: o.recurso, nombre: String(o.vista?.nombre ?? ''), pendiente: true })),
  ] : [];

  function elegir(actual: Entrenamiento, ejercicio: Ejercicio) {
    setSelectorAbierto(false);
    const id = crypto.randomUUID();
    cola.encolar({
      metodo: 'POST', ruta: `/entrenamientos/${actual.id}/ejercicios`, recurso: id, dependeDe: [actual.id],
      cuerpo: { id, ejercicioId: ejercicio.id, posicion: ejercicios.length + 1 }, vista: { nombre: ejercicio.nombre },
    });
  }

  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col gap-6">
      <h1 id="titulo-pagina" tabIndex={-1} className="font-display text-6xl font-extrabold italic leading-none text-white focus:outline-none">
        {textos.navegacion.entrenar}
      </h1>

      {conflictos.length > 0 && <AvisoError mensaje={t.conflictos(conflictos.length)} />}

      {enCurso.isPending ? (
        <p role="status" className="flex items-center gap-2 text-slate-400"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargando}</p>
      ) : enCurso.isError ? (
        <div className="flex flex-col gap-3">
          <AvisoError mensaje={enCurso.error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico} />
          <Boton variante="secundario" onClick={() => enCurso.refetch()}>{textos.acceso.reintentar}</Boton>
        </div>
      ) : !entrenamiento ? (
        <div className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-white/15 p-6">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lime-300">
            <IconoMancuerna className="size-6" />
          </span>
          <p className="text-lg font-semibold text-white">{t.sinEntrenamiento}</p>
          <p className="text-slate-400">{t.pronto}</p>
        </div>
      ) : (
        <section aria-labelledby="titulo-en-curso" className="flex flex-col gap-4">
          <div>
            <h2 id="titulo-en-curso" className="font-display text-3xl font-bold leading-tight text-white">{t.enCurso}</h2>
            <p className="text-sm text-slate-400">{t.desde} {horaLocal(entrenamiento.inicio, entrenamiento.zonaHoraria)}</p>
          </div>
          {ejercicios.length ? (
            <ol className="flex flex-col gap-3">
              {ejercicios.map((ejercicio) => (
                <li key={ejercicio.id} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3">
                  <h3 className="text-lg font-bold text-white">{ejercicio.nombre}</h3>
                  {ejercicio.pendiente ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                      <IconoReloj className="size-4" />{t.pendiente}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">{t.sinSeries}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-slate-400">{t.sinEjercicios}</p>
          )}
          <Boton onClick={() => setSelectorAbierto(true)} className="w-full">
            <IconoMas className="size-5" />{t.anadirEjercicio}
          </Boton>
          {selectorAbierto && <SelectorEjercicio onElegir={(e) => elegir(entrenamiento, e)} onCerrar={() => setSelectorAbierto(false)} />}
        </section>
      )}
    </section>
  );
}
