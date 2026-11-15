import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Entrenamiento } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import type { NuevaOperacion } from '../../sincronizacion/cola';
import { usePendientes } from '../../sincronizacion/contexto';
import { textos } from '../../textos/es';
import { ListaEjercicios, useEliminacionesEnEspera } from './ListaEjercicios';
import { conPendientes } from './operaciones';
import { resumenDe, type Resumen } from './ResumenFinal';

const t = textos.entrenar;

/**
 * Entrenamiento registrado a posteriori (FR-014), ya finalizado: se le añaden ejercicios y series
 * con las mismas tarjetas que al entrenamiento en curso. Todo pasa por la cola duradera.
 */
export function EntrenamientoPasado({ inicial, unidad, encolar, contador, onListo }: {
  inicial: Entrenamiento; unidad: 'kg' | 'lb'; encolar: (op: NuevaOperacion) => void; contador: ReactNode; onListo: (resumen: Resumen) => void;
}) {
  // En la caché de consultas, como el entrenamiento en curso: el proveedor incorpora cada confirmación
  // en el mismo instante en que la retira de la cola, sin un pintado intermedio sin el dato.
  const { data: base = inicial } = useQuery<Entrenamiento | null>({
    queryKey: ['entrenamiento', 'pasado', inicial.id], queryFn: () => inicial, initialData: inicial, staleTime: Infinity, enabled: false,
  });
  const pendientes = usePendientes();
  const { registrarPara, enviarTodas } = useEliminacionesEnEspera();
  const entrenamiento = conPendientes(base, pendientes) ?? inicial;
  const fecha = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: inicial.zonaHoraria }).format(new Date(inicial.inicio));
  const hora = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: inicial.zonaHoraria }).format(new Date(iso));

  return (
    <section aria-labelledby="titulo-pasado-vista" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-pasado-vista" className="font-display text-3xl font-bold leading-tight text-white">{t.pasado.titulo(fecha)}</h2>
        <p className="text-sm text-slate-400">{`${hora(inicial.inicio)}–${hora(inicial.fin ?? inicial.inicio)}`}</p>
        {contador}
      </div>
      <ListaEjercicios entrenamiento={entrenamiento} unidad={unidad} pendientes={pendientes} encolar={encolar} registrarPara={registrarPara} />
      <Boton onClick={() => { enviarTodas(); onListo(resumenDe(entrenamiento)); }} className="w-full">{t.pasado.listo}</Boton>
    </section>
  );
}
