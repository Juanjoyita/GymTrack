# Verificación de T026 — Cola duradera de sincronización

Fecha: 2026-11-14. Solo T026 (I3). Depende de T025 (`675a20a`). No incluye el service worker (T026A), el indicador «N pendientes» ni la pantalla de conflictos con «Repetir» y «Descartar» (T027 y T028).

## Alcance

tasks.md exige, para la cola:
- persistir antes de confirmar visualmente;
- reintentos por UUID;
- orden de dependencias;
- vaciado solo tras confirmación;
- separación por usuario sin credenciales;
- resolución explícita de `409`/`404` sin sobrescritura silenciosa.

Las reglas exactas vienen de research R-08 y R-09, y de data-model «Estado local del cliente».

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/sincronizacion/cola.ts` | Cola persistida en `localStorage` bajo `gymtrack:cola:<usuarioId>`, lista de conflictos, «repetir» con la versión vigente (cuerpo y `?version=`), «descartar» y suscripción |
| `frontend/src/sincronizacion/sincronizador.ts` | Envío en orden y de uno en uno; arranca al iniciar, con `online`, al encolar y cada 10 s mientras haya pendientes |
| `frontend/src/sincronizacion/contexto.tsx` | Proveedor por usuario dentro de `RutaPrivada`; se detiene con la limpieza de sesión de T024 y expone `usePendientes` y `useConflictos` |
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` | «Añadir ejercicio» se encola. Los ejercicios en cola se muestran al instante con «Pendiente de sincronizar» y se avisa si hay conflictos |
| `frontend/src/app/RutaProtegida.tsx`, `frontend/src/api/entrenamientos.ts`, `frontend/src/textos/es.ts` | Proveedor, clave de la consulta del entrenamiento en curso y textos |
| `frontend/test/sincronizacion.test.ts` | 19 pruebas unitarias |
| `frontend/test/entrenar-sincronizacion.test.tsx` | 2 pruebas de la página |
| `frontend/test/{catalogo,selector}.test.tsx` (I3) | `localStorage.clear()` antes de cada caso para aislar la cola entre pruebas |

## Reglas de la cola

| Respuesta | Comportamiento |
|---|---|
| 2xx | Se retira de la cola; la respuesta se incorpora a los datos |
| Sin red, 5xx, 429 o 401 | Se detiene y la conserva. El reintento repite el mismo método, ruta y cuerpo (mismo UUID): idempotente |
| 409 `CONFLICTO_VERSION` | Pasa a conflicto con `actual`; no se reintenta y se sigue con la siguiente |
| 404 | Pasa a conflicto `ELIMINADO` (recurso conocido eliminado en otro dispositivo) |
| 400 | Pasa a conflicto `VALIDACION`, sin bucle de reintentos |
| Otro 409/4xx | Pasa a conflicto `RECHAZADA` |
| Operación que depende de otra en conflicto | No se envía: conflicto `DEPENDENCIA` |

Al cerrar sesión, la cola **no se borra**, porque se perderían series (SC-004): queda guardada bajo el id de su dueño y solo se reanuda con él. Nunca se guardan contraseñas, tokens ni la cookie.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | `sincronizacion.test.ts` en rojo (no existía el módulo). En la página, 2 rojos: sin red el ejercicio desaparecía y la cola no existía |
| Final | **87/87 verdes** en el frontend, estables en 3 ejecuciones seguidas |

Durante la implementación aparecieron dos problemas:
- **Recarga innecesaria tras confirmar.** Volvía a pedir el entrenamiento después de cada confirmación. Ahora se incorpora la respuesta del POST.
- **Carrera al recargar.** La confirmación podía llegar antes que la primera carga del entrenamiento, que traía datos viejos. Sin datos previos, TanStack Query reutiliza la carga en vuelo en lugar de cancelarla, así que se cancela explícitamente y se pide de nuevo. La prueba de recarga sin red cubre este caso.

## Navegador real (Chromium, API y PostgreSQL reales, 360 px)

La red se bloqueó solo para `POST /entrenamientos/*/ejercicios`:

| Paso | Resultado |
|---|---|
| Añadir «Sentadilla» | Aparece al instante con «Pendiente de sincronizar»; 1 operación en `gymtrack:cola:<id>` |
| **Recargar** sin red | Sigue pendiente; la cola conserva 1 operación |
| Restablecer la red y emitir `online` | Confirmada: la cola queda vacía y el servidor tiene **una sola** «Sentadilla» tras 3 intentos fallidos (idempotencia por UUID) |
| `localStorage` | Sin contraseñas, tokens ni `gt_sesion` |
| axe WCAG 2.1 A/AA en el estado pendiente | 0 violaciones |

La cuenta `t026.demo.*@example.invalid` se borró de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 87/87 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | 119 kB gzip |

## Pendiente para las siguientes tareas

- **T026A:** cargar el shell sin red tras recargar. Hoy la recarga sin red funciona si la página se sirve; sin conexión al servidor no carga.
- **T027:** encolar series, notas, edición y borrado con deshacer, y el contador «N pendientes».
- **T028:** pantalla de conflictos con la versión vigente y «Repetir mi cambio» / «Descartar mi cambio» (`cola.repetir` y `cola.descartar` ya existen).
