import { ErrorRed } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { IconoSalir } from '../../componentes/Iconos';
import { useCerrarSesion, useSesion } from '../../app/sesion';
import { textos } from '../../textos/es';
import { AvisoError } from './AvisoError';

/** Tarjeta de la sección Cuenta con el usuario actual y el cierre de sesión (P1). */
export function CerrarSesion() {
  const { data: usuario } = useSesion();
  const salir = useCerrarSesion();

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-6">
      <p className="text-base text-slate-300">
        {textos.acceso.sesionIniciada}{' '}
        <span className="break-all font-semibold text-white">{usuario?.email}</span>
      </p>
      {salir.isError && <AvisoError mensaje={salir.error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico} />}
      <Boton variante="secundario" cargando={salir.isPending} onClick={() => salir.mutate()} className="w-full sm:w-auto sm:self-start">
        {!salir.isPending && <IconoSalir className="size-5" />}
        {salir.isPending ? textos.acceso.cerrandoSesion : textos.acceso.cerrarSesion}
      </Boton>
    </div>
  );
}
