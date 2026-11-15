import { esquemaRegistro } from '@gymtrack/domain';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { useRegistrarse } from '../../app/sesion';
import { textos } from '../../textos/es';
import { AvisoError } from './AvisoError';
import { PantallaAcceso } from './PantallaAcceso';
import { CLASES_ENLACE } from './PaginaLogin';
import { useErroresFormulario, validarAcceso } from './formulario';

// Campos del contrato POST /auth/registro; la zona horaria se toma del dispositivo, no se pregunta.
export function PaginaRegistro() {
  const t = textos.acceso.registro;
  const { state } = useLocation();
  const registro = useRegistrarse();
  const { formulario, errores, aviso, limpiar, rechazar, fallo } = useErroresFormulario();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const valores = { email: String(datos.get('email') ?? ''), contrasena: String(datos.get('contrasena') ?? '') };
    limpiar();
    const invalidos = validarAcceso(esquemaRegistro, valores, textos.acceso.errorContrasenaLongitud);
    if (Object.keys(invalidos).length) return rechazar(invalidos);
    registro.mutate({ email: valores.email.trim(), contrasena: valores.contrasena }, { onError: (error) => fallo(error, 'email') });
  }

  return (
    <PantallaAcceso
      titulo={t.titulo}
      subtitulo={t.subtitulo}
      pie={<p>{t.pregunta} <Link to="/login" state={state} className={CLASES_ENLACE}>{t.enlace}</Link></p>}
    >
      <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-5">
        {aviso && <AvisoError mensaje={aviso} />}
        <Campo etiqueta={textos.acceso.email} name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} error={errores.email} />
        <Campo etiqueta={textos.acceso.contrasena} name="contrasena" type="password" autoComplete="new-password" ayuda={textos.acceso.ayudaContrasena} error={errores.contrasena} />
        <Boton type="submit" cargando={registro.isPending} className="mt-2 w-full">
          {registro.isPending ? t.enviando : t.enviar}
        </Boton>
      </form>
    </PantallaAcceso>
  );
}
