import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CLAVE_RUTINAS, listarRutinas } from '../../api/rutinas';
import { Boton } from '../../componentes/Boton';
import { IconoRutinas } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';
import { CLASES_ENLACE } from '../auth/PaginaLogin';
import { diaIso } from './dias';
import { mensajeInicio, useIniciarDesdeRutina } from './iniciarDesdeRutina';

const t = textos.rutinas;

/**
 * Atajo en Entrenar sin entrenamiento en curso: las rutinas de hoy con «Iniciar», o «Ver rutinas».
 * Si no hay red no muestra errores: las opciones que funcionan sin red siguen disponibles.
 */
export function RutinasDeHoy() {
  const rutinas = useQuery({ queryKey: CLAVE_RUTINAS, queryFn: ({ signal }) => listarRutinas(signal), retry: false });
  const iniciar = useIniciarDesdeRutina();
  const hoy = (rutinas.data ?? []).filter((r) => r.diaSemana === diaIso());
  if (rutinas.isPending) return null;
  if (!hoy.length) return <Link to="/rutinas" className={CLASES_ENLACE}>{t.verRutinas}</Link>;

  return (
    <section aria-labelledby="titulo-rutinas-hoy" className="flex w-full flex-col gap-3 border-t border-white/10 pt-4">
      <h3 id="titulo-rutinas-hoy" className="flex items-center gap-2 font-display text-xl font-bold text-white">
        <IconoRutinas className="size-5 text-lime-300" />{t.deHoy}
      </h3>
      {iniciar.isError && <AvisoError mensaje={mensajeInicio(iniciar.error).texto} />}
      <ul className="flex flex-col gap-2">
        {hoy.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/5 py-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{r.nombre}</p>
              <p className="text-sm text-slate-400">{t.ejercicios(r.ejercicios.length)}</p>
            </div>
            <Boton variante="secundario" aria-label={t.iniciarRutina(r.nombre)} cargando={iniciar.isPending && iniciar.variables === r.id}
              disabled={iniciar.isPending} onClick={() => iniciar.mutate(r.id)}>
              {t.iniciar}
            </Boton>
          </li>
        ))}
      </ul>
    </section>
  );
}
