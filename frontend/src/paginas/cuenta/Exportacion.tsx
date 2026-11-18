import { useMutation } from '@tanstack/react-query';
import { ErrorRed } from '../../api/cliente';
import { exportarDatos, type FormatoExportacion } from '../../api/cuenta';
import { Boton } from '../../componentes/Boton';
import { IconoCheck, IconoDescarga } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';

const t = textos.cuenta;
const FORMATOS: FormatoExportacion[] = ['json', 'csv'];

/** Entrega el fichero al navegador como descarga y libera el enlace temporal. */
function guardarFichero(contenido: Blob, nombre: string) {
  const href = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = href;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/** Exportación de todos los datos propios en JSON y CSV (FR-025). */
export function Exportacion() {
  const exportar = useMutation({
    mutationFn: exportarDatos,
    onSuccess: ({ contenido, nombre }) => guardarFichero(contenido, nombre),
  });

  return (
    <section aria-labelledby="titulo-exportar" className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5">
      <div>
        <h2 id="titulo-exportar" className="font-display text-2xl font-bold text-white">{t.exportar}</h2>
        <p className="text-sm text-slate-400">{t.exportarDetalle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMATOS.map((formato) => {
          const nombre = formato.toUpperCase();
          const enCurso = exportar.isPending && exportar.variables === formato;
          return (
            <Boton key={formato} variante="secundario" cargando={enCurso} disabled={exportar.isPending && !enCurso} onClick={() => exportar.mutate(formato)}>
              {!enCurso && <IconoDescarga className="size-5 text-lime-300" />}
              {enCurso ? t.preparando(nombre) : t.exportarFormato(nombre)}
            </Boton>
          );
        })}
      </div>
      {exportar.isError && <AvisoError mensaje={exportar.error instanceof ErrorRed ? textos.errores.sinConexion : t.errorExportar} />}
      {exportar.isSuccess && (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-lime-300"><IconoCheck className="size-4" />{t.descargaLista(exportar.data.nombre)}</p>
      )}
    </section>
  );
}
