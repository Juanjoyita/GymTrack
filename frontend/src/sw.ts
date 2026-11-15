import { cachesObsoletas, decidir, nombreCache, opcionesBusqueda, rutasPrecache, type Manifiesto } from './sw/estrategia';

// Service worker mínimo de GymTrack (T026A, R-08): precachea el shell versionado para poder
// navegar y recargar sin red. Sin Background Sync: la sincronización la hace la cola de la app.

interface EventoExtensible extends Event { waitUntil(promesa: Promise<unknown>): void }
interface EventoPeticion extends EventoExtensible { request: Request; respondWith(respuesta: Promise<Response>): void }
interface AmbitoServiceWorker {
  __GYMTRACK_MANIFIESTO: Manifiesto;
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(tipo: 'install' | 'activate', oyente: (evento: EventoExtensible) => void): void;
  addEventListener(tipo: 'fetch', oyente: (evento: EventoPeticion) => void): void;
}

// El build antepone la lista de archivos a este script (plugin en vite.config.ts).
const sw = self as unknown as AmbitoServiceWorker;
const manifiesto = sw.__GYMTRACK_MANIFIESTO;
const cache = nombreCache(manifiesto.version);
const archivos = new Set(manifiesto.archivos);
const busqueda = opcionesBusqueda(manifiesto.version);

sw.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(cache).then((c) => c.addAll(rutasPrecache(manifiesto))).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (evento) => {
  evento.waitUntil(caches.keys()
    .then((nombres) => Promise.all(cachesObsoletas(nombres, cache).map((n) => caches.delete(n))))
    .then(() => sw.clients.claim()));
});

sw.addEventListener('fetch', (evento) => {
  const decision = decidir(evento.request, sw.location.origin, archivos);
  if (decision === 'cache') {
    evento.respondWith(caches.match(evento.request, busqueda).then((guardada) => guardada ?? fetch(evento.request)));
  } else if (decision === 'navegacion') {
    // Red primero para recibir versiones nuevas; sin red, el documento guardado.
    evento.respondWith(fetch(evento.request).catch(async () => (await caches.match('/', busqueda)) ?? Response.error()));
  }
});
