// Decisiones del service worker como funciones puras (R-08): solo el shell versionado se guarda en
// Cache Storage. La API, las escrituras, otros orígenes y cualquier respuesta personal van a la red.

export interface Manifiesto { version: string; archivos: string[] }

export type Decision = 'cache' | 'navegacion' | 'ignorar';

const PREFIJO_CACHE = 'gymtrack-shell-';

export const nombreCache = (version: string) => `${PREFIJO_CACHE}${version}`;

/**
 * Los archivos llevan hash y son estáticos, así que se ignora Vary: el servidor responde «Vary: Origin»
 * y los scripts módulo se piden con Origin mientras que la precarga no, lo que impediría encontrarlos.
 */
export const opcionesBusqueda = (version: string) => ({ cacheName: nombreCache(version), ignoreVary: true });

/** El documento se guarda como «/» para servirlo en cualquier ruta de la aplicación sin red. */
export const rutasPrecache = (manifiesto: Manifiesto) => ['/', ...manifiesto.archivos];

export function decidir(peticion: { method: string; mode: string; url: string }, origen: string, archivos: Set<string>): Decision {
  const url = new URL(peticion.url);
  if (peticion.method !== 'GET' || url.origin !== origen || url.pathname.startsWith('/api/') || url.pathname === '/api') return 'ignorar';
  if (peticion.mode === 'navigate') return 'navegacion';
  return archivos.has(url.pathname) ? 'cache' : 'ignorar';
}

/** Cachés de versiones anteriores de GymTrack; nunca toca las de otras aplicaciones. */
export const cachesObsoletas = (nombres: string[], actual: string) => nombres.filter((n) => n.startsWith(PREFIJO_CACHE) && n !== actual);
