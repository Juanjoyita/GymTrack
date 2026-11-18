import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, ErrorRed, solicitar } from '../src/api/cliente';

function respuestaJson(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function simularFetch(respuesta: Response | Error) {
  const fetchSimulado = vi.fn(async () => {
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  vi.stubGlobal('fetch', fetchSimulado);
  return fetchSimulado;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente HTTP', () => {
  it('envía la cookie de sesión y pide JSON bajo el prefijo /api', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { ok: true }));

    await solicitar('/auth/yo');

    expect(fetchSimulado).toHaveBeenCalledWith('/api/auth/yo', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
    const [, opciones] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(opciones.headers).get('Accept')).toBe('application/json');
  });

  it('serializa el cuerpo como JSON y devuelve la respuesta', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, { id: 'abc' }));

    const resultado = await solicitar<{ id: string }>('/ejercicios', { method: 'POST', cuerpo: { nombre: 'Press' } });

    expect(resultado).toEqual({ id: 'abc' });
    const [, opciones] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit];
    expect(opciones.method).toBe('POST');
    expect(opciones.body).toBe(JSON.stringify({ nombre: 'Press' }));
    expect(new Headers(opciones.headers).get('Content-Type')).toBe('application/json');
  });

  it('devuelve undefined en respuestas 204 sin cuerpo', async () => {
    simularFetch(new Response(null, { status: 204 }));

    await expect(solicitar('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('convierte el formato de error del contrato en ErrorApi con campos', async () => {
    simularFetch(respuestaJson(400, {
      codigo: 'VALIDACION',
      mensaje: 'Revisa los campos marcados.',
      campos: { repeticiones: 'Debe ser un número entero entre 1 y 100.' },
      actual: null,
    }));

    const error = await solicitar('/series', { method: 'POST', cuerpo: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      status: 400,
      codigo: 'VALIDACION',
      mensaje: 'Revisa los campos marcados.',
      campos: { repeticiones: 'Debe ser un número entero entre 1 y 100.' },
      actual: null,
    });
  });

  it('conserva el recurso actual de un conflicto 409', async () => {
    simularFetch(respuestaJson(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'La versión del recurso ha cambiado.', campos: null, actual: { version: 4 } }));

    const error = await solicitar('/x', { method: 'PATCH', cuerpo: {} }).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, codigo: 'CONFLICTO_VERSION', actual: { version: 4 } });
  });

  it('usa un error genérico en español si la respuesta de error no sigue el contrato', async () => {
    simularFetch(new Response('Bad Gateway', { status: 502 }));

    const error = await solicitar('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 502, codigo: 'ERROR_HTTP', mensaje: 'No se pudo completar la solicitud.', campos: null, actual: null });
  });

  it('distingue la falta de conexión con ErrorRed', async () => {
    simularFetch(new TypeError('Failed to fetch'));

    const error = await solicitar('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorRed);
    expect((error as ErrorRed).message).toBe('No hay conexión con el servidor.');
  });
});
