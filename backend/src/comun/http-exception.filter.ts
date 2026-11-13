import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

const errores: Record<number, { codigo: string; mensaje: string }> = {
  400: { codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.' },
  401: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión.' },
  403: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes permiso para realizar esta acción.' },
  404: { codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.' },
  409: { codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.' },
  410: { codigo: 'ENLACE_INVALIDO', mensaje: 'El enlace no es válido o ha caducado.' },
  413: { codigo: 'VALIDACION', mensaje: 'La solicitud supera el tamaño permitido.' },
  429: { codigo: 'DEMASIADAS_PETICIONES', mensaje: 'Demasiadas peticiones. Inténtalo más tarde.' },
};
const conflictos = new Set(['CONFLICTO_VERSION', 'ENTRENAMIENTO_EN_CURSO', 'EJERCICIO_DUPLICADO', 'EJERCICIO_EN_USO', 'EMAIL_EN_USO']);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const fallback = errores[status] ?? { codigo: status >= 500 ? 'ERROR_INTERNO' : 'ERROR_HTTP', mensaje: 'No se pudo completar la solicitud.' };
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const detail = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const contractual = status < 500 && (detail.codigo === fallback.codigo || (status === 409 && conflictos.has(String(detail.codigo))));
    const response = {
      codigo: contractual ? detail.codigo : fallback.codigo,
      mensaje: contractual && typeof detail.mensaje === 'string' ? detail.mensaje : fallback.mensaje,
      campos: contractual && status === 400 ? detail.campos ?? null : null,
      actual: contractual && status === 409 ? detail.actual ?? null : null,
    };
    // Nunca registrar la excepción, su stack, ni la petición/respuesta.
    host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(status).json(response);
  }
}
