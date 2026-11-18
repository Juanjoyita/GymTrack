import { kgALb } from '@gymtrack/domain';
import { useState, type FormEvent } from 'react';
import { ErrorRed } from '../../api/cliente';
import { useActualizarPreferencias, useSesion } from '../../app/sesion';
import { Boton } from '../../componentes/Boton';
import { CampoSeleccion } from '../../componentes/CampoSeleccion';
import { IconoCheck } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';

const t = textos.cuenta;
type Unidad = 'kg' | 'lb';
const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

/** Unidad de visualización (FR-024): la conversión es del dominio compartido y nunca altera los datos. */
export function Preferencias() {
  const actual = useSesion().data?.unidadPeso ?? 'kg';
  const [unidad, setUnidad] = useState<Unidad>(actual);
  const guardar = useActualizarPreferencias();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    guardar.mutate({ unidadPeso: unidad });
  }

  return (
    <section aria-labelledby="titulo-preferencias" className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5">
      <div>
        <h2 id="titulo-preferencias" className="font-display text-2xl font-bold text-white">{t.preferencias}</h2>
        <p className="text-sm text-slate-400">{t.preferenciasDetalle}</p>
      </div>
      <form noValidate onSubmit={enviar} className="flex flex-col gap-3">
        <CampoSeleccion etiqueta={t.unidadPeso} value={unidad}
          onChange={(e) => { setUnidad(e.target.value as Unidad); guardar.reset(); }}
          opciones={(['kg', 'lb'] as const).map((u) => ({ valor: u, texto: t.unidades[u] }))} />
        <p className="text-sm text-slate-400">{t.ejemploUnidad(numero.format(100), numero.format(kgALb(100)))}</p>
        {guardar.isError && <AvisoError mensaje={guardar.error instanceof ErrorRed ? textos.errores.sinConexion : t.errorPreferencias} />}
        {guardar.isSuccess && (
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-lime-300"><IconoCheck className="size-4" />{t.preferenciasGuardadas}</p>
        )}
        <Boton type="submit" cargando={guardar.isPending} disabled={unidad === actual && !guardar.isPending} className="w-full sm:w-auto sm:self-start">
          {guardar.isPending ? t.guardandoPreferencias : t.guardarPreferencias}
        </Boton>
      </form>
    </section>
  );
}
