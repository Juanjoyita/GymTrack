import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, ErrorRed } from '../src/api/cliente';
import { crearCola, type Almacen, type NuevaOperacion } from '../src/sincronizacion/cola';
import { crearSincronizador, type Enviar } from '../src/sincronizacion/sincronizador';

// T026: cola duradera (R-08) y resolución de conflictos (R-09). Almacenamiento en memoria con la
// misma interfaz que localStorage para observar exactamente qué y cuándo se persiste.

function almacenEnMemoria(): Almacen & { datos: Map<string, string>; escrituras: number } {
  const datos = new Map<string, string>();
  return {
    datos, escrituras: 0,
    getItem: (k) => datos.get(k) ?? null,
    setItem(k, v) { this.escrituras++; datos.set(k, v); },
    removeItem: (k) => { datos.delete(k); },
  };
}

const ANA = '00000000-0000-4000-8000-0000000000a1';
const BETO = '00000000-0000-4000-8000-0000000000b2';
const ER = '30000000-0000-4000-8000-000000000001';
const SERIE = '40000000-0000-4000-8000-000000000001';

const crearRealizado = (): NuevaOperacion => ({
  metodo: 'POST', ruta: '/entrenamientos/e1/ejercicios', cuerpo: { id: ER, ejercicioId: 'x', posicion: 1 }, recurso: ER,
});
const crearSerie = (): NuevaOperacion => ({
  metodo: 'POST', ruta: `/entrenamientos/e1/ejercicios/${ER}/series`, cuerpo: { id: SERIE, orden: 1, repeticiones: 8 }, recurso: SERIE, dependeDe: [ER],
});
const editarSerie = (version = 1): NuevaOperacion => ({
  metodo: 'PATCH', ruta: `/entrenamientos/e1/ejercicios/${ER}/series/${SERIE}`, cuerpo: { repeticiones: 10, version }, recurso: SERIE, version,
});

const errorApi = (status: number, codigo: string, actual: unknown = null) => new ErrorApi(status, { codigo, mensaje: codigo, campos: null, actual });

describe('T026: cola duradera', () => {
  it('persiste la operación antes de devolver el control, para que la interfaz confirme después', () => {
    const almacen = almacenEnMemoria();
    const cola = crearCola(ANA, almacen);
    const antes = almacen.escrituras;
    const op = cola.encolar(crearRealizado());
    expect(almacen.escrituras).toBe(antes + 1);
    expect(JSON.parse(almacen.getItem(`gymtrack:cola:${ANA}`) ?? '{}').pendientes[0]).toMatchObject({ id: op.id, metodo: 'POST', recurso: ER });
  });

  it('conserva las operaciones en orden tras recargar (otra instancia sobre el mismo almacén)', () => {
    const almacen = almacenEnMemoria();
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    cola.encolar(crearSerie());
    const recargada = crearCola(ANA, almacen);
    expect(recargada.pendientes().map((o) => o.recurso)).toEqual([ER, SERIE]);
    expect(recargada.pendientes()[0].creadaEn).toEqual(expect.any(String));
  });

  it('separa la cola por usuario y no guarda credenciales', () => {
    const almacen = almacenEnMemoria();
    crearCola(ANA, almacen).encolar(crearRealizado());
    expect(crearCola(BETO, almacen).pendientes()).toEqual([]);
    const todo = [...almacen.datos.entries()].flat().join(' ');
    expect(todo).not.toMatch(/contrasena|password|token|gt_sesion/i);
  });

  it('arranca vacía si el contenido guardado está dañado', () => {
    const almacen = almacenEnMemoria();
    almacen.setItem(`gymtrack:cola:${ANA}`, '{no es json');
    expect(() => crearCola(ANA, almacen)).not.toThrow();
    expect(crearCola(ANA, almacen).pendientes()).toEqual([]);
  });

  it('avisa a los suscriptores cuando cambia', () => {
    const cola = crearCola(ANA, almacenEnMemoria());
    const aviso = vi.fn();
    const quitar = cola.suscribir(aviso);
    cola.encolar(crearRealizado());
    expect(aviso).toHaveBeenCalledTimes(1);
    quitar();
    cola.encolar(crearSerie());
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe('T026: sincronizador', () => {
  let almacen: ReturnType<typeof almacenEnMemoria>;
  beforeEach(() => { almacen = almacenEnMemoria(); });

  it('envía en orden, de una en una, y vacía cada operación solo tras la confirmación', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    cola.encolar(crearSerie());
    const enviadas: string[] = [];
    let soltar: () => void = () => {};
    const enviar: Enviar = vi.fn((ruta) => {
      enviadas.push(ruta);
      return enviadas.length === 1 ? new Promise((r) => { soltar = () => r({ id: ER }); }) : Promise.resolve({ id: SERIE });
    });
    const confirmadas: unknown[] = [];
    const sincronizacion = crearSincronizador(cola, enviar, { alConfirmar: (op, respuesta) => confirmadas.push([op.recurso, respuesta]) }).sincronizar();
    await Promise.resolve();
    expect(enviadas).toHaveLength(1);
    expect(cola.pendientes()).toHaveLength(2);
    soltar();
    await sincronizacion;
    expect(enviadas).toEqual(['/entrenamientos/e1/ejercicios', `/entrenamientos/e1/ejercicios/${ER}/series`]);
    expect(cola.pendientes()).toEqual([]);
    expect(confirmadas).toEqual([[ER, { id: ER }], [SERIE, { id: SERIE }]]);
  });

  it.each([
    ['sin red', new ErrorRed()],
    ['error del servidor', errorApi(503, 'ERROR_INTERNO')],
    ['demasiadas peticiones', errorApi(429, 'DEMASIADAS_PETICIONES')],
  ])('%s: conserva la cola, se detiene y reintenta con el mismo UUID y cuerpo', async (_caso, fallo) => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    cola.encolar(crearSerie());
    const enviar = vi.fn<Enviar>().mockRejectedValueOnce(fallo).mockResolvedValue({});
    const sincronizador = crearSincronizador(cola, enviar);
    await sincronizador.sincronizar();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(crearCola(ANA, almacen).pendientes()).toHaveLength(2);
    await sincronizador.sincronizar();
    expect(enviar.mock.calls[1]).toEqual(enviar.mock.calls[0]);
    expect(enviar.mock.calls[1][1]).toMatchObject({ method: 'POST', cuerpo: { id: ER } });
    expect(cola.pendientes()).toEqual([]);
  });

  it('401: se detiene sin perder la cola (se reanuda al volver a iniciar sesión)', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    const enviar = vi.fn<Enviar>().mockRejectedValue(errorApi(401, 'NO_AUTENTICADO'));
    await crearSincronizador(cola, enviar).sincronizar();
    expect(crearCola(ANA, almacen).pendientes()).toHaveLength(1);
    expect(cola.conflictos()).toEqual([]);
  });

  it('409: pasa a conflictos con la versión vigente, no la reintenta y sigue con la siguiente', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(editarSerie(1));
    cola.encolar({ ...crearRealizado(), recurso: 'otro', cuerpo: { id: 'otro' } });
    const vigente = { id: SERIE, repeticiones: 12, version: 3 };
    const enviar = vi.fn<Enviar>().mockRejectedValueOnce(errorApi(409, 'CONFLICTO_VERSION', vigente)).mockResolvedValue({});
    const alConflicto = vi.fn();
    await crearSincronizador(cola, enviar, { alConflicto }).sincronizar();
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(cola.pendientes()).toEqual([]);
    expect(cola.conflictos()).toEqual([expect.objectContaining({ motivo: 'CONFLICTO_VERSION', actual: vigente, operacion: expect.objectContaining({ recurso: SERIE }) })]);
    expect(alConflicto).toHaveBeenCalledTimes(1);
    await crearSincronizador(cola, enviar).sincronizar();
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('404 al editar o eliminar un recurso conocido: conflicto «eliminado en otro dispositivo»', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar({ metodo: 'DELETE', ruta: `/entrenamientos/e1/ejercicios/${ER}/series/${SERIE}?version=1`, recurso: SERIE, version: 1 });
    await crearSincronizador(cola, vi.fn<Enviar>().mockRejectedValue(errorApi(404, 'NO_ENCONTRADO'))).sincronizar();
    expect(cola.conflictos()).toEqual([expect.objectContaining({ motivo: 'ELIMINADO', actual: null })]);
  });

  it('400: no reintenta indefinidamente; queda como conflicto que el usuario resuelve', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    await crearSincronizador(cola, vi.fn<Enviar>().mockRejectedValue(errorApi(400, 'VALIDACION'))).sincronizar();
    expect(cola.pendientes()).toEqual([]);
    expect(cola.conflictos()).toEqual([expect.objectContaining({ motivo: 'VALIDACION' })]);
  });

  it('no envía operaciones que dependen de una en conflicto', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    cola.encolar(crearSerie());
    const enviar = vi.fn<Enviar>().mockRejectedValueOnce(errorApi(404, 'NO_ENCONTRADO')).mockResolvedValue({});
    await crearSincronizador(cola, enviar).sincronizar();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(cola.pendientes()).toEqual([]);
    expect(cola.conflictos().map((c) => [c.operacion.recurso, c.motivo])).toEqual([[ER, 'ELIMINADO'], [SERIE, 'DEPENDENCIA']]);
  });

  it('«Repetir mi cambio» encola una operación nueva con la versión vigente; «Descartar» no envía nada', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(editarSerie(1));
    await crearSincronizador(cola, vi.fn<Enviar>().mockRejectedValue(errorApi(409, 'CONFLICTO_VERSION', { id: SERIE, version: 3 }))).sincronizar();
    const [conflicto] = cola.conflictos();
    const nueva = cola.repetir(conflicto.id);
    expect(nueva).toMatchObject({ version: 3, cuerpo: { repeticiones: 10, version: 3 } });
    expect(nueva.id).not.toBe(conflicto.operacion.id);
    expect(cola.conflictos()).toEqual([]);
    expect(cola.pendientes()).toEqual([nueva]);

    cola.encolar(editarSerie(3));
    await crearSincronizador(cola, vi.fn<Enviar>().mockRejectedValue(errorApi(409, 'CONFLICTO_VERSION', { id: SERIE, version: 4 }))).sincronizar();
    for (const c of cola.conflictos()) cola.descartar(c.id);
    expect(cola.conflictos()).toEqual([]);
    expect(crearCola(ANA, almacen).conflictos()).toEqual([]);
  });

  it('«Repetir» un DELETE actualiza el parámetro version de la ruta', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar({ metodo: 'DELETE', ruta: `/x/${SERIE}?version=1`, recurso: SERIE, version: 1 });
    await crearSincronizador(cola, vi.fn<Enviar>().mockRejectedValue(errorApi(409, 'CONFLICTO_VERSION', { id: SERIE, version: 2 }))).sincronizar();
    expect(cola.repetir(cola.conflictos()[0].id).ruta).toBe(`/x/${SERIE}?version=2`);
  });

  it('encadena versiones: al confirmar un cambio, los siguientes sobre el mismo recurso usan la versión nueva', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar({ metodo: 'PATCH', ruta: '/entrenamientos/e1', cuerpo: { nota: 'a', version: 1 }, recurso: 'e1', version: 1 });
    cola.encolar({ metodo: 'POST', ruta: '/entrenamientos/e1/finalizar', cuerpo: { version: 1 }, recurso: 'e1', version: 1 });
    cola.encolar({ metodo: 'DELETE', ruta: '/entrenamientos/e1?version=1', recurso: 'e1', version: 1 });
    cola.encolar({ metodo: 'PATCH', ruta: '/otro', cuerpo: { version: 1 }, recurso: 'otro', version: 1 });
    const enviar = vi.fn<Enviar>().mockResolvedValueOnce({ id: 'e1', version: 2 }).mockRejectedValue(new ErrorRed());
    await crearSincronizador(cola, enviar).sincronizar();
    expect(cola.pendientes().map((o) => [o.recurso, o.version, o.cuerpo, o.ruta])).toEqual([
      ['e1', 2, { version: 2 }, '/entrenamientos/e1/finalizar'],
      ['e1', 2, undefined, '/entrenamientos/e1?version=2'],
      ['otro', 1, { version: 1 }, '/otro'],
    ]);
    expect(crearCola(ANA, almacen).pendientes()[0].version).toBe(2);
  });

  it('incorpora la respuesta antes de retirar la operación: el dato nunca desaparece de la vista', async () => {
    // Hallazgo real: si se retiraba primero, durante un instante el ejercicio no estaba ni pendiente
    // ni en los datos, la tarjeta se volvía a montar y se perdía lo que el usuario estaba tecleando.
    const cola = crearCola(ANA, almacen);
    const op = cola.encolar(crearRealizado());
    const vistoAlConfirmar: string[] = [];
    await crearSincronizador(cola, vi.fn<Enviar>().mockResolvedValue({ id: ER }), {
      alConfirmar: () => { vistoAlConfirmar.push(...cola.pendientes().map((o) => o.id)); },
    }).sincronizar();
    expect(vistoAlConfirmar).toEqual([op.id]);
    expect(cola.pendientes()).toEqual([]);
  });

  it('no ejecuta dos sincronizaciones a la vez', async () => {
    const cola = crearCola(ANA, almacen);
    cola.encolar(crearRealizado());
    let soltar: () => void = () => {};
    const enviar = vi.fn<Enviar>(() => new Promise((r) => { soltar = () => r({}); }));
    const sincronizador = crearSincronizador(cola, enviar);
    const primera = sincronizador.sincronizar();
    const segunda = sincronizador.sincronizar();
    soltar();
    await Promise.all([primera, segunda]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  describe('activación automática', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('sincroniza al iniciar, al recuperar la conexión y cada 10 s mientras queden pendientes', async () => {
      const cola = crearCola(ANA, almacen);
      cola.encolar(crearRealizado());
      const enviar = vi.fn<Enviar>().mockRejectedValue(new ErrorRed());
      const sincronizador = crearSincronizador(cola, enviar);
      sincronizador.iniciar();
      await vi.advanceTimersByTimeAsync(0);
      expect(enviar).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(enviar).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enviar).toHaveBeenCalledTimes(3);
      sincronizador.detener();
      await vi.advanceTimersByTimeAsync(30_000);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enviar).toHaveBeenCalledTimes(3);
    });

    it('encolar dispara una sincronización inmediata si está iniciado', async () => {
      const cola = crearCola(ANA, almacen);
      const enviar = vi.fn<Enviar>().mockResolvedValue({});
      const sincronizador = crearSincronizador(cola, enviar);
      sincronizador.iniciar();
      await vi.advanceTimersByTimeAsync(0);
      cola.encolar(crearRealizado());
      await vi.advanceTimersByTimeAsync(0);
      expect(enviar).toHaveBeenCalledTimes(1);
      expect(cola.pendientes()).toEqual([]);
      sincronizador.detener();
    });
  });
});
