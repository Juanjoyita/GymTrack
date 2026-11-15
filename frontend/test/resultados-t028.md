# Verificación de T028 — Conectar P1, errores y conflictos

Fecha: 2026-11-14. Solo T028 (I3), última tarea del bloque T024–T028. Depende de T027 (`1f8dff7`).

## Alcance

tasks.md pide:
- el flujo real de extremo a extremo;
- registrar un entrenamiento con **fecha pasada**;
- que **finalizar y volver a entrar** conserven los datos;
- que un **conflicto muestre la versión vigente** y permita **repetir o descartar**.

Requisitos: FR-014, FR-031, quickstart V6 y V7, research R-09 y R-12, contrato «Entrenamientos — P1».

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/paginas/entrenamiento/AvisoConflictos.tsx` | Un único `role="alert"` con cada conflicto: qué pasó, versión vigente frente a «tu cambio», y «Repetir mi cambio» o «Descartar mi cambio». Mensajes para serie cambiada o eliminada en otro dispositivo, nota, finalizar, ya en curso en otro dispositivo, dependencia y rechazo |
| `frontend/src/paginas/entrenamiento/RegistroPasado.tsx` | Fecha, hora de inicio y hora de fin, locales del dispositivo. Valida que estén completas, que no sean futuras y que el fin sea posterior al inicio |
| `frontend/src/paginas/entrenamiento/EntrenamientoPasado.tsx` | Entrenamiento creado ya finalizado (`POST /entrenamientos` con `inicio` y `fin`), con las mismas tarjetas para añadir ejercicios y series, «Listo» y resumen «Entrenamiento registrado» |
| `frontend/src/paginas/entrenamiento/ListaEjercicios.tsx`, `ResumenFinal.tsx` | Extraídos de `PaginaEntrenar` para compartirlos entre el entrenamiento en curso y el pasado |
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` | Modos (normal, registrar pasado, pasado, resumen y descartado), aviso de conflictos y, en el diálogo de inactividad, **«Descartar entrenamiento»** con confirmación (V7) |
| `frontend/src/paginas/entrenamiento/operaciones.ts` | `opRegistrarPasado`, `opDescartar`, `aplicarVigente` y `esDe`, que limita cada operación a su propio entrenamiento |
| `frontend/src/sincronizacion/{contexto.tsx,sincronizador.ts}` | Las confirmaciones y los conflictos se aplican a cada entrenamiento en caché que corresponda. La respuesta se incorpora **antes** de retirar la operación de la cola |
| `frontend/src/textos/es.ts` | Textos de conflictos, registro pasado y descarte |
| `frontend/test/utils/api-entrenamiento.ts` | API en memoria con estado, extraída y compartida por las pruebas de T027 y T028. Añade entrenamientos finalizados, `DELETE /entrenamientos/:id` y retrasos configurables |
| `frontend/test/conflictos-y-pasado.test.tsx` | 12 pruebas |
| `frontend/test/sincronizacion.test.ts` | +1 prueba |

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | 10 rojos por funcionalidad, sin errores de configuración |
| Hallazgos de la verificación real | 2 pruebas nuevas en rojo antes de corregir |
| Final | **144/144 verdes** en el frontend |

Hallazgos de la verificación real, ya corregidos:

1. **El entrenamiento pasado aparecía como «en curso» al volver.** El proveedor aplicaba la confirmación del registro a posteriori a la caché del entrenamiento en curso, que estaba vacía. Ahora cada confirmación y cada conflicto se aplican solo a su propio entrenamiento (`esDe`).
2. **Se perdía lo tecleado si la confirmación llegaba mientras se escribía.** El sincronizador retiraba la operación de la cola antes de incorporar la respuesta. En ese instante el ejercicio no estaba ni pendiente ni en los datos, y su tarjeta se volvía a montar. Además, el entrenamiento pasado guardaba sus datos en un estado de React, que React 18 procesa en una pasada posterior a la de la cola. Correcciones:
   - primero se incorpora la respuesta y después se retira de la cola (con una prueba que lo exige);
   - el entrenamiento pasado vive en la caché de consultas (`['entrenamiento', 'pasado', id]`), como el que está en curso.

   Afectaba también al entrenamiento en curso. Se verificaron 4 ejercicios seguidos tecleando la serie nada más aparecer cada uno.

## Navegador real (build de producción, API y PostgreSQL reales, 360 px)

**V6, dos navegadores con la misma cuenta.** Se reprodujo el guion del E2E `conflicto.spec`:
1. A registra 60 kg; B la ve.
2. A añade 80 y B añade 90: las dos se conservan.
3. B, **sin red**, cambia la serie 1 a 70; A la cambia a 65.
4. B recupera la conexión y ve **«Conflicto en la serie 1. Se cambió en otro dispositivo. Ahora: 65 kg × 8. Tu cambio: 70 kg × 8.»**
5. «Repetir mi cambio» deja la serie en **70 kg** en PostgreSQL, sin perder series.

**FR-014.** Un entrenamiento del día anterior, de 18:00 a 19:15, se creó finalizado con Sentadilla 100 × 8, y el resumen lo confirma. Tres registros seguidos escribiendo de inmediato dieron 1 serie cada uno en la base.

**Finalizar y volver a entrar.** El entrenamiento finalizado sigue en la base, y el siguiente muestra «La última vez» (verificado en T027).

axe WCAG 2.1 A/AA (conflicto, formulario de fecha pasada y entrenamiento pasado): 0 violaciones. Sin desplazamiento horizontal. Las cuentas `t028.demo.*` se borraron.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 144/144 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Aviso para T029 (I4): orden de series concurrentes

En V6, la serie que B añade sin conocer la de A recibe el mismo `orden` (2) que la de A. Ambas se conservan, como exige FR-031, pero `conflicto.spec` espera los órdenes 1/2/3 exactos. El cliente calcula el orden con lo que conoce, y sin red no puede saber más. Que el backend renumere al recibir un orden ya ocupado, o que el E2E compruebe «3 series conservadas» en lugar del orden exacto, es una decisión del equipo (backend de T020, I2, o E2E de T029, I4).

## E2E reales de T012/T015 (Playwright, Chrome estable, `npm run test:e2e`)

Ejecución sobre el sistema completo con `gymtrack_test`: **7 aprobadas y 7 fallidas**. Las fallidas no corresponden a fallos del frontend; sus flujos se verificaron a mano en navegador real con API y base reales (arriba y en T024 y T027). Las pruebas son de otros integrantes y no se modifican aquí.

| E2E | Resultado | Causa |
|---|---|---|
| auth: registro con cookie segura; login que conserva la sesión al recargar; credenciales incorrectas; sin sesión | ✅ | — |
| auth: logout; otra sesión de navegador | ❌ | `comprobarSesion` pide `/api/auth/yo` justo después de pulsar «Iniciar sesión», sin esperar la respuesta del login (401). La prueba que espera el título «Entrenar» antes de comprobar sí pasa |
| registro: vacío descartado; medianoche; V4 | ✅ | — |
| registro: flujo principal | ❌ | `/Press de banca/i` sin anclar coincide con 4 botones (modo estricto). `offline` y `conflicto` usan `^…$` |
| registro: inactividad | ❌ | Consulta la base inmediatamente tras el clic, sin esperar a la interfaz ni a la petición |
| conflicto | ❌ | Cuenta las series antes de que se sincronice la de B (2 de 3). Ver además el orden de series concurrentes |
| offline | ❌ | `webServer` arranca `npm run dev`; el service worker solo se registra en producción (T026A). La configuración E2E con build de producción es de T028A/T029 (I4) |
| infraestructura (T011, I1) | ❌ | Espera «Entrenar» en `/` sin sesión; desde T024 las secciones son privadas y redirigen a `/login` |

Comando: `npm run test:e2e -- --reporter=list,json`. Requiere el puerto 5173 libre, la CA de `npm run tls:local` y `gymtrack_test`.
