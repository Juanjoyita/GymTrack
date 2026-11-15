# Verificación de T026A — Carga offline del shell

Fecha: 2026-11-14. Solo T026A (I3). Depende de T026 (`9e6e594`). No incluye la copia local del entrenamiento en curso ni las series (T027).

## Alcance

tasks.md exige un service worker mínimo que:
- precachee HTML, JS y CSS versionados tras la primera carga online;
- controle la página antes de indicar que está disponible sin conexión;
- permita navegar y recargar sin red;
- excluya de Cache Storage la API, las credenciales y las respuestas personales;
- funcione sin Background Sync ni librerías de sincronización;
- se pruebe en E2E con el build de producción y el worker activo.

Referencias: research R-08 (precisión del 2026-11-12) y plan (`sw.ts`, `registrar-sw.ts`).

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/sw/estrategia.ts` | Reglas como funciones puras: qué se sirve desde caché, navegación con red primero y respaldo del documento guardado, exclusión de `/api`, de escrituras y de otros orígenes, búsqueda ignorando `Vary` y limpieza de cachés antiguas solo de GymTrack |
| `frontend/src/sw/manifiesto.ts` | Lista de archivos del build (sin `.map` ni `sw.js`) y versión derivada de sus nombres con hash |
| `frontend/src/sw.ts` | Service worker: `install` (precarga y `skipWaiting`), `activate` (borra versiones antiguas y `clients.claim`) y `fetch` |
| `frontend/src/registrar-sw.ts` | Registro de `/sw.js` **solo en producción**. «Disponible sin conexión» solo cuando el worker **controla** la página (`controller` y `controllerchange`). Un fallo al registrar no rompe la app |
| `frontend/vite.config.ts` | Build con entrada `sw` compilada como `/sw.js`, más un plugin propio sin dependencias que antepone la lista de archivos y exige que `sw.js` no importe otros módulos |
| `frontend/src/app/sesion.tsx` | **Sesión sin red:** guarda la última sesión válida (id, email, unidad y zona; **nunca** contraseña ni token) y la usa solo ante un error de red. Se olvida con el cierre de sesión, un 401 o la caducidad. La comprobación ya no se reintenta con esperas: sin red usa la sesión recordada o muestra «Reintentar» al instante |
| `frontend/src/main.tsx`, `frontend/src/app/Layout.tsx`, `frontend/src/textos/es.ts` | Registro al arrancar e indicador «Disponible sin conexión» en la cabecera |
| `frontend/test/service-worker.test.ts` | 13 pruebas |
| `frontend/test/sesion-sin-red.test.tsx` | 5 pruebas |

Sin la sesión recordada, el shell cargaría desde la caché pero quedaría bloqueado en «No hay conexión» porque no podría comprobarse la sesión. Por eso esta parte se incluye en T026A.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | Rojo: no existían los módulos del worker ni la sesión recordada. 4 rojos en la sesión sin red (no se guardaba, no se usaba y avisaba tarde por los reintentos) |
| Hallazgo de la verificación real (abajo) | 1 prueba nueva en rojo antes de corregir |
| Final | **107/107 verdes** en el frontend |

## Build

`dist/sw.js` ocupa 1,2 kB y es un script autónomo, sin `import` ni `export`. Su manifiesto contiene exactamente los 4 archivos versionados del build (JS, CSS y las 2 fuentes), todos presentes en `dist/`. La caché se llama `gymtrack-shell-<versión>`. La cadena `/api` solo aparece en la regla de exclusión.

## Navegador real (build de producción con `vite preview` por HTTPS, API y PostgreSQL reales, 360 px)

| Paso | Resultado |
|---|---|
| Registro online | El worker toma el control y aparece «Disponible sin conexión» |
| Cache Storage | `gymtrack-shell-<v>` con `/` y los 4 archivos; **0 entradas de `/api`** |
| **Sin red:** recargar | Se muestra Entrenar (sesión recordada) |
| **Sin red:** navegar a Progreso y abrir `/cuenta` | Funcionan; Cuenta muestra el email recordado |
| axe WCAG 2.1 A/AA sin red | 0 violaciones |
| Vuelve la red | La app sigue funcionando |

**Hallazgo corregido.** La primera recarga sin red mostraba una página en blanco. El servidor responde `Vary: Origin`, los scripts módulo de Vite se piden con `Origin` y la precarga no, así que la caché no los encontraba. Ahora la búsqueda usa `ignoreVary: true`, que es seguro porque los archivos llevan hash y son estáticos. Hay una prueba que lo documenta.

Las cuentas `t026a.*@example.invalid` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 107/107 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Notas para T027–T029

- **Sin red, Entrenar muestra «No hay conexión» tras la carga inicial.** Mostrar el entrenamiento en curso sin red necesita su copia local (data-model «Estado local del cliente»), que es parte de T027.
- **E2E con el worker (T028A/T029, I4).** `npm run build --workspace @gymtrack/frontend` seguido de `vite preview` sirve el build de producción por HTTPS con el mismo proxy `/api` que el modo dev. En `npm run dev` no se registra el worker.
