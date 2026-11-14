import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { IconoCargando, IconoMancuerna } from '../componentes/Iconos';
import { AvisoError } from '../paginas/auth/AvisoError';
import { ErrorRed } from '../api/cliente';
import { textos } from '../textos/es';
import { ProveedorSincronizacion } from '../sincronizacion/contexto';
import { useSesion } from './sesion';

interface EstadoNavegacion { desde?: string }

/** Pantalla mientras se consulta GET /auth/yo, o si no se pudo consultar. */
function PantallaSesion({ error, reintentar }: { error?: unknown; reintentar?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-white">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-lime-300 text-slate-950">
        <IconoMancuerna className="size-8" />
      </span>
      {error ? (
        <div className="flex w-full max-w-sm flex-col gap-4 text-left">
          <AvisoError mensaje={error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico} />
          <Boton onClick={reintentar} className="w-full">{textos.acceso.reintentar}</Boton>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-base text-slate-300">
          <IconoCargando className="size-5 motion-safe:animate-spin" />
          {textos.acceso.comprobando}
        </p>
      )}
    </div>
  );
}

/** Páginas privadas: sin sesión válida llevan a /login recordando la página pedida. */
export function RutaPrivada() {
  const sesion = useSesion();
  const { pathname, search } = useLocation();
  if (sesion.isPending) return <PantallaSesion />;
  if (sesion.isError) return <PantallaSesion error={sesion.error} reintentar={() => sesion.refetch()} />;
  if (!sesion.data) return <Navigate to="/login" replace state={{ desde: `${pathname}${search}` } satisfies EstadoNavegacion} />;
  return <ProveedorSincronizacion usuarioId={sesion.data.id}><Outlet /></ProveedorSincronizacion>;
}

/** /login y /registro: con sesión iniciada se vuelve a la página pedida o al inicio. */
export function RutaPublica() {
  const sesion = useSesion();
  const { state } = useLocation();
  if (sesion.isPending) return <PantallaSesion />;
  if (sesion.data) return <Navigate to={(state as EstadoNavegacion | null)?.desde ?? '/'} replace />;
  return <Outlet />;
}
