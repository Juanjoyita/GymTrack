import { BadRequestException } from '@nestjs/common';
import { esquemaLogin, esquemaRegistro } from '@gymtrack/domain';

export function validarAcceso(input: unknown, registro: boolean) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  // Adaptación de nombres, sin duplicar las reglas Zod compartidas.
  const result = (registro ? esquemaRegistro : esquemaLogin).safeParse({ email: data.email, password: data.contrasena });
  const campos: Record<string, string> = Object.create(null);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const campo = issue.path.map((part) => part === 'password' ? 'contrasena' : String(part)).join('.') || '_raiz';
      campos[campo] ??= 'Revisa el formato y los límites del campo.';
    }
  }
  if (registro) {
    try {
      if (typeof data.zonaHoraria !== 'string' || data.zonaHoraria.length > 64 || !data.zonaHoraria.trim()) throw new Error();
      new Intl.DateTimeFormat('es', { timeZone: data.zonaHoraria });
    } catch { campos.zonaHoraria = 'Selecciona una zona horaria válida.'; }
  }
  if (!result.success || Object.keys(campos).length) {
    throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos, actual: null });
  }
  return { email: result.data.email.toLowerCase(), contrasena: result.data.password, zonaHoraria: data.zonaHoraria as string };
}
