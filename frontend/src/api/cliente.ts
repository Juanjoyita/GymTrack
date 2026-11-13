import { textos } from '../textos/es';

// Base de la API REST (contracts/api.md). Se puede apuntar a otro origen con VITE_API_URL.
const BASE_API = import.meta.env.VITE_API_URL ?? '/api';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface OpcionesSolicitud {
  method?: Metodo;
  cuerpo?: unknown;
  signal?: AbortSignal;
}

export interface CuerpoError {
  codigo: string;
  mensaje: string;
  campos: Record<string, string> | null;
  actual: unknown;
}

/** Error con el formato común del contrato (codigo, mensaje, campos, actual). */
export class ErrorApi extends Error implements CuerpoError {
  readonly codigo: string;
  readonly mensaje: string;
  readonly campos: Record<string, string> | null;
  readonly actual: unknown;

  constructor(readonly status: number, cuerpo: CuerpoError) {
    super(cuerpo.mensaje);
    this.name = 'ErrorApi';
    this.codigo = cuerpo.codigo;
    this.mensaje = cuerpo.mensaje;
    this.campos = cuerpo.campos;
    this.actual = cuerpo.actual;
  }
}

/** La petición no llegó al servidor (sin conexión o servidor caído). */
export class ErrorRed extends Error {
  constructor() {
    super(textos.errores.sinConexion);
    this.name = 'ErrorRed';
  }
}

function esCuerpoError(valor: unknown): valor is CuerpoError {
  if (!valor || typeof valor !== 'object') return false;
  const candidato = valor as Record<string, unknown>;
  return typeof candidato.codigo === 'string' && typeof candidato.mensaje === 'string';
}

async function leerJson(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/**
 * Hace una petición JSON a la API. La sesión viaja en la cookie httpOnly (research R-03),
 * por eso se envía siempre `credentials: 'include'` y nunca se guarda ningún token en el cliente.
 */
export async function solicitar<T = unknown>(ruta: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  const cabeceras = new Headers({ Accept: 'application/json' });
  const tieneCuerpo = opciones.cuerpo !== undefined;
  if (tieneCuerpo) cabeceras.set('Content-Type', 'application/json');

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_API}${ruta}`, {
      method: opciones.method ?? 'GET',
      credentials: 'include',
      headers: cabeceras,
      body: tieneCuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: opciones.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ErrorRed();
  }

  const cuerpo = await leerJson(respuesta);
  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, esCuerpoError(cuerpo)
      ? { codigo: cuerpo.codigo, mensaje: cuerpo.mensaje, campos: cuerpo.campos ?? null, actual: cuerpo.actual ?? null }
      : { codigo: 'ERROR_HTTP', mensaje: textos.errores.generico, campos: null, actual: null });
  }
  return cuerpo as T;
}
