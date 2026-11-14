import { useEffect, useRef, useState } from 'react';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { textos } from '../../textos/es';

export type CampoAcceso = 'email' | 'contrasena';
export type ErroresAcceso = Partial<Record<CampoAcceso, string>>;

/**
 * Valida con el esquema compartido del dominio (que llama `password` a la contraseña) y devuelve
 * mensajes propios de la interfaz, sin reflejar los mensajes internos de Zod.
 */
interface EsquemaAcceso {
  safeParse(valor: unknown): { success: true } | { success: false; error: { issues: { path: PropertyKey[] }[] } };
}

export function validarAcceso(esquema: EsquemaAcceso, valores: { email: string; contrasena: string }, mensajeContrasena: string) {
  const resultado = esquema.safeParse({ email: valores.email, password: valores.contrasena });
  const errores: ErroresAcceso = {};
  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      if (problema.path[0] === 'email') errores.email = textos.acceso.errorEmail;
      if (problema.path[0] === 'password') errores.contrasena = mensajeContrasena;
    }
  }
  return errores;
}

/** Errores por campo, aviso general y foco en el primer campo inválido tras cada envío fallido. */
export function useErroresFormulario() {
  const formulario = useRef<HTMLFormElement>(null);
  const [errores, setErrores] = useState<ErroresAcceso>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (intento) formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [intento]);

  return {
    formulario, errores, aviso,
    limpiar: () => { setErrores({}); setAviso(null); },
    rechazar: (nuevos: ErroresAcceso) => { setErrores(nuevos); setIntento((n) => n + 1); },
    /** Traduce la respuesta del servidor: errores por campo (400/409) o aviso general. */
    fallo: (error: unknown, mensajeConflicto?: CampoAcceso, mensaje401?: string) => {
      if (error instanceof ErrorApi) {
        if (error.status === 401 && mensaje401) { setAviso(mensaje401); return; }
        const campos: ErroresAcceso = {};
        for (const campo of ['email', 'contrasena'] as const) {
          if (error.campos?.[campo]) campos[campo] = error.campos[campo];
        }
        if (error.status === 409 && mensajeConflicto) campos[mensajeConflicto] = error.mensaje;
        if (Object.keys(campos).length) { setErrores(campos); setIntento((n) => n + 1); return; }
        setAviso(error.mensaje);
        return;
      }
      setAviso(error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico);
    },
  };
}
