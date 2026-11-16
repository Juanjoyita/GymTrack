# Aceptación P1 de US1

## Estado

- **T028A: completada.**
- **T029: no aprobada.** La reapertura offline tras reiniciar Chrome no llega a controlar la página con el service worker; ese escenario quedó fallido y bloquea la aceptación V5. No se hizo commit.

## Entorno y medición

Medición reproducible de build de producción servido por HTTPS, con Chrome estable y perfil móvil constitucional:

- Node.js 22.23.3 (`fnm`), Chrome 157.0.8103.51.
- Viewport 360 × 800, CPU 4×, descarga 10 Mbps, subida 5 Mbps y latencia 100 ms.
- Lighthouse, cinco arranques independientes: primera carga interactiva **1035.6, 962.7, 1048.1, 1067.7 y 973.2 ms**.
- Resultado: **5/5** bajo el umbral de 3000 ms.
- Respuesta visual local al confirmar una serie: **8.7 ms**, bajo el umbral de 100 ms; la medición no espera la API.

## V1–V7

| Escenario | Resultado y evidencia |
|---|---|
| V1 — Registro, sesión y aislamiento | Los seis E2E de autenticación pasaron: alta con cookie segura, inicio/cierre de sesión, sesión en otro contexto, credenciales incorrectas y rechazo sin sesión. Las suites backend también pasaron. |
| V2 — Entrenamiento completo | Pasó: resumen exacto de dos ejercicios, cinco series y volumen; flujo E2E de **1335 ms**. El test compara todas las filas de series contra los valores fixture en PostgreSQL, incluyendo orden, repeticiones, peso, notas y zona horaria. |
| V3 — Prellenado | Pasó: se conserva la sesión anterior al cerrar sesión y volver a iniciar. |
| V4 — Validaciones | Pasaron la validación de interfaz y los límites API/BD; los casos aceptados son los únicos persistidos. |
| V5 — Sin conexión y recarga | Pasó el caso de cortes, recarga/reapertura de pestaña, sincronización y conteo exacto de **3 series** en BD, sin duplicados. **Falló** la variante que cierra y vuelve a abrir Chrome: no se obtiene `navigator.serviceWorker.controller` dentro del plazo, por lo que no se pudo completar esa rama offline ni certificar el total esperado de cuatro series. |
| V6 — Conflictos | Pasaron los cuatro casos: series de dos dispositivos, edición online, eliminación online y eliminación offline al reconectar. |
| V7 — Entrenamiento olvidado/vacío | Pasaron los casos de entrenamiento inactivo y entrenamiento vacío. |

## Accesibilidad, aislamiento y persistencia

- El test de accesibilidad pasó axe y las comprobaciones automatizadas de teclado, foco, nombres accesibles y objetivos táctiles.
- No se ejecutó una prueba con lector de pantalla real; por ello no se declara completa la revisión manual de lectores.
- Las pruebas usan cuentas fixture únicas, verifican persistencia directamente en PostgreSQL y limpian las cuentas al terminar. Las comprobaciones de aislamiento/autorización del conjunto backend también pasaron.
- En el diagnóstico de Chrome persistente, el registro llegó a `redundant` o no quedó activo. Se observaron errores de Cache Storage (`InvalidAccessError: Entry already exists`; en un perfil limpio, `CacheStorage.open` devolvió un error interno). La causa raíz no quedó aislada y no se cambió el service worker de producción.

## Verificación ejecutada

- E2E P1 (`auth`, `registro`, `offline`, `conflicto`): **19/20**; único fallo, reapertura offline tras reiniciar Chrome.
- Backend: **14/14 suites, 143/143 tests**.
- Frontend: **12/12 archivos, 144/144 tests**.
- Dominio: **6/6 archivos, 35/35 tests** (ejecutado en Node 22).
- `npm run typecheck`: pasó.
- `npm run lint`: pasó.
- `npm run perf`: pasó; 5/5 cargas y respuesta visual local dentro de los umbrales.

La suite de infraestructura quedó fuera del alcance de T028A/T029. No se aprueba T029 mientras falle la rama de reinicio de Chrome y no se valide con lector de pantalla.
