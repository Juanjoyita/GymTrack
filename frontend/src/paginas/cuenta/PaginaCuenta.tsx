import { useTituloDocumento } from '../../app/useTituloDocumento';
import { textos } from '../../textos/es';
import { CerrarSesion } from '../auth/CerrarSesion';
import { EliminarCuenta } from './EliminarCuenta';
import { Exportacion } from './Exportacion';
import { Preferencias } from './Preferencias';

/** Sección Cuenta (US4): sesión, preferencias, exportación de datos y eliminación de la cuenta. */
export function PaginaCuenta() {
  useTituloDocumento(textos.navegacion.cuenta);
  return (
    <div className="flex flex-col gap-6">
      <h1 tabIndex={-1} className="font-display text-4xl font-bold leading-tight text-white focus:outline-none">{textos.navegacion.cuenta}</h1>
      <CerrarSesion />
      <Preferencias />
      <Exportacion />
      <EliminarCuenta />
    </div>
  );
}
