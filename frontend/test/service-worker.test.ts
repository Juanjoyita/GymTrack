import { describe, expect, it, vi } from 'vitest';
import { cachesObsoletas, decidir, nombreCache, opcionesBusqueda, rutasPrecache } from '../src/sw/estrategia';
import { manifiestoServiceWorker } from '../src/sw/manifiesto';
import { crearRegistroServiceWorker } from '../src/registrar-sw';

// T026A: service worker mínimo (R-08). Solo el shell versionado; nunca API ni datos personales.

const ORIGEN = 'https://localhost:5173';
const archivos = new Set(['/assets/index-abc123.js', '/assets/index-def456.css', '/assets/barlow-condensed-latin-800-italic-x1.woff2']);
const peticion = (ruta: string, extra: Partial<{ method: string; mode: string; origen: string }> = {}) =>
  ({ method: extra.method ?? 'GET', mode: extra.mode ?? 'cors', url: `${extra.origen ?? ORIGEN}${ruta}` });

describe('T026A: qué intercepta el service worker', () => {
  it('sirve desde caché los archivos versionados del shell', () => {
    for (const ruta of archivos) expect(decidir(peticion(ruta), ORIGEN, archivos)).toBe('cache');
  });

  it('al navegar o recargar usa la red y, sin red, el index.html guardado', () => {
    expect(decidir(peticion('/historial', { mode: 'navigate' }), ORIGEN, archivos)).toBe('navegacion');
    expect(decidir(peticion('/', { mode: 'navigate' }), ORIGEN, archivos)).toBe('navegacion');
  });

  it.each([
    ['la API', peticion('/api/auth/yo')],
    ['la API aunque sea navegación', peticion('/api/entrenamientos/en-curso', { mode: 'navigate' })],
    ['escrituras', peticion('/assets/index-abc123.js', { method: 'POST' })],
    ['otros orígenes', peticion('/assets/index-abc123.js', { origen: 'https://cdn.example.com' })],
    ['archivos fuera del manifiesto', peticion('/assets/otro.js')],
  ])('no toca %s: van a la red sin guardarse', (_caso, p) => {
    expect(decidir(p, ORIGEN, archivos)).toBe('ignorar');
  });
});

describe('T026A: caché versionada', () => {
  it('precachea index.html (como /) y los archivos del build, sin mapas ni el propio worker', () => {
    const manifiesto = manifiestoServiceWorker(['index.html', 'assets/index-abc123.js', 'assets/index-abc123.js.map', 'assets/index-def456.css', 'sw.js']);
    expect(manifiesto.archivos).toEqual(['/assets/index-abc123.js', '/assets/index-def456.css']);
    expect(rutasPrecache(manifiesto)).toEqual(['/', '/assets/index-abc123.js', '/assets/index-def456.css']);
    expect(manifiesto.version).toMatch(/^[0-9a-z]+$/);
  });

  it('busca en la caché ignorando Vary: los scripts módulo llevan Origin y la precarga no', () => {
    // Hallazgo de la verificación real: el servidor responde «Vary: Origin» y sin ignoreVary los
    // archivos precacheados no coinciden al recargar sin red (página en blanco).
    expect(opcionesBusqueda('v1')).toEqual({ cacheName: nombreCache('v1'), ignoreVary: true });
  });

  it('cambia de versión cuando cambia el build y borra solo las cachés antiguas de GymTrack', () => {
    const v1 = manifiestoServiceWorker(['index.html', 'assets/index-a.js']).version;
    const v2 = manifiestoServiceWorker(['index.html', 'assets/index-b.js']).version;
    expect(v1).not.toBe(v2);
    expect(manifiestoServiceWorker(['assets/index-a.js', 'index.html']).version).toBe(v1);
    expect(cachesObsoletas([nombreCache(v1), nombreCache(v2), 'otra-app'], nombreCache(v2))).toEqual([nombreCache(v1)]);
  });
});

describe('T026A: registro', () => {
  function navegadorFalso(controlado: boolean) {
    const oyentes: Record<string, () => void> = {};
    const sw = {
      controller: controlado ? {} : null,
      register: vi.fn(async () => ({})),
      addEventListener: vi.fn((tipo: string, fn: () => void) => { oyentes[tipo] = fn; }),
    };
    return { navegador: { serviceWorker: sw }, sw, tomarControl: () => { sw.controller = {}; oyentes.controllerchange?.(); } };
  }

  it('no registra nada fuera del build de producción', async () => {
    const { navegador, sw } = navegadorFalso(false);
    const registro = crearRegistroServiceWorker({ navegador, produccion: false });
    await registro.registrar();
    expect(sw.register).not.toHaveBeenCalled();
    expect(registro.disponibleSinConexion()).toBe(false);
  });

  it('no falla si el navegador no admite service workers', async () => {
    const registro = crearRegistroServiceWorker({ navegador: {}, produccion: true });
    await expect(registro.registrar()).resolves.toBeUndefined();
    expect(registro.disponibleSinConexion()).toBe(false);
  });

  it('registra /sw.js y solo indica disponibilidad sin conexión cuando el worker controla la página', async () => {
    const { navegador, sw, tomarControl } = navegadorFalso(false);
    const registro = crearRegistroServiceWorker({ navegador, produccion: true });
    const aviso = vi.fn();
    registro.suscribir(aviso);
    await registro.registrar();
    expect(sw.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(registro.disponibleSinConexion()).toBe(false);
    tomarControl();
    expect(registro.disponibleSinConexion()).toBe(true);
    expect(aviso).toHaveBeenCalled();
  });

  it('si la página ya está controlada (recarga) está disponible desde el inicio', async () => {
    const { navegador } = navegadorFalso(true);
    const registro = crearRegistroServiceWorker({ navegador, produccion: true });
    await registro.registrar();
    expect(registro.disponibleSinConexion()).toBe(true);
  });

  it('un fallo al registrar no rompe la aplicación', async () => {
    const { navegador, sw } = navegadorFalso(false);
    sw.register.mockRejectedValueOnce(new Error('fallo'));
    const registro = crearRegistroServiceWorker({ navegador, produccion: true });
    await expect(registro.registrar()).resolves.toBeUndefined();
    expect(registro.disponibleSinConexion()).toBe(false);
  });
});
