import type { Manifiesto } from './estrategia';

/**
 * Lista de archivos del build que el service worker precachea, con una versión derivada de sus
 * nombres (que ya llevan hash): cualquier cambio del build crea una caché nueva.
 * index.html se precachea aparte como «/».
 */
export function manifiestoServiceWorker(nombres: string[]): Manifiesto {
  const archivos = nombres
    .filter((n) => n !== 'index.html' && n !== 'sw.js' && !n.endsWith('.map'))
    .map((n) => `/${n}`)
    .sort();
  let hash = 0;
  for (const caracter of [...nombres].sort().join('|')) hash = (Math.imul(hash, 31) + caracter.charCodeAt(0)) | 0;
  return { version: (hash >>> 0).toString(36), archivos };
}
