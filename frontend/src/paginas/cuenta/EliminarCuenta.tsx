import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { eliminarCuenta } from '../../api/cuenta';
import { META_ACCESO, olvidarCuenta, useSesion } from '../../app/sesion';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { Dialogo } from '../../componentes/Dialogo';
import { IconoAlerta, IconoPapelera } from '../../componentes/Iconos';
import { useCola, usePendientes } from '../../sincronizacion/contexto';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';

const t = textos.cuenta;

/**
 * Eliminación de la cuenta (FR-026): diálogo explícito con contraseña. Solo cuando el servidor confirma
 * (204) se cierra la cola y se borran la sesión, la caché y los datos locales de este usuario; ante un
 * 401 o un fallo no se borra nada.
 */
export function EliminarCuenta() {
  const [abierto, setAbierto] = useState(false);
  const [errorCampo, setErrorCampo] = useState<string>();
  const contrasena = useRef<HTMLInputElement>(null);
  const cliente = useQueryClient();
  const cola = useCola();
  const pendientes = usePendientes().length;
  const usuarioId = useSesion().data?.id;
  const eliminar = useMutation({
    mutationFn: eliminarCuenta,
    // Su 401 es una contraseña incorrecta, no una sesión caducada.
    meta: META_ACCESO,
    onSuccess: () => {
      cola.borrar();
      if (usuarioId) olvidarCuenta(cliente, usuarioId);
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.status === 401) {
        setErrorCampo(t.contrasenaIncorrecta);
        contrasena.current?.focus();
      }
    },
  });

  function cerrar() {
    if (eliminar.isPending) return;
    setAbierto(false);
    setErrorCampo(undefined);
    eliminar.reset();
  }

  function confirmar(evento: FormEvent) {
    evento.preventDefault();
    const valor = contrasena.current?.value ?? '';
    eliminar.reset();
    if (!valor) {
      setErrorCampo(textos.acceso.errorContrasenaVacia);
      contrasena.current?.focus();
      return;
    }
    setErrorCampo(undefined);
    eliminar.mutate(valor);
  }

  const errorGeneral = eliminar.isError && !(eliminar.error instanceof ErrorApi && eliminar.error.status === 401)
    ? (eliminar.error instanceof ErrorRed ? textos.errores.sinConexion : t.errorEliminar) : null;

  return (
    <section aria-labelledby="titulo-eliminar" className="flex flex-col gap-4 rounded-3xl border border-red-400/30 bg-red-950/20 p-5">
      <div>
        <h2 id="titulo-eliminar" className="font-display text-2xl font-bold text-white">{t.eliminar}</h2>
        <p className="text-sm text-slate-300">{t.eliminarDetalle}</p>
      </div>
      <Boton variante="peligro" onClick={() => setAbierto(true)} className="w-full sm:w-auto sm:self-start">
        <IconoPapelera className="size-5" />{t.eliminarCuenta}
      </Boton>

      {abierto && (
        <Dialogo titulo={t.eliminarTitulo} onCerrar={cerrar} textoCerrar={textos.selector.cerrar} focoInicial={contrasena}>
          <form noValidate onSubmit={confirmar} className="flex flex-col gap-4 overflow-y-auto p-5">
            <p className="flex items-start gap-2 text-slate-200"><IconoAlerta className="mt-0.5 size-5 shrink-0 text-red-300" />{t.eliminarTexto}</p>
            {pendientes > 0 && <p className="font-semibold text-amber-300">{t.eliminarPendientes(pendientes)}</p>}
            {errorGeneral && <AvisoError mensaje={errorGeneral} />}
            <Campo ref={contrasena} etiqueta={t.eliminarContrasena} name="contrasena" type="password" autoComplete="current-password"
              ayuda={t.eliminarAyuda} error={errorCampo} />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Boton type="submit" variante="peligro" cargando={eliminar.isPending} className="flex-1">
                {eliminar.isPending ? t.eliminando : t.eliminarConfirmar}
              </Boton>
              <Boton variante="secundario" onClick={cerrar} disabled={eliminar.isPending} className="flex-1">{t.cancelar}</Boton>
            </div>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
