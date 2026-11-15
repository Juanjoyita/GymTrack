import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { textos } from '../../textos/es';

const t = textos.entrenar.pasado;
const hoy = () => new Date().toLocaleDateString('en-CA');

/**
 * Registro a posteriori (FR-014): fecha y horas locales del dispositivo. Se valida que no sea futuro y
 * que el fin sea posterior al inicio, igual que comprueba el servidor.
 */
export function RegistroPasado({ onRegistrar, onCancelar }: { onRegistrar: (inicio: Date, fin: Date) => void; onCancelar: () => void }) {
  const [errores, setErrores] = useState<{ fecha?: string; inicio?: string; fin?: string }>({});
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => { formulario.current?.querySelector<HTMLElement>('input')?.focus(); }, []);
  useEffect(() => { formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [errores]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const fecha = String(datos.get('fecha') ?? '');
    const horaInicio = String(datos.get('inicio') ?? '');
    const horaFin = String(datos.get('fin') ?? '');
    const nuevos: typeof errores = {};
    if (!fecha) nuevos.fecha = t.errorFecha;
    if (!horaInicio) nuevos.inicio = t.errorHora;
    if (!horaFin) nuevos.fin = t.errorHora;
    const inicio = new Date(`${fecha}T${horaInicio}`);
    const fin = new Date(`${fecha}T${horaFin}`);
    if (!nuevos.fecha && !nuevos.inicio && !nuevos.fin) {
      if (fecha > hoy() || inicio.getTime() > Date.now()) nuevos.fecha = t.errorFuturo;
      else if (fin.getTime() <= inicio.getTime()) nuevos.fin = t.errorOrden;
      else if (fin.getTime() > Date.now()) nuevos.fin = t.errorFinFuturo;
    }
    setErrores(nuevos);
    if (!Object.keys(nuevos).length) onRegistrar(inicio, fin);
  }

  return (
    <form ref={formulario} noValidate onSubmit={enviar} aria-labelledby="titulo-pasado" className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5">
      <h2 id="titulo-pasado" className="font-display text-3xl font-bold text-white">{t.abrir}</h2>
      <Campo etiqueta={t.fecha} name="fecha" type="date" max={hoy()} error={errores.fecha} />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta={t.inicio} name="inicio" type="time" error={errores.inicio} />
        <Campo etiqueta={t.fin} name="fin" type="time" error={errores.fin} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Boton type="submit" className="sm:flex-1">{t.registrar}</Boton>
        <Boton variante="secundario" onClick={onCancelar}>{t.cancelar}</Boton>
      </div>
    </form>
  );
}
