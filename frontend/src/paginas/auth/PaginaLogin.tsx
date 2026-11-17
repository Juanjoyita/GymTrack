import { esquemaLogin } from '@gymtrack/domain';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { useIniciarSesion } from '../../app/sesion';
import { textos } from '../../textos/es';
import { AvisoError } from './AvisoError';
import { PantallaAcceso } from './PantallaAcceso';
import { useErroresFormulario, validarAcceso } from './formulario';

export const CLASES_ENLACE = `${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center rounded-md font-bold text-lime-300 underline decoration-lime-300/40 decoration-2 underline-offset-4 hover:decoration-lime-300`;

export function PaginaLogin() {
  const t = textos.acceso.login;
  const { state } = useLocation();
  // Aviso tras restablecer la contraseña (T049).
  const avisoPrevio = (state as { aviso?: string } | null)?.aviso;
  const login = useIniciarSesion();
  const { formulario, errores, aviso, limpiar, rechazar, fallo } = useErroresFormulario();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const valores = { email: String(datos.get('email') ?? ''), contrasena: String(datos.get('contrasena') ?? '') };
    limpiar();
    const invalidos = validarAcceso(esquemaLogin, valores, textos.acceso.errorContrasenaVacia);
    if (Object.keys(invalidos).length) return rechazar(invalidos);
    login.mutate({ email: valores.email.trim(), contrasena: valores.contrasena }, { onError: (error) => fallo(error, undefined, textos.acceso.credencialesIncorrectas) });
  }

  return (
    <PantallaAcceso
      titulo={t.titulo}
      subtitulo={t.subtitulo}
      pie={<p>{t.pregunta} <Link to="/registro" state={state} className={CLASES_ENLACE}>{t.enlace}</Link></p>}
    >
      <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-5">
        {avisoPrevio && !aviso && <p role="status" className="rounded-xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 text-base text-lime-100">{avisoPrevio}</p>}
        {aviso && <AvisoError mensaje={aviso} />}
        <Campo etiqueta={textos.acceso.email} name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} error={errores.email} />
        <Campo etiqueta={textos.acceso.contrasena} name="contrasena" type="password" autoComplete="current-password" error={errores.contrasena} />
        <Boton type="submit" cargando={login.isPending} className="mt-2 w-full">
          {login.isPending ? t.enviando : t.enviar}
        </Boton>
        <Link to="/recuperar" className={`${CLASES_ENLACE} self-center`}>{textos.acceso.olvidaste}</Link>
      </form>
    </PantallaAcceso>
  );
}
