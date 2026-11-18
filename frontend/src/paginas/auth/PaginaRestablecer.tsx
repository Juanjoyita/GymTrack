import { esquemaRestablecer } from '@gymtrack/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { useRestablecerContrasena } from '../../app/sesion';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { textos } from '../../textos/es';
import { AvisoError } from './AvisoError';
import { useErroresFormulario } from './formulario';
import { PantallaAcceso } from './PantallaAcceso';
import { CLASES_ENLACE } from './PaginaLogin';

const t = textos.acceso.restablecer;

/**
 * Nueva contraseña desde el enlace del correo. El token solo vive en memoria: se quita de la
 * dirección al abrir la página y nunca se guarda en el navegador.
 */
export function PaginaRestablecer() {
  const [parametros, setParametros] = useSearchParams();
  const [token] = useState(() => parametros.get('token'));
  const [enlaceInvalido, setEnlaceInvalido] = useState(!token);
  const restablecer = useRestablecerContrasena();
  const navegar = useNavigate();
  const { formulario, errores, aviso, rechazar, limpiar, fallo } = useErroresFormulario();

  useEffect(() => { if (parametros.has('token')) setParametros({}, { replace: true }); }, [parametros, setParametros]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const contrasenaNueva = String(new FormData(evento.currentTarget).get('contrasenaNueva') ?? '');
    limpiar();
    if (!esquemaRestablecer.safeParse({ token, contrasenaNueva }).success) return rechazar({ contrasena: textos.acceso.errorContrasenaLongitud });
    restablecer.mutate({ token: token!, contrasenaNueva }, {
      onSuccess: () => navegar('/login', { replace: true, state: { aviso: t.hecho } }),
      onError: (error) => {
        if (error instanceof ErrorApi && error.status === 410) return setEnlaceInvalido(true);
        if (error instanceof ErrorApi && error.campos?.contrasenaNueva) return rechazar({ contrasena: textos.acceso.errorContrasenaLongitud });
        fallo(error instanceof ErrorRed ? error : new Error());
      },
    });
  }

  return (
    <PantallaAcceso titulo={t.titulo} subtitulo={t.subtitulo}
      pie={<p><Link to="/login" className={CLASES_ENLACE}>{textos.acceso.recuperar.volver}</Link></p>}>
      {enlaceInvalido ? (
        <div className="flex flex-col gap-4">
          <AvisoError mensaje={t.enlaceInvalido} />
          <Link to="/recuperar" className={CLASES_ENLACE}>{t.pedirOtro}</Link>
        </div>
      ) : (
        <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-5">
          {aviso && <AvisoError mensaje={aviso} />}
          <Campo etiqueta={t.contrasena} name="contrasenaNueva" type="password" autoComplete="new-password" ayuda={textos.acceso.ayudaContrasena} error={errores.contrasena} />
          <Boton type="submit" cargando={restablecer.isPending} className="mt-2 w-full">{restablecer.isPending ? t.enviando : t.enviar}</Boton>
        </form>
      )}
    </PantallaAcceso>
  );
}
