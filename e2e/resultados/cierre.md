# T062 — Puerta final y matriz de evidencias

Fecha: **2026-11-17, America/Bogota**. Base publicada examinada: **`b816e99`**, clon remoto
limpio de `001-registro-entrenamientos`; documentación en `001-t061b-cierre`.

**Resultado de la puerta: NO APROBADA. T062 queda sin marcar.**
Se ejecutó la verificación, pero no se confunde su ejecución con cumplir todos los criterios.
También queda sin aprobar T061B: [repetición del README y pendientes](readme.md).
No hay commit ni push. La repetición inicial no modificó producto; la continuación corrige
el foco y sincroniza tests sin omitir casos ni reducir criterios.

## Corrección de los ocho fallos de frontend

Continuación del 2026-11-17 (America/Bogota), sobre el árbol de trabajo de `001-t061b-cierre`.
No es una nueva revisión independiente del README desde otro clon; se conservan los resultados
iniciales de `b816e99` como historial. Los cambios de T059 permanecen intactos.

| Fallos originales | Diagnóstico | Corrección sin reducir aceptación |
|---|---|---|
| Auth: foco tras login (1) | **Aplicación**: el efecto de `Layout` corre al cambiar la ruta, antes de que Suspense monte el H1 de la página lazy. Esperar más en el test no lo arregla. | Esperar la inserción del H1 mediante `MutationObserver`, enfocar una sola vez y desconectar al lograrlo o al cambiar/desmontar la ruta. Se mantiene no mover el foco en la carga inicial. El test espera el foco efectivo, sin retirar la aserción. |
| Auth: cierre desde Cuenta (1) | **Espera mal sincronizada**: encontrar `main` solo acredita el shell; Cuenta puede seguir cargando. | Esperar el contenido de la cuenta con `findByText` antes de cerrar sesión; se conservan contrato, limpieza y bloqueo de rutas privadas. |
| Rutinas: estado sin red (1) | **Espera mal sincronizada**: el H1 aparece antes de terminar la primera consulta; navegar durante esa consulta puede reutilizar su respuesta iniciada online. | Esperar el estado vacío cargado y la llegada a Entrenar antes de cortar la red y volver. Se mantiene exigir la alerta de desconexión. |
| Shell: cinco secciones (5) | **Espera mal sincronizada**: `main` existe antes del contenido lazy. | Usar `findByRole` para el H1 de cada sección; permanecen el nombre exacto, nivel H1, `aria-current` y título del documento. |

**No se identificaron expectativas de aceptación desactualizadas.** No se añadieron `skip`,
reintentos, timeouts arbitrarios ni esperas fijas, ni se eliminaron casos/aserciones.

Control negativo: con el `Layout` anterior y las esperas corregidas, auth reproduce **1 fallo de foco**
y 17 casos pasan. Se restauró inmediatamente el `Layout` corregido. Frontend corregido:
**270/270 PASS**, 19 archivos, salida 0 (`npm run test:frontend`).

### Resultado real de la regresión posterior

`npm run test:frontend`: **270/270 PASS**, salida 0. Después de `npm run build` y
`npx cross-env NODE_ENV=test npm run db:seed:carga --workspace backend`, **`npm test` completo
terminó con salida 0**: dominio **82/82**, backend **289/289**, frontend **270/270** y
E2E **45/45** (aproximadamente un minuto de Playwright). No hay casos omitidos en esa ejecución.
Los 45 E2E corresponden al árbol actual con las pruebas locales de T059 conservadas; la ejecución
histórica del clon tenía 43. No se presenta la diferencia como casos nuevos de esta corrección.
`npm run lint`, `npm run typecheck` y `git diff --check`: **PASS**.

Estos resultados corresponden al árbol de trabajo corregido, **no a otro clon publicado**.
T061B sigue sin aprobar por la revisión independiente pendiente; T062 sigue sin aprobar por
esa revisión, audit pendiente, T059 y las observaciones humanas (incluido el mes real de SC-009).
Las celdas históricas FR-001/027/028 y shell que citan regresiones frontend se actualizan con este
resultado verde; los límites humanos y de seguridad de la matriz SC permanecen vigentes.
No se reejecutó perf ni audit en esta corrección y no se modificaron dependencias.



Los apartados originales posteriores a esta actualización conservan el diagnóstico y las tablas
de la ejecución inicial de `b816e99`; sus ocho fallos frontend ya no describen el estado corregido.
Logs locales ignorados: `test-results/correccion-frontend/` (`frontend.log`,
`control-foco-sin-fix.log`, `build.log`, `carga.log`, `completo.log`, `lint.log`, `tipos.log`,
`resultados.json`). No se reejecutó audit ni se declaran corregidas las dependencias vulnerables.


## Alcance y entorno

Se revisaron la [constitución](../../.specify/memory/constitution.md), el
[plan](../../specs/001-registro-entrenamientos/plan.md), la
[spec](../../specs/001-registro-entrenamientos/spec.md),
[quickstart V1–V12](../../specs/001-registro-entrenamientos/quickstart.md) y
[tasks](../../specs/001-registro-entrenamientos/tasks.md). Checklist de requisitos **16/16**,
sin modificar sus marcadores; sin hooks de extensiones.

macOS 26.5.2 arm64, Node 22.23.5, npm 10.9.9, Chrome 157.0.8103.79,
Docker Engine 29.9.3 / Compose 5.7.0, PostgreSQL 16, Mailpit v1.27.4.
Nuevo clon, instalación, secretos, certificado, proyecto Compose y volumen; host/CA del usuario
preexistentes. HTTPS validado en API, frontend y panel, sin ignorar errores TLS.
API/frontend 3000/5173; PostgreSQL 15432, SMTP 11025 y panel 18025 para aislarlos del entorno previo.
Dos bases nuevas (`gymtrack`, `gymtrack_test`), dos migraciones y 50 ejercicios globales en cada una.

El clon excluye deliberadamente las modificaciones **locales no integradas de T059**, conservadas
en el árbol original. Esta puerta no certifica esos cambios como publicados ni borra su evidencia.
Las sesiones de navegador son automatizadas, con viewport 360×800; no son participantes humanos,
lectores de pantalla reales o dispositivos físicos.

## Comandos y resultados

Secuencia de preparación según README: clon, `npm ci`, `.env` y generación de secretos,
`npm run tls:local`, `docker compose up -d --wait`, `npm run db:migrate`,
`npm run db:migrate:test`, `npm run dev`, comprobación web y parada antes de los arneses.

| Comando / fase | Resultado observado |
|---|---|
| `npm ci` | **PASS**, salida 0; audit informa 51 entradas vulnerables, pendientes abajo. |
| Migraciones desde bases nuevas | **PASS** en dev/test: dos migraciones, catálogo 50; repetición sin migraciones pendientes. Cargas de 500/1.500 verificadas en ambas bases aisladas. |
| Arranque y recorrido básico web | **PASS** en repetición con limpieza 204; incidente inicial del arnés documentado en T061B. |
| `npm run build` | **PASS**, salida 0. |
| `npm run lint` / `npm run typecheck` | **PASS**, ambos salida 0, en clon y árbol de trabajo. |
| `npm test` | **FAIL**, salida 1: dominio/backend verdes; frontend rojo y E2E no alcanzado. |
| Dominio dentro de `npm test` | **82/82 PASS**, 11 archivos. |
| Backend dentro de `npm test` | **289/289 PASS**, 24 suites; incluye aceptación REST, correo y T060. |
| Frontend dentro de `npm test` | **262 PASS / 8 FAIL**, 270 casos, 19 archivos (3 fallidos). |
| `npm run test:frontend`, repetición independiente | **262 PASS / 8 FAIL** de nuevo; no se declara inestabilidad resuelta. |
| `npm run test:e2e`, antes de la carga | **42 PASS / 1 FAIL**; la cuenta de 500 entrenamientos aún no estaba sembrada. |
| `npx cross-env NODE_ENV=test npm run db:seed:carga --workspace backend` | **PASS**; 500 entrenamientos, 1.500 series. Añadido como preparación explícita al README. |
| `npm run test:e2e`, con carga | **43/43 PASS**, salida 0, 53,4 s; ningún caso omitido ni reintento. |
| `npm run perf` | **PASS**, salida 0; 5/5 cargas, respuesta local y consultas de 500 dentro de umbrales; 2/2 casos Playwright de perf pasan. |
| `npm audit --json` | Salida **1**, 10 entradas moderadas y 41 altas, 0 críticas. Sin aplicar arreglos automáticos. |
| `git diff --check` / enlaces de documentación | **PASS**; 33 enlaces locales existentes, bloques Bash válidos y documentos nuevos comprobados sin errores de espacios. |

La reejecución E2E con carga aporta evidencia nueva; no elimina el fallo de la primera ejecución.
No se suman repeticiones como casos distintos ni se usa el resultado E2E para ocultar los ocho fallos
frontend. `npm test` **sigue sin estar verde**.

## Fallos iniciales reproducidos y límites de entrega

| Archivo frontend | Casos fallidos | Observación |
|---|---:|---|
| `frontend/test/auth.test.tsx` | 2 | El título de Historial no tiene el foco esperado tras login; el test de cierre de sesión intenta encontrar contenido de Cuenta mientras aún aparece carga. |
| `frontend/test/rutinas.test.tsx` | 1 | El estado sin conexión no presenta la alerta esperada por el test. |
| `frontend/test/shell.test.tsx` | 5 | No encuentra los encabezados esperados de Entrenar, Historial, Progreso, Rutinas y Cuenta. |

Son observaciones del arnés en esta revisión, no diagnósticos definitivos de causa. Requieren
investigar producto/asincronía/mocks y una regresión completa; aquí no se retocan aserciones ni código.

`npm audit` señala dependencias directas y transitivas (51 entradas, no necesariamente 51 CVE
independientes). Entre las directas: Jest, `@types/jest`, `ts-jest`, `react-router-dom`, TypeORM,
`typescript-eslint`, Vite y Vitest. Hay arreglos anunciados por npm, pero no se evaluó su compatibilidad
ni se instaló ninguno. **Pendiente de triage/corrección**; el T060 histórico sobre autenticación,
autorización y almacenamiento no demuestra ausencia de vulnerabilidades de dependencias.

El primer arnés auxiliar imprimió una cookie sintética en un error de su cliente Node sin CA.
La cuenta se eliminó y la sesión quedó revocada; la repetición con CA explícita y errores saneados
pasó. No se conserva ese valor en informes ni artefactos; no se afirma que aquel primer manejo de
salida estuviera libre de secretos. Véase el incidente completo y su alcance en [T061B](readme.md).

## Recorrido quickstart V1–V12

**PASS automático** identifica exclusivamente evidencia funcional de los arneses en el clon.
No implica aceptar los criterios humanos, navegadores no ejecutados o la puerta global.

| Escenario | Evidencia nueva | Estado / límite |
|---|---|---|
| V1 cuenta, sesión y aislamiento | `auth.spec.ts`, REST auth/cuenta y seguridad | **PASS automático**; dos tests unitarios frontend de auth siguen rojos. |
| V2 entrenamiento completo | `registro.spec.ts`, persistencia contrastada con BD/fixture | **PASS automático**, dos ejercicios y cinco series; no prueba la muestra humana de cuatro ejercicios. |
| V3 prellenado | Registro E2E y servicios de registro | **PASS automático**, nueva serie y sesión posterior. |
| V4 validaciones | Dominio, REST y registro E2E | **PASS automático**, límites y entradas aceptadas/rechazadas. |
| V5 offline, recarga y reapertura | Los dos casos `offline.spec.ts`, incluido reiniciar Chrome y añadir otra serie offline | **PASS automático en esta repetición**. No reescribe los resultados fallidos históricos de US1. |
| V6 conflictos entre dispositivos | Cuatro casos `conflicto.spec.ts`, nuevas series y conflictos online/offline | **PASS automático**, sin sobrescritura silenciosa. |
| V7 vacío/inactividad | `registro.spec.ts` | **PASS automático**, descarte vacío y finalización con última actividad. |
| V8 historial/corrección/eliminación | `historial.spec.ts`, REST y recálculo de progreso | **PASS automático**, orden/filtros, confirmación/cancelación y persistencia. |
| V9 progreso/récords | Dominio, REST y nueve casos `progreso.spec.ts` | **PASS automático** frente al fixture de referencia, cero/null, empates, primera sesión y recálculo. Lector real pendiente. |
| V10 cuenta/datos/recuperación | 28 REST de cuenta y seis E2E `cuenta.spec.ts` | **PASS automático**, JSON/CSV reales, correo, tokens, preferencias y cascadas. |
| V11 rutinas | REST y dos E2E `rutinas.spec.ts` | **PASS automático**, orden, propiedad e independencia de plantilla/sesión. |
| V12 calidad transversal | Axe/teclado en E2E y ejecución de rendimiento | **PARCIAL**: falta WCAG manual/lectores y matriz completa de navegadores; frontend y audit impiden cierre. |

## Matriz FR-001–031

Fuentes de evidencia ejecutadas: [tests E2E](../tests),
[aceptación REST](../../backend/test/integracion),
[unitarios de dominio](../../packages/domain/test),
[frontend](../../frontend/test) y resultados de comandos anteriores.
`PASS auto` significa comprobación automática observada, no aceptación global ni humana.

| Requisito | Evidencia en esta revisión | Resultado / límite |
|---|---|---|
| FR-001 alta, login/logout, recuperación | Auth REST/E2E; cuenta 28 REST/6 E2E; Mailpit | **PASS auto API/E2E**; 2 casos frontend auth fallan y bloquean integración. |
| FR-002 propiedad en servidor | T060 (99 casos), REST y dos cuentas sintéticas | **PASS auto** en P1–P5. |
| FR-003 acceso desde otra sesión | Auth E2E, dos contextos independientes y persistencia | **PASS auto**; no certifica hardware físico distinto. |
| FR-004 catálogo global | Migración, 50 registros en ambas bases, catálogo REST | **PASS auto**. |
| FR-005 ejercicios propios CRUD | REST ejercicios y frontend catálogo | **PASS auto**, aislamiento y referencias de uso. |
| FR-006 búsqueda/recientes | REST ejercicios y tests de catálogo | **PASS auto**, normalización y orden reciente. |
| FR-007 ciclo del entrenamiento | Registro REST/E2E, fechas y resumen persistidos | **PASS auto**. |
| FR-008 series y límites | Dominio, registro REST/E2E y validación T060 | **PASS auto**, unidades y precisión. |
| FR-009 prellenado | Registro E2E, última sesión REST y frontend | **PASS auto**. |
| FR-010 editar/eliminar/deshacer | Registro, historial y conflictos E2E/REST | **PASS auto**, sesiones activas y finalizadas. |
| FR-011 notas | Registro REST/E2E, historial y CSV/JSON | **PASS auto**, entrenamiento y ejercicio realizado. |
| FR-012 persistencia sin red | Offline E2E (2), cola frontend y SW | **PASS auto** en Chrome, recarga y reinicio incluidos. |
| FR-013 activa única | Registro y sesiones REST/unitarios, restricciones de BD | **PASS auto**. |
| FR-014 registro de fecha pasada | Registro frontend/REST y prueba de medianoche | **PASS auto**. |
| FR-015 lista/resumen/orden | Historial REST/E2E | **PASS auto**. |
| FR-016 detalle completo | Historial REST/E2E, orden de ejercicios/series | **PASS auto**. |
| FR-017 filtros ejercicio/fechas | Historial REST/E2E, días locales y URL | **PASS auto**. |
| FR-018 borrar con confirmación | Historial E2E y REST | **PASS auto**, cancelar conserva datos. |
| FR-019 gráfico y tabla | Progreso E2E y REST | **PASS auto** de valores equivalentes; revisión de lector pendiente en SC-008. |
| FR-020 Epley/exclusiones | Dominio y fixture de progreso, REST/E2E | **PASS auto**: 1 repetición, >12, peso cero y null. |
| FR-021 récords/empates/recálculo | Dominio, REST y progreso E2E | **PASS auto**, primera fecha y actualización tras editar/borrar. |
| FR-022 avisos de récord | Progreso E2E | **PASS auto**, referencia inicial, peso/1RM y volumen al terminar/reabrir. |
| FR-023 periodos | Progreso dominio/REST/E2E | **PASS auto**. |
| FR-024 kg/lb inmutable | Cuenta REST/E2E y dominio | **PASS auto**, conversión sin alterar almacenamiento. |
| FR-025 JSON/CSV | Cuenta E2E (descargas) y REST | **PASS auto**, datos propios, fórmulas neutralizadas solo en CSV y sin hashes/tokens. |
| FR-026 eliminar cuenta/cascadas | Cuenta, rutinas y seguridad REST/E2E | **PASS auto**, contraseña, confirmación y datos ajenos conservados. |
| FR-027 validación/mensajes | Dominio, backend, formularios E2E/frontend | **PASS auto de validación**; alerta de desconexión de rutinas tiene regresión frontend pendiente. |
| FR-028 rutinas CRUD/propiedad | Rutinas REST/E2E | **PASS auto API/E2E**; 1 caso frontend de estado sin red falla. |
| FR-029 iniciar desde rutina | Rutinas REST/E2E y registro | **PASS auto**, copia ordenada y sesión activa única. |
| FR-030 independencia y confirmación | Rutinas REST/E2E | **PASS auto**, edición/borrado plantilla/sesión y cascadas. |
| FR-031 concurrencia/conflictos | Registro REST, cola frontend y cuatro E2E conflicto | **PASS auto**, series nuevas conservadas y cambios tardíos explícitos. |

Los cinco tests de shell fallidos afectan a la cobertura de navegación/foco del frontend;
se mantienen como bloqueo transversal, aunque las operaciones de API/E2E correspondientes pasen.

## Matriz SC-001–009

| Criterio | Evidencia / resultado | Estado de aceptación |
|---|---|---|
| SC-001 <5 s / ≤3 interacciones | Registro E2E pasa las aserciones programadas; no hay participantes humanos (n=0). | **Pendiente humano**; acciones `fill/click` no equivalen a gestos reales. |
| SC-002 alta → primera serie <2 min sin ayuda | Auth/registro E2E funcionales; el tiempo V2 excluye el alta y lo dirige un script. | **Pendiente humano**, sin medición válida de persona nueva. |
| SC-003 90 % completa cuatro ejercicios | [Usabilidad](usabilidad.md): muestra humana **n=0**. | **No evaluable**, sin porcentaje inventado. |
| SC-004 0 series perdidas | Offline y conflictos E2E, recarga/reinicio y conteos de BD pasan. | **PASS automático en los escenarios ejecutados**, sin extrapolar a cualquier navegador/dispositivo. |
| SC-005 <2 s con 500 entrenamientos | `perf`: historial **22,2 ms**, progreso **15,4 ms**, 500 entrenamientos y perfil constitucional. | **PASS automático en este entorno**. |
| SC-006 métricas coinciden 100 % con referencia | Dominio 82/82, fixture manual de progreso y REST/E2E pasan. | **PASS automático sobre el conjunto de referencia**, no un porcentaje de usuarios. |
| SC-007 encontrar última sesión <15 s | E2E de historial pasa; algoritmo conoce el enlace. Sin usuarios observados. | **Pendiente humano**. |
| SC-008 WCAG AA en todas las pantallas | Axe y teclado automáticos pasan; T059 sigue abierta, con cambios locales no integrados. | **Pendiente** de revisión manual/lector y dos últimas versiones de Chrome/Safari/Firefox/Edge en móvil/escritorio. |
| SC-009 80 % con ≥4 entrenamientos al mes | [Plan mensual](usabilidad.md#plan-de-observación-mensual--sc-009), cohorte no iniciada. | **Pendiente de un mes real**, sin reloj simulado, analítica nueva ni datos inventados. |

T061 aparece marcada en tasks **por indicación expresa de la usuaria**, con una nota que conserva
que las sesiones siguen pendientes (n=0). Se respeta esa decisión sin convertir la casilla en
evidencia de SC-001/002/003/007 ni en un mes observado. No se modifica retrospectivamente T061.

## Rendimiento de esta ejecución

**PASS**, `npm run perf` salida 0. Fecha del resumen: 2026-11-18T02:40:54.761Z
(2026-11-17, America/Bogota). Chrome estable, 360×800, CPU 4×, descarga/subida 10/5 Mbps,
latencia 100 ms y caché vacía por ejecución.

| Medición | Resultado | Umbral | Estado |
|---|---:|---:|---|
| Carga fría 1 | 519,484 ms | <3000 ms | PASS |
| Carga fría 2 | 409,571 ms | <3000 ms | PASS |
| Carga fría 3 | 411,403 ms | <3000 ms | PASS |
| Carga fría 4 | 384,065 ms | <3000 ms | PASS |
| Carga fría 5 | 399,146 ms | <3000 ms | PASS |
| Cargas que cumplen | 5/5 | ≥4/5 | PASS |
| Respuesta visual local | 13,8 ms | <100 ms | PASS |
| Historial, 500 entrenamientos | 22,2 ms | <2000 ms | PASS |
| Progreso, 500 entrenamientos | 15,4 ms | <2000 ms | PASS |

Los dos casos Playwright de `perf` pasan; 500 entrenamientos y 1.500 series son sintéticos.
El informe histórico [rendimiento.md](rendimiento.md) **se conserva**, sin reemplazar sus mediciones.
El generador escribió en el clon una etiqueta fija Windows; el entorno real de esta medición
es **macOS 26.5.2**, como se registra aquí. Se conservan `perf/summary.json` y cinco informes
Lighthouse nuevos en `test-results/t061b-t062/`, separados de la evidencia histórica.

## Pendientes para aprobar la puerta

1. Revisar/corregir las dependencias señaladas por audit con la regresión correspondiente;
   no se consideran resueltas por que T060 API/cookies pase.
2. Otro integrante debe repetir el README corregido y acreditar T061B.
3. Completar T059/SC-008, integrando primero sus cambios si procede; no equiparar axe a lector real.
4. Ejecutar usabilidad humana para SC-001/002/003/007. Mantener SC-009 pendiente hasta el mes real;
   esa espera mensual está prevista por T062 y no se disimula con fechas sintéticas.
5. Mantener abiertas T061B y T062 mientras no se satisfagan sus criterios. Se documentan los
   resultados parciales, no se autoriza integración ni se crea commit/push.

Artefactos locales de comandos y diagnóstico: `test-results/t061b-t062/` (ignorados), incluido
`comandos.json` con salidas/duraciones, logs de cada intento, audit y los resultados nuevos de perf.
Los informes versionables no contienen contraseñas, cookies, tokens, correos de participantes ni
historiales personales. La evidencia de T059 se conserva sin cambios de contenido.

Comprobación final de conservación: los 8 archivos locales de T059 inventariados antes de empezar
mantienen sus hashes. Solo se modificó README y se añadieron los informes `readme.md`/`cierre.md`.
Los contenedores de prueba quedaron detenidos, su volumen conservado y los puertos web libres.
T061B y T062 permanecen desmarcadas; `tasks.md` no se modificó en esta ejecución.
