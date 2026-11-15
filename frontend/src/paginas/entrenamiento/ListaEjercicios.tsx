import { useCallback, useRef, useState } from 'react';
import type { Ejercicio } from '../../api/ejercicios';
import type { Entrenamiento } from '../../api/entrenamientos';
import { Boton } from '../../componentes/Boton';
import { IconoMas } from '../../componentes/Iconos';
import type { NuevaOperacion, Operacion } from '../../sincronizacion/cola';
import { textos } from '../../textos/es';
import { opAnadirEjercicio } from './operaciones';
import { SelectorEjercicio } from './SelectorEjercicio';
import { TarjetaEjercicio } from './TarjetaEjercicio';

const t = textos.entrenar;

/**
 * Eliminaciones de series en espera de «Deshacer», por ejercicio: la página las envía antes de
 * finalizar o terminar, para que entren en el resumen.
 */
export function useEliminacionesEnEspera() {
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
  const enviarTodas = useCallback(() => { for (const vaciar of [...eliminaciones.current.values()]) vaciar(); }, []);
  return { registrarPara, enviarTodas };
}

interface ListaEjerciciosProps {
  entrenamiento: Entrenamiento;
  unidad: 'kg' | 'lb';
  pendientes: readonly Operacion[];
  encolar: (op: NuevaOperacion) => void;
  registrarPara: (id: string) => (vaciar: (() => void) | null) => void;
}

/** Ejercicios del entrenamiento con sus series y el botón para añadir otro (en curso o pasado). */
export function ListaEjercicios({ entrenamiento, unidad, pendientes, encolar, registrarPara }: ListaEjerciciosProps) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const conCola = new Set(pendientes.map((o) => o.recurso));

  function elegir(ejercicio: Ejercicio) {
    setSelectorAbierto(false);
    encolar(opAnadirEjercicio(entrenamiento.id, {
      id: crypto.randomUUID(), ejercicioId: ejercicio.id, nombre: ejercicio.nombre, posicion: entrenamiento.ejercicios.length + 1,
      nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [],
    }));
  }

  return (
    <>
      {entrenamiento.ejercicios.length ? (
        <ol className="flex flex-col gap-4">
          {entrenamiento.ejercicios.map((r) => (
            <li key={r.id}>
              <TarjetaEjercicio entrenamientoId={entrenamiento.id} realizado={r} unidad={unidad}
                pendiente={pendientes.some((o) => o.recurso === r.id && o.metodo === 'POST')}
                pendientes={conCola} encolar={encolar} registrarEliminacion={registrarPara(r.id)} />
            </li>
          ))}
        </ol>
      ) : <p className="text-slate-400">{t.sinEjercicios}</p>}
      <Boton variante="secundario" onClick={() => setSelectorAbierto(true)} className="w-full">
        <IconoMas className="size-5 text-lime-300" />{t.anadirEjercicio}
      </Boton>
      {selectorAbierto && <SelectorEjercicio onElegir={elegir} onCerrar={() => setSelectorAbierto(false)} />}
    </>
  );
}
