import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorRed } from '../../api/cliente';
import type { Ejercicio } from '../../api/ejercicios';
import { anadirEjercicioRealizado, obtenerEntrenamientoEnCurso, type EjercicioRealizado, type Entrenamiento } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { IconoCargando, IconoMancuerna, IconoMas } from '../../componentes/Iconos';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { AvisoError } from '../auth/AvisoError';
import { textos } from '../../textos/es';
import { SelectorEjercicio } from './SelectorEjercicio';

const t = textos.entrenar;
export const CLAVE_EN_CURSO = ['entrenamiento', 'en-curso'] as const;

function horaLocal(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria }).format(new Date(iso));
}

/**
 * Sección Entrenar. En T025 muestra el entrenamiento en curso con sus ejercicios y permite añadir
 * ejercicios con el selector. Iniciar, registrar series y finalizar llegan en T027.
 */
export function PaginaEntrenar() {
  useTituloDocumento(textos.navegacion.entrenar);
  const cliente = useQueryClient();
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enCurso = useQuery({ queryKey: CLAVE_EN_CURSO, queryFn: obtenerEntrenamientoEnCurso });

  // El ejercicio aparece al momento; si el servidor lo rechaza, se retira y se avisa.
  const anadir = useMutation({
    mutationFn: ({ entrenamiento, realizado }: { entrenamiento: Entrenamiento; realizado: EjercicioRealizado }) =>
      anadirEjercicioRealizado(entrenamiento.id, { id: realizado.id, ejercicioId: realizado.ejercicioId, posicion: realizado.posicion }),
    onMutate: ({ realizado }) => {
      setAviso(null);
      cliente.setQueryData<Entrenamiento | null>(CLAVE_EN_CURSO, (actual) => actual && { ...actual, ejercicios: [...actual.ejercicios, realizado] });
    },
    onSuccess: (guardado) => {
      cliente.setQueryData<Entrenamiento | null>(CLAVE_EN_CURSO, (actual) => actual && {
        ...actual, ejercicios: actual.ejercicios.map((e) => (e.id === guardado.id ? { ...e, ...guardado } : e)),
      });
    },
    onError: (error, { realizado }) => {
      cliente.setQueryData<Entrenamiento | null>(CLAVE_EN_CURSO, (actual) => actual && { ...actual, ejercicios: actual.ejercicios.filter((e) => e.id !== realizado.id) });
      setAviso(error instanceof ErrorRed ? textos.errores.sinConexion : t.errorAnadir(realizado.nombre));
    },
  });

  function elegir(entrenamiento: Entrenamiento, ejercicio: Ejercicio) {
    setSelectorAbierto(false);
    anadir.mutate({
      entrenamiento,
      realizado: {
        id: crypto.randomUUID(), ejercicioId: ejercicio.id, nombre: ejercicio.nombre, posicion: entrenamiento.ejercicios.length + 1,
        nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [],
      },
    });
  }

  const entrenamiento = enCurso.data;
  return (
    <section aria-labelledby="titulo-pagina" className="flex flex-col gap-6">
      <h1 id="titulo-pagina" tabIndex={-1} className="font-display text-6xl font-extrabold italic leading-none text-white focus:outline-none">
        {textos.navegacion.entrenar}
      </h1>

      {aviso && <AvisoError mensaje={aviso} />}

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
          {entrenamiento.ejercicios.length ? (
            <ol className="flex flex-col gap-3">
              {entrenamiento.ejercicios.map((ejercicio) => (
                <li key={ejercicio.id} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3">
                  <h3 className="text-lg font-bold text-white">{ejercicio.nombre}</h3>
                  <p className="text-sm text-slate-400">{t.sinSeries}</p>
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
