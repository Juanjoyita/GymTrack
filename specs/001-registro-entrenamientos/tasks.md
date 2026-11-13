# Tareas: Registro y seguimiento de entrenamientos

**Fuentes**: [constitución 1.1.0](../../.specify/memory/constitution.md), [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contrato REST](./contracts/api.md) y [quickstart.md](./quickstart.md).

## Alcance y reglas de ejecución

Se implementan las cinco historias aprobadas: P1 registro con autenticación básica, P2 historial, P3 progreso, P4 cuenta y datos, P5 rutinas. El plan **no** separa historial como incremento Brownfield: US2 permanece aquí. P1 es el primer incremento entregable. No se añaden funciones fuera de la especificación.

Formato: `- [ ] ID [P opcional] [historia si aplica] Acción — Responsable; depende de; resultado comprobable`. Las rutas son relativas a la raíz del repositorio; son destinos previstos, no archivos que este paso cree. Cada referencia en «depende» es una arista de desbloqueo: terminar esas tareas habilita la tarea indicada. «Base» significa T001–T011 completas, incluida T010A. Los IDs con sufijo conservan las referencias existentes y se ejecutan en el lugar indicado por sus dependencias.

Una prueba de aceptación debe ejecutarse y fallar por el comportamiento ausente, no por un error de configuración, antes de implementar su historia. Se registra la evidencia rojo/verde en el informe de pruebas de cada historia. Los unitarios nuevos siguen también rojo → verde → refactor. Las pruebas de servicio se ejecutan con módulos de prueba aislados; el verde de API requiere rutas registradas y el verde E2E requiere pantallas integradas. Las verificaciones integradas requieren todos sus prerrequisitos en verde; no se fusionan cambios con pruebas fallidas.

`[P]` indica tareas de la misma tanda explícita que pueden comenzar juntas una vez satisfechos sus prerrequisitos. No autoriza a anticipar una dependencia. Sin marca, se sigue el orden indicado. Los archivos compartidos (`package.json`, lockfile, `backend/src/app.module.ts`, router, textos y dominio) se modifican en las tareas de integración designadas, nunca simultáneamente por dos responsables. El contrato aprobado se consume sin modificarlo en este paso.

## Responsables propuestos

| Integrante | Responsabilidad principal | Apoyo posterior |
|---|---|---|
| 1 | Docker, PostgreSQL, migraciones, acceso y persistencia base | Cuenta, recuperación y seguridad |
| 2 | Sesiones, ejercicios realizados y series del backend | API de progreso y comienzo desde rutina |
| 3 | Catálogo e interfaz móvil | Interfaces de progreso, cuenta y rutinas |
| 4 | Datos de prueba y E2E integrado de P1; historial completo | Fixtures de métricas y verificación transversal |

## Fase 1 — Docker, conexión y migraciones (bloqueante)

- [x] T001 Configurar PostgreSQL 16 de desarrollo/pruebas en `docker-compose.yml`, `.env.example` y `docker/postgres/init-test.sql` — I1; depende: ninguna; comprobar: `docker compose up -d` deja PostgreSQL saludable y bases `gymtrack`/`gymtrack_test` separadas, con volumen persistente y sin secretos reales versionados.
- [x] T002 Inicializar npm workspaces y conexión NestJS–TypeORM en `package.json`, `backend/package.json`, `backend/src/main.ts`, `backend/src/app.module.ts` y `backend/src/database/data-source.ts` — I1; depende: T001; comprobar: Node 22/TypeScript strict, prefijo `/api`, conexión configurable a ambas bases, arnés Jest/Supertest mínimo y configuración aislada para poder ejecutar T004 antes de ampliar herramientas en T005/T006, `synchronize: false` y fallo claro ante configuración inválida.
- [x] T003 Crear migración inicial en `backend/src/database/migrations/001-esquema.ts` y entidades en `backend/src/database/entities/` — I1; depende: T002; comprobar: las siete entidades persistidas de data-model (incluida `rutina_ejercicio`) y `token_recuperacion` tienen UUID, FK, cascadas/NO ACTION, índices, versiones, `timestamptz` y pesos `numeric` previstos; se impide más de una sesión activa por usuario.
- [x] T004 Verificar migraciones en `backend/test/integracion/migraciones.e2e-spec.ts` y registrar scripts `db:migrate` en `package.json` — I1; depende: T003; comprobar: migración desde base vacía, segunda ejecución sin cambios y conservación de filas tras reiniciar Compose; pruebas aisladas nunca limpian desarrollo.

## Fase 2 — Base compartida

- [x] T005 Completar herramientas del monorepo en `frontend/package.json`, `packages/domain/package.json`, configuraciones TypeScript/Vite/Tailwind/Vitest/Jest/ESLint y scripts raíz de `package.json` — I1; depende: T004; comprobar: React 18, Vite 6, Tailwind 4, NestJS 11 y dependencias del plan instalables; existen `dev`, `test:domain`, `test:backend`, `test:frontend`, `test:e2e`, `lint`, `typecheck` y `perf` sin alterar el contrato.
- [ ] T006 [P] Preparar infraestructura de integración y E2E en `backend/test/utils/`, `e2e/playwright.config.ts` y `e2e/tests/infraestructura.spec.ts` — I4; depende: T005; comprobar: prueba de infraestructura verde contra `gymtrack_test`, factorías deterministas de dos usuarios y limpieza aislada, viewport 360×800 y captura de resultados.
- [x] T007 [P] Escribir unitarios en rojo de conversión, validación base y volumen en `packages/domain/test/{unidades,validacion,metricas,normalizar}.test.ts` — I2; depende: T005; comprobar: casos 0/500 kg, equivalentes lb, dos decimales originales, repeticiones 1/100 y límites inválidos, normalización y suma de volumen fallan por funciones ausentes.
- [x] T008 Implementar conversiones, volumen, normalización y esquemas base en `packages/domain/src/unidades.ts`, `metricas.ts`, `normalizar.ts` y `validacion/{auth,serie,entrenamiento,ejercicio}.ts` — I2; depende: T007; comprobar: T007 verde, kg canónico sin cambios por visualización y validación idéntica exportable al cliente/servidor.
- [ ] T009 Preparar validación y errores HTTP en `backend/src/comun/`, e integrarlos en `backend/src/main.ts` — I1; depende: T006, T008; comprobar: test `backend/test/integracion/comun.e2e-spec.ts` pasa para `400 VALIDACION` por campo, errores con formato contractual y logs sin cuerpos, emails, tokens ni pesos.
- [ ] T010 Preparar shell móvil en `frontend/src/main.tsx`, `frontend/src/app/`, `frontend/src/api/cliente.ts`, `frontend/src/componentes/` y `frontend/src/textos/es.ts` — I3; depende: T009; comprobar: React Router, Query, cliente con cookies, textos españoles, etiquetas, foco y controles ≥44×44 px funcionan a 360 px; sin implementar aún los flujos de las historias.
- [ ] T010A Preparar HTTPS local y de pruebas en `scripts/tls-local.sh`, `.env.example`, `backend/src/main.ts`, `frontend/vite.config.ts`, `package.json` (script `tls:local`) y `e2e/playwright.config.ts` — I1; depende: T010; comprobar: certificado local confiable generado con mkcert sin versionar claves, frontend/API sirven HTTPS y E2E valida certificados sin ignorar errores TLS; documentar configuración HTTPS del entorno de entrega; la cookie Secure se verifica tras implementar auth en T023/T029.
- [ ] T011 Integrar arneses en scripts raíz y comprobar la base en `package.json`, `backend/src/app.module.ts` y `e2e/tests/infraestructura.spec.ts` — I1; depende: T010A; comprobar: frontend/API/PostgreSQL arrancan con los comandos del quickstart y los arneses, lint y tipos pasan; módulos de historias siguen sin implementar.

**Desbloqueo**: T011 habilita las pruebas de US1. T006 y T007 son la única tanda paralela de base: no editan archivos comunes.

## Fase 3 — US1 / P1: Registrar un entrenamiento (MVP)

**Objetivo independiente**: crear cuenta, registrar series en dos ejercicios, finalizar, cerrar sesión, reingresar y comprobar datos exactos y aislamiento. Incluye FR-001–014 (salvo recuperación), FR-027 y FR-031; V1–V7. Ver el entrenamiento conservado se comprueba comparando por BD todas las filas propias con los valores esperados del fixture (ejercicios, orden, series, pesos, repeticiones, notas, inicio, fin y zona), verificando el resumen mostrado al finalizar y el prellenado tras volver a iniciar sesión, sin esperar la pantalla de historial P2.

### Aceptación primero: puerta roja

- [ ] T012 [US1] Escribir y ejecutar aceptación de acceso en `backend/test/integracion/auth.e2e-spec.ts` y `e2e/tests/auth.spec.ts` — I1; depende: Base; comprobar: fallan registro, login, logout, sesión en otro dispositivo, credenciales inválidas y acceso sin sesión.
- [ ] T013 [US1] Escribir aceptación REST de registro en `backend/test/integracion/registro.e2e-spec.ts` — I2; depende: T012; comprobar: rojo para sesiones, series, notas, fecha pasada, prellenado, duplicación de POST, carreras de inicio y aislamiento de todos los recursos anidados.
- [ ] T014 [US1] Escribir aceptación de catálogo en `backend/test/integracion/ejercicios.e2e-spec.ts` y `frontend/test/catalogo.test.tsx` — I3; depende: T013; comprobar: rojo para búsqueda sin tildes/mayúsculas, recientes, CRUD propio, duplicados y bloqueo de borrado en uso; catálogo global inmutable.
- [ ] T015 [US1] Preparar datos y escribir aceptación integrada en `backend/test/utils/registro-fixtures.ts`, `e2e/tests/{registro,offline,conflicto}.spec.ts` — I4; depende: T014; comprobar: rojo para dos ejercicios, edición/deshacer, ≤3 interacciones, red intermitente, recarga/cierre, dos dispositivos y cambios tardíos; fixture incluye vacío, 13 h inactivo, medianoche y valores V4. Registrar evidencia roja de T012–T015 antes de T016–T018.

### Implementación

- [ ] T016 [P] [US1] Implementar registro/login/logout/yo y guard de propiedad en `backend/src/auth/` y `backend/src/comun/auth.guard.ts` — I1; depende: T015; comprobar: pruebas aisladas del servicio/guard verdes con Argon2id, JWT en cookie httpOnly/SameSite Strict/Secure en todos los entornos, limitación de intentos, `401` sin sesión y `404` para recursos ajenos; token nunca en localStorage; el verde de API de T012 se exige en T023 y su E2E en T029.
- [ ] T017 [P] [US1] Implementar ciclo de sesión en `backend/src/entrenamientos/sesiones.service.ts` — I2; depende: T015; comprobar: iniciar/recuperar/finalizar/descartar, registro pasado, notas y zonas UTC/IANA correctas; una sola activa incluso con concurrencia, vacío descartado e inactivo finalizable a hora de última serie.
- [ ] T018 [P] [US1] Crear migración idempotente del catálogo en `backend/src/database/migrations/002-catalogo.ts` — I3; depende: T015; comprobar: exactamente los 50 ejercicios y grupos de data-model, sin duplicados tras repetir migraciones.
- [ ] T019 [US1] Implementar API de catálogo en `backend/src/ejercicios/` — I3; depende: T016, T018; comprobar: búsqueda normalizada, recientes, creación/renombrado/borrado propio y `409` con ejercicio sugerido o referencias de uso; pruebas aisladas del servicio verdes; T014 de API se exige en T023 tras registrar rutas.
- [ ] T020 [US1] Implementar ejercicios realizados y series en `backend/src/entrenamientos/{ejercicios-realizados,series}.service.ts` — I2; depende: T016, T017, T019; comprobar: orden, notas, CRUD en sesiones activas/finalizadas, UUID idempotentes sin duplicar ni aceptar recursos ajenos, validaciones V4 y nuevas series concurrentes conservadas.
- [ ] T021 [US1] Aplicar control de versión atómico en `backend/src/entrenamientos/` — I2; depende: T020; comprobar: PATCH/DELETE con versión vieja devuelven `409` y actual; recurso conocido eliminado produce conflicto tratable; operaciones rechazadas no alteran filas y dos creaciones válidas se conservan.
- [ ] T022 [US1] Exponer prellenado en `backend/src/ejercicios/ultima-sesion.service.ts` — I2; depende: T021; comprobar: última sesión finalizada con series propias o `null`, excluye actual; datos ordenados y disponibles tras reingresar.
- [ ] T023 [US1] Integrar rutas REST de P1 en `backend/src/entrenamientos/entrenamientos.controller.ts`, sus módulos y `backend/src/app.module.ts` — I1; depende: T022; comprobar: T012–T014 de backend verdes con códigos y respuestas del contrato.
- [ ] T024 [US1] Implementar acceso móvil en `frontend/src/paginas/auth/` y sesión en `frontend/src/app/` — I3; depende: T023; comprobar: registro/login/logout reales, errores por campo, rutas protegidas y cambio de usuario sin exponer datos anteriores.
- [ ] T025 [US1] Implementar selector y gestión de ejercicios en `frontend/src/paginas/entrenamiento/SelectorEjercicio.tsx` — I3; depende: T024; comprobar: T014 de interfaz verde; recientes, búsqueda, creación inmediata, renombrado y explicación de bloqueo de borrado.
- [ ] T026 [US1] Escribir unitarios rojos e implementar cola duradera en `frontend/test/sincronizacion.test.ts` y `frontend/src/sincronizacion/` — I3; depende: T025; comprobar: persistir antes de confirmar visualmente, reintentos por UUID, orden de dependencias, vaciado solo tras confirmación, separación por usuario sin credenciales, resolución explícita de `409`/`404` sin sobrescritura silenciosa.
- [ ] T026A [US1] Implementar carga offline del shell en `frontend/src/sw.ts`, `frontend/src/registrar-sw.ts` y configuración de build en `frontend/vite.config.ts` — I3; depende: T026; comprobar: service worker mínimo precachea HTML/JS/CSS versionados tras primera carga online, controla la página antes de indicar disponibilidad offline y permite navegación/recarga sin red; excluye API, credenciales y respuestas personales de Cache Storage, sin Background Sync ni librerías de sincronización; E2E usa build de producción con el worker activo.
- [ ] T027 [US1] Implementar sesión y formulario de series en `frontend/src/paginas/entrenamiento/` — I3; depende: T026A; comprobar: prellenado desde serie actual o primera de última sesión, referencia anterior visible, notas, edición, borrado con deshacer, orden y resumen; ≤3 interacciones por serie y mensaje de pendientes; vacío e inactividad V7 resueltos.
- [ ] T028 [US1] Conectar páginas P1 y errores/conflictos en `frontend/src/app/`, `frontend/src/api/` y `frontend/src/textos/es.ts` — I3; depende: T027; comprobar: flujo real de extremo a extremo, fecha pasada, finalizar y reingresar conservan datos; conflicto muestra versión vigente y permite repetir o descartar.

### Verificación integrada

- [ ] T028A [US1] Preparar medición reproducible del MVP en `e2e/lighthouse/`, `e2e/tests/respuesta-local.spec.ts` y script `perf` en `package.json` — I4; depende: T028; comprobar: build de producción servido por HTTPS, Chrome estable 360×800, CPU 4×, red 10/5 Mbps y 100 ms, cinco arranques con cachés HTTP y del worker vacías; medir interacción inicial y latencia entre confirmar serie y respuesta visual local sin esperar sincronización.
- [ ] T029 [US1] Ejecutar aceptación P1 y auditar móvil en `e2e/tests/{auth,registro,offline,conflicto}.spec.ts` y `e2e/resultados/us1.md` — I4; depende: T028A; comprobar: T012–T015 verdes, V1–V7, 0 series perdidas/duplicadas, reinicio de navegador, conflictos de edición y eliminación online/offline, aislamiento por API; axe y teclado/foco/lector sin barreras, ≥44×44 px, SC-001 <5 s/≤3 acciones y SC-002 <2 min. Verificar los datos exactos mediante la comparación BD/fixture definida en el objetivo de US1, sin usar endpoints o pantallas de P2. Ejecutar recarga y reapertura offline con worker activo y registrar series adicionales antes de reconectar. Exigir primera carga interactiva <3 s en ≥4/5 ejecuciones y respuesta local <100 ms; guardar evidencia en `e2e/resultados/us1.md`. Ningún escenario pendiente o fallido permite aprobar T029.

**Puerta MVP**: T029 verde y lint/tipos/pruebas verdes. No necesita historial, progreso, preferencias ni rutinas. T016–T018 son una tanda paralela tras T015: guard/auth, servicio de sesiones y migración de catálogo son archivos disjuntos; el cableado compartido se reserva a T023.

## Fase 4 — US2 / P2: Consultar historial

**Objetivo independiente**: con fixtures conocidos, listar, filtrar, consultar, corregir y eliminar sesiones propias. Incluye FR-010 y FR-014 en sesiones pasadas, FR-015–018; V8 y SC-007. I4 conserva la responsabilidad de historial porque está incluido expresamente en el plan.

### Aceptación primero

- [ ] T030 [US2] Escribir aceptación en `backend/test/integracion/historial.e2e-spec.ts` y `e2e/tests/historial.spec.ts` — I4; depende: T029; comprobar: rojo para orden descendente/paginación, resumen exacto, detalle ordenado, filtros combinados por ejercicio/días locales, vacío, edición y eliminación confirmada; otro usuario no puede consultar ni modificar.

### Implementación

- [ ] T031 [US2] Implementar consultas de lista/detalle en `backend/src/entrenamientos/historial.service.ts` — I4; depende: T030; comprobar: solo finalizados propios, cursor estable y resumen derivado, rango local y zonas de medianoche correctos contra fixtures.
- [ ] T032 [US2] Integrar consultas y correcciones de sesiones pasadas en `backend/src/entrenamientos/entrenamientos.controller.ts` — I4; depende: T031; comprobar: edición de series/ejercicios/nota y eliminación con versiones reutilizan P1; resúmenes se recalculan sin modificar otras sesiones.
- [ ] T033 [US2] Implementar lista, detalle, filtros y edición en `frontend/src/paginas/historial/` — I4; depende: T032; comprobar: resumen con fecha/duración/ejercicios/series/volumen, estados vacíos, registro pasado, confirmación de eliminación e invalidación de caché tras cambios.
- [ ] T034 [US2] Integrar navegación y textos de historial en `frontend/src/app/`, `frontend/src/api/historial.ts` y `frontend/src/textos/es.ts` — I4; depende: T033; comprobar: filtros y detalle accesibles por URL y teclado; interfaz refleja correcciones sin datos obsoletos.

### Verificación integrada

- [ ] T035 [US2] Ejecutar V8 y revisión accesible en `e2e/tests/historial.spec.ts` y `e2e/resultados/us2.md` — I4; depende: T034; comprobar: T030 verde, confirmación respeta cancelar, SC-007 <15 s para encontrar última sesión, axe y revisión manual pasan; comprobar recálculo del progreso al incorporar US3 en T043.

## Fase 5 — US3 / P3: Progreso y récords

**Objetivo independiente**: verificar métricas contra cálculo manual y avisos durante P1 con datos conocidos. FR-019–023, V9, SC-006.

### Aceptación primero

- [ ] T036 [US3] Crear fixture manual y aceptación roja en `packages/domain/test/fixtures/progreso-referencia.json`, `backend/test/integracion/progreso.e2e-spec.ts` y `e2e/tests/progreso.spec.ts` — I4; depende: T035; comprobar: rojo para periodos, tabla/gráfico, récords y todos los casos V9, incluidos primera métrica sin referencia, reabrir/terminar y finalización global.
- [ ] T037 [US3] Escribir unitarios rojos en `packages/domain/test/{metricas-progreso,records}.test.ts` — I2; depende: T036; comprobar: Epley 1/2/12/13 repeticiones, peso 0, `null` sin series válidas, agregación del ejercicio repetido en la sesión, empates con primera fecha y recálculo tras editar/eliminar.

### Implementación

- [ ] T038 [US3] Implementar métricas y detección de récords en `packages/domain/src/metricas.ts` y `records.ts` — I2; depende: T037; comprobar: T037 verde y coincidencia 100 % con fixture; sin aviso en primera sesión/primera métrica válida ni empates.
- [ ] T039 [US3] Implementar API de progreso y récords en `backend/src/progreso/` y registrarla en `backend/src/app.module.ts` — I2; depende: T038; comprobar: periodos 1m/3m/1a/todo, solo sesiones finalizadas propias, exclusión de entrenamiento actual y récords derivados que cambian al corregir/eliminar datos.
- [ ] T040 [US3] Implementar gráfico, tabla equivalente y récords en `frontend/src/paginas/progreso/` — I3; depende: T039; comprobar: mismos datos en Recharts y tabla, filtro temporal, una sesión con aviso de tendencia insuficiente, estados sin datos y distinción adicional al color.
- [ ] T041 [US3] Implementar avisos durante el registro en `frontend/src/paginas/entrenamiento/` — I3; depende: T040; comprobar: peso/1RM tras cada serie; volumen solo al terminar ejercicio o finalizar sesión; reabrir no repite aviso salvo superar máximo ya notificado, persistido según contrato; región aria-live polite sin mover foco.
- [ ] T042 [US3] Integrar rutas, cliente y textos en `frontend/src/app/`, `frontend/src/api/progreso.ts` y `frontend/src/textos/es.ts` — I3; depende: T041; comprobar: invalidación tras cambios de historial y avisos integrada sin añadir interacciones al registro de serie.

### Verificación integrada

- [ ] T043 [US3] Ejecutar V9 y regresión V8 en `e2e/tests/{progreso,historial}.spec.ts` y `e2e/resultados/us3.md` — I4; depende: T042; comprobar: T036 verde, SC-006 al 100 %, edición/eliminación recalcula gráfico/tabla/récords, axe y revisión manual pasan; avisos funcionan con series sincronizadas sin duplicarse.

## Fase 6 — US4 / P4: Cuenta y datos

**Objetivo independiente**: con usuario y datos existentes, cambiar unidad sin alterar kg, exportar, recuperar acceso y eliminar cuenta. FR-001 (recuperación), FR-024–026; V10.

### Preparación de infraestructura de pruebas

- [ ] T043A Preparar Mailpit en `docker-compose.yml`, variables SMTP en `.env.example` y fixture SMTP en `backend/test/utils/correo.ts` — I1; depende: T043; comprobar: prueba de infraestructura envía un correo sintético y lo recupera de Mailpit; panel/API de pruebas mediante HTTPS con certificado local, sin implementar recuperación ni servicio de correo de aplicación.

### Aceptación primero

- [ ] T044 [US4] Escribir aceptación roja en `backend/test/integracion/cuenta.e2e-spec.ts` y `e2e/tests/cuenta.spec.ts` — I4; depende: T043A; comprobar: rojo para kg↔lb sin mutación de BD, exportación completa JSON/CSV sin secretos, eliminación total y recuperación con respuesta indistinguible, token de 1 h y un solo uso.

### Implementación

- [ ] T045 [US4] Implementar envío de correo con Nodemailer en `backend/src/correo/` — I1; depende: T044; comprobar: servicio de aplicación envía correo de prueba al Mailpit preparado en T043A sin servicios de pago ni tokens en logs.
- [ ] T046 [US4] Implementar recuperación y registrar sus rutas en `backend/src/auth/` — I1; depende: T045; comprobar: token SHA-256 almacenado, invalida anteriores al solicitar otro, consumo atómico, expiración ≥1 h rechazada, respuesta 202 igual para cualquier email, límite de intentos y aumento de version_token al cambiar contraseña invalida sesiones.
- [ ] T047 [US4] Implementar preferencias y exportación en `backend/src/cuenta/` — I1; depende: T046; comprobar: kg guardados intactos; JSON/CSV del contrato y research R-17 incluyen todos los datos propios, sin hashes/tokens y con cabecera de descarga correcta.
- [ ] T048 [US4] Implementar eliminación transaccional de cuenta en `backend/src/cuenta/` e integrar módulo en `backend/src/app.module.ts` — I1; depende: T047; comprobar: exige contraseña, elimina todos los datos dependientes con referencias cruzadas y cookie, conserva catálogo y datos ajenos; T044 de API verde.
- [ ] T049 [US4] Implementar preferencias/exportación/eliminación y recuperación en `frontend/src/paginas/cuenta/`, `frontend/src/paginas/auth/`, `frontend/src/app/`, `frontend/src/api/cuenta.ts` y `frontend/src/textos/es.ts` — I3; depende: T048; comprobar: pesos convertidos con dominio compartido, descarga ambos formatos, errores claros de enlace, confirmación de borrado y limpieza local/caché al eliminar cuenta sin reintentar datos borrados.

### Verificación integrada

- [ ] T050 [US4] Ejecutar V10 en `e2e/tests/cuenta.spec.ts` y `e2e/resultados/us4.md` — I4; depende: T049; comprobar: T044 verde, inspección de archivos descargados, Mailpit solo recibe para registrado, enlaces usados/caducados rechazados, sesiones anteriores invalidadas; axe y revisión de teclado/foco pasan.

## Fase 7 — US5 / P5: Rutinas por día

**Objetivo independiente**: crear/editar rutina de tres ejercicios, iniciar sesión en orden y demostrar independencia entre ambas. FR-028–030; V11.

### Aceptación primero

- [ ] T051 [US5] Escribir aceptación roja en `backend/test/integracion/rutinas.e2e-spec.ts` y `e2e/tests/rutinas.spec.ts` — I4; depende: T050; comprobar: rojo para CRUD privado, día 1–7, lista no vacía/ordenada, inicio desde rutina y no propagación de cambios/borrado en ninguna dirección.

### Implementación

- [ ] T052 [US5] Escribir unitarios rojos e implementar esquema de rutina en `packages/domain/test/rutina.test.ts` y `packages/domain/src/validacion/rutina.ts` — I2; depende: T051; comprobar: día, nombre, orden y al menos un ejercicio validados de forma compartida; unitarios verdes.
- [ ] T053 [US5] Implementar CRUD transaccional en `backend/src/rutinas/` — I2; depende: T052; comprobar: propietario, versiones, sustitución ordenada de lista completa y rechazo de ejercicios ajenos; rutina nunca vacía.
- [ ] T054 [US5] Integrar comienzo desde rutina en `backend/src/entrenamientos/`, protección de ejercicios en `backend/src/ejercicios/` y módulo en `backend/src/app.module.ts` — I2; depende: T053; comprobar: copia ejercicios en orden/sin series, respeta sesión activa única, borrado de rutina no cambia sesión y ejercicio usado en rutina devuelve sus referencias.
- [ ] T055 [US5] Implementar lista/editor/inicio desde rutina en `frontend/src/paginas/rutinas/`, `frontend/src/api/rutinas.ts`, `frontend/src/app/` y `frontend/src/textos/es.ts` — I3; depende: T054; comprobar: crear/editar nombre/día/ejercicios, eliminar con confirmación e iniciar flujo P1 sin modificar plantilla al cambiar sesión.

### Verificación integrada

- [ ] T056 [US5] Ejecutar V11 en `e2e/tests/rutinas.spec.ts` y `e2e/resultados/us5.md` — I4; depende: T055; comprobar: T051 verde, aislamiento, orden e independencia tras editar/borrar rutina/sesión; axe y teclado/foco pasan; repetir eliminación de cuenta con rutinas y series para comprobar cascadas.

## Fase 8 — Verificación transversal y cierre

- [ ] T057 Preparar carga reproducible de 500 entrenamientos en `backend/src/database/seeds/carga.ts` y script `db:seed:carga` en `package.json` — I4; depende: T056; comprobar: solo ejecutable en dev/test, datos sintéticos deterministas por usuario y rechazo de ejecución en producción.
- [ ] T058 Configurar y ejecutar rendimiento en `e2e/lighthouse/` y `e2e/resultados/rendimiento.md` — I4; depende: T057; comprobar: build de producción, Chrome estable, 360×800, CPU 4×, red 10/5 Mbps y 100 ms, caché vacía; interactivo <3 s en ≥4/5, respuesta visual local <100 ms y consultas de historial/progreso con 500 sesiones <2 s (SC-005); guardar mediciones, no solo puntuación Lighthouse.
- [ ] T059 Ejecutar auditoría final en `e2e/tests/accesibilidad.spec.ts` y `e2e/resultados/calidad.md` — I4; depende: T058; comprobar: V12/SC-008 en todas las pantallas, axe más revisión manual WCAG 2.1 AA, teclado/foco/lectura/contraste, tamaño táctil; flujos principales en las dos últimas versiones de Chrome/Safari/Firefox/Edge móviles y escritorio, anotando versiones probadas.
- [ ] T060 Verificar seguridad y propiedad en `backend/test/integracion/seguridad.e2e-spec.ts` y `e2e/resultados/seguridad.md` — I1; depende: T059; comprobar: matriz de recursos ajenos en cada operación P1–P5, validación servidor, HTTPS en todos los entornos web, cookies Secure, ausencia de secretos/PII en logs/repositorio y ninguna contraseña/token en almacenamiento local.
- [ ] T061 Ejecutar prueba de usabilidad en `e2e/resultados/usabilidad.md` — I4; depende: T060; comprobar: registrar tamaño de muestra y resultados SC-001/002/003 (90 % completa cuatro ejercicios sin ayuda/errores), SC-007 y plan de observación de SC-009; SC-009 solo se declara cumplido tras observar un mes real, sin inventar datos ni agregar analítica fuera del alcance.
- [ ] T061A Preparar README de entrega en `README.md` — I1; depende: T061; comprobar: incluye alcance P1–P5, stack, requisitos, variables sin secretos, certificados HTTPS, Compose, migraciones, arranque, scripts de pruebas/rendimiento, datos sintéticos, uso de Mailpit y límites del modo offline; enlaza quickstart y evidencia de verificación.
- [ ] T061B Comprobar README de entrega en `e2e/resultados/readme.md` — I4; depende: T061A; comprobar: otro integrante sigue únicamente README desde entorno limpio, ejecuta instalación, certificados, BD, migraciones, aplicación y pruebas, comprueba enlaces/comandos y registra resultado sin pasos implícitos; corregir README antes de aprobar.
- [ ] T062 Ejecutar puerta final y recorrido del quickstart en `e2e/resultados/cierre.md` — I4; depende: T061B; comprobar: arranque desde entorno limpio, migraciones, V1–V12, todos los scripts de pruebas, lint y tipos verdes; matriz FR-001–031/SC-001–009 con evidencia y SC-009 pendiente de observación si aún no transcurrió el periodo. No cerrar como completo ningún criterio funcional sin verificar.

## Dependencias y estrategia de entrega

Cadena principal: **T001 → T002 → T003 → T004 → base T005–T011 → rojo US1 T012–T015 → implementación US1 T016–T028 (incluida T026A) → medición T028A → T029 (MVP) → US2 T030–T035 → US3 T036–T043 → infraestructura SMTP T043A → US4 T044–T050 → US5 T051–T056 → cierre T057–T062 (incluidas T061A/T061B para README)**. Cada historia empieza con datos propios preparados por fixtures; sus verificaciones no requieren interacción manual con historias posteriores.

El plan permite adelantar P2/P4/P5 contra contrato tras la base. Esta propuesta elige entrega secuencial por prioridad para un equipo de cuatro y para evitar conflictos en controladores, router, textos y scripts. No se marca como paralela una historia que después deba esperar código pendiente. Si se acuerda otra distribución, primero se separan esos puntos compartidos y se recalculan las dependencias; una tarea `[P]` nunca incluye cableado compartido.

Tandas paralelas concretas:

- Tras T005: **T006 (I4) + T007 (I2)**. Infraestructura de pruebas y tests de dominio en rutas diferentes; T008 espera T007 y T009 espera ambas ramas.
- Tras la evidencia roja T015: **T016 (I1) + T017 (I2) + T018 (I3)**. Servicios sin cableado compartido y migración de datos independiente; T019 espera guard y catálogo, T020 espera esos resultados y sesiones; T023 reúne los módulos.

Responsables de entrega: I1 desbloquea infraestructura y acceso; I2 desbloquea API de sesiones/series y dominio; I3 completa catálogo e interfaz; I4 demuestra integración P1 antes de empezar historial y mantiene la evidencia de extremo a extremo. Los cambios de dominio compartido se revisan entre los cuatro y los integra el responsable indicado en cada tarea.

Este documento es una planificación: ninguna casilla significa que se haya implementado o ejecutado una prueba durante su generación.
