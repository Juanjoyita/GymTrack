import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { eliminarRutina, type Rutina } from '../../api/rutinas';
import { Boton } from '../../componentes/Boton';
import { Dialogo } from '../../componentes/Dialogo';
import { IconoAlerta } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';

const t = textos.rutinas;

interface EliminarRutinaProps {
  rutina: Rutina;
  onCerrar: () => void;
  onEliminada: () => void;
  /** 409: la rutina cambió en otro dispositivo; la lista debe mostrar la vigente. */
  onConflicto: () => void;
}

/**
 * Confirmación de borrado (FR-030). El foco empieza en «Cancelar» y la rutina solo se da por
 * eliminada cuando el servidor responde 204.
 */
export function EliminarRutina({ rutina, onCerrar, onEliminada, onConflicto }: EliminarRutinaProps) {
  const cancelar = useRef<HTMLButtonElement>(null);
  const eliminar = useMutation({
    mutationFn: eliminarRutina,
    onSuccess: onEliminada,
    onError: (error) => { if (error instanceof ErrorApi && error.codigo === 'CONFLICTO_VERSION') onConflicto(); },
  });
  const cerrar = () => { if (!eliminar.isPending) onCerrar(); };
  const aviso = eliminar.isError && !(eliminar.error instanceof ErrorApi && eliminar.error.codigo === 'CONFLICTO_VERSION')
    ? (eliminar.error instanceof ErrorRed ? textos.errores.sinConexion : t.errorEliminar) : null;

  return (
    <Dialogo titulo={t.eliminarTitulo(rutina.nombre)} onCerrar={cerrar} textoCerrar={textos.selector.cerrar} focoInicial={cancelar}>
      <div className="flex flex-col gap-4 p-5">
        <p className="flex items-start gap-2 text-slate-200"><IconoAlerta className="mt-0.5 size-5 shrink-0 text-red-300" />{t.eliminarTexto}</p>
        {aviso && <AvisoError mensaje={aviso} />}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Boton variante="peligro" cargando={eliminar.isPending} onClick={() => eliminar.mutate(rutina)} className="flex-1">
            {eliminar.isPending ? t.eliminando : t.eliminarConfirmar}
          </Boton>
          <Boton ref={cancelar} variante="secundario" onClick={cerrar} disabled={eliminar.isPending} className="flex-1">{t.cancelar}</Boton>
        </div>
      </div>
    </Dialogo>
  );
}
