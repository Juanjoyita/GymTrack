import { esquemaRecuperar } from '@gymtrack/domain';
import { useMutation } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { solicitarRecuperacion } from '../../api/auth';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { IconoCheck } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from './AvisoError';
import { useErroresFormulario } from './formulario';
import { PantallaAcceso } from './PantallaAcceso';
import { CLASES_ENLACE } from './PaginaLogin';

const t = textos.acceso.recuperar;

/**
 * Solicitud del enlace de recuperación (FR-001). El resultado se muestra siempre con el mismo texto,
 * exista o no la cuenta, y el email no se guarda en el navegador.
 */
export function PaginaRecuperar() {
  const recuperar = useMutation({ mutationFn: solicitarRecuperacion });
  const { formulario, errores, rechazar, limpiar } = useErroresFormulario();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const email = String(new FormData(evento.currentTarget).get('email') ?? '').trim();
    limpiar();
    if (!esquemaRecuperar.safeParse({ email }).success) return rechazar({ email: textos.acceso.errorEmail });
    recuperar.mutate(email);
  }

  const error = recuperar.error;
  const aviso = !error ? null
    : error instanceof ErrorApi && error.status === 429 ? t.demasiadas
      : error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico;

  return (
    <PantallaAcceso titulo={t.titulo} subtitulo={t.subtitulo}
      pie={<p><Link to="/login" className={CLASES_ENLACE}>{t.volver}</Link></p>}>
      {recuperar.isSuccess ? (
        <div role="status" className="flex flex-col gap-2 rounded-2xl border border-lime-300/30 bg-lime-300/10 p-4">
          <p className="flex items-start gap-2 font-semibold text-white"><IconoCheck className="mt-0.5 size-5 shrink-0 text-lime-300" />{t.enviado}</p>
          <p className="text-sm text-slate-300">{t.detalle}</p>
        </div>
      ) : (
        <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-5">
          {aviso && <AvisoError mensaje={aviso} />}
          <Campo etiqueta={textos.acceso.email} name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} error={errores.email} />
          <Boton type="submit" cargando={recuperar.isPending} className="mt-2 w-full">{recuperar.isPending ? t.enviando : t.enviar}</Boton>
        </form>
      )}
    </PantallaAcceso>
  );
}
