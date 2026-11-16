# US4 — Evidencia roja T044

> Evidencia histórica de T044. La implementación posterior de API y sus resultados verdes se documentan en [T045–T048](../../backend/test/resultados-t045-t048.md). T049/T050 siguen pendientes.

Fecha: 2026-11-16 (America/Bogota). Rama: `001-t044-pruebas-cuenta`.
Alcance: **solo T044**, aceptación previa a implementar US4. Sin commit; pendiente de revisión.

## Puertas y alcance

- Constitución 1.1.0, plan, spec US4, contrato REST, data-model y research R-05/R-06/R-17/R-18/R-19/R-21 revisados.
- Prerrequisitos de Spec Kit válidos; `requirements.md`: 16/16, sin pendientes.
- T043A completada y SMTP comprobado de nuevo antes de la aceptación roja.
- No existe `.specify/extensions.yml`: no hay hooks previos ni posteriores.
- No se implementan servicios, rutas ni pantallas de T045–T049. Contrato, dependencias y esquema sin cambios.
- Se marca únicamente T044 como completada: su resultado requerido es el rojo por comportamiento pendiente.
  **US4 no está aceptada ni lista para integrar**; la puerta verde corresponde a T048/T050.

## Archivos

| Archivo | Cambio |
|---|---|
| `backend/test/integracion/cuenta.e2e-spec.ts` | 17 casos REST reales con NestJS/Supertest sobre HTTPS y esquema aislado |
| `e2e/tests/cuenta.spec.ts` | 6 casos Playwright móviles, sin simular API ni correo |
| `backend/test/utils/cuenta-fixtures.ts` | Dos cuentas sintéticas, datos relacionados, instantáneas, limpieza exacta y lectura CSV con comillas/saltos |
| `backend/test/utils/correo.ts` | Consulta de mensajes por destinatario para verificar ausencia y limpiar solo correos del caso |
| `specs/001-registro-entrenamientos/tasks.md` | Solo T044 marcada |
| `e2e/resultados/us4.md` | Este informe versionable de fallos y alcance |

Los fixtures contienen un ejercicio propio compartido entre rutina y entrenamiento, dos entrenamientos
(uno vacío), dos series (60.1250 kg/8 repeticiones y 0 kg/100 repeticiones), notas con comas,
comillas y salto de línea, y un token sintético almacenado como SHA-256. La cuenta ajena tiene el
mismo conjunto de datos y debe conservarse intacta. El catálogo global también debe sobrevivir al borrado.
No se necesita implementar US5 para preparar las filas de rutina.

## Ejecución reproducible

Node **22.23.5**; PostgreSQL 16 y Mailpit saludables en Docker Compose.
Frontend de producción servido por HTTPS; Chrome, viewport 360×800 y zona America/Bogota.
Certificados validados; no se ignoran errores TLS.

```sh
npm run test --workspace backend -- --runTestsByPath test/infraestructura/correo.e2e-spec.ts
npm run test --workspace backend -- --runTestsByPath test/infraestructura/correo.e2e-spec.ts test/integracion/auth.e2e-spec.ts test/integracion/cuenta.e2e-spec.ts --json --outputFile=../test-results/t044/rest.json
npm run test:e2e -- cuenta.spec.ts
npm run typecheck
npm run lint
git diff --check
```

Para conservar también la salida, redirigir el segundo comando a `test-results/t044/rest.log`
y el tercero a `test-results/t044/e2e.log` (crear previamente el directorio).
En esta sesión los comandos con red local/Chrome requirieron salir del sandbox. El primer intento
SMTP dentro del sandbox falló por acceso local restringido; **no se cuenta como rojo funcional**.
Se repitió con los permisos necesarios y pasó.

| Verificación final | Resultado |
|---|---|
| SMTP aislado antes del rojo | **1/1 verde**, entrega real por SMTP, lectura API y panel HTTPS |
| Regresión REST de acceso + SMTP | **12/12 verdes** (11 acceso + 1 correo) |
| Aceptación REST US4 | **17/17 rojas**, rutas pendientes responden 404 |
| Aceptación móvil US4 | **6/6 rojas**, faltan controles/pantallas de US4 |
| Typecheck de backend, frontend, dominio y E2E | Verde |
| Lint | Verde |
| `git diff --check` | Verde |

Los runners de aceptación salen con código 1 deliberadamente; no hay `skip`, `fixme`, mocks,
`test.fails` ni inversión de aserciones para ocultarlo.

## Fallos guardados por comportamiento pendiente

| Casos REST | Esperado | Observado / tarea que lo implementará |
|---|---|---|
| Preferencias kg → lb → kg | 200, preferencia persistida, pesos y fechas idénticos en BD, ajenos intactos | 404 en PATCH `/api/cuenta/preferencias`; T047 |
| Exportación JSON y CSV (2 casos) | 200, attachment, datos propios completos, JSON con rutinas/sesión vacía, CSV de dos series, notas preservadas, sin hashes/tokens | 404 en GET `/api/exportacion`; T047 |
| Eliminación total | 204, cookie borrada, cero filas de las ocho tablas propias, catálogo/ajenos intactos, dos sesiones revocadas | 404 en DELETE `/api/cuenta`; T048 |
| Eliminación con contraseña incorrecta | 401, datos y sesión conservados | 404; T048 |
| Acceso sin sesión (3 casos) | 401 en preferencias/exportación/eliminación | 404; T047/T048 |
| Solicitud de recuperación | 202 y mensaje contractual idéntico para conocido/desconocido; solo conocido recibe correo, hash SHA-256 y TTL 3600000 ms | 404 en POST `/api/auth/recuperar`; T045/T046 |
| Restablecimiento vigente y reutilización | 204 una vez, nueva contraseña válida, anterior inválida, ambas sesiones revocadas, reutilización 410 | 404 en POST `/api/auth/restablecer`; T046 |
| Usado / expiración a 1 h / más de 1 h / desconocido (4 casos) | 410 ENLACE_INVALIDO, ninguna mutación | 404; T046 |
| Token de 59 minutos | 204, nueva contraseña válida antes de cumplirse la hora | 404; T046 |
| Solicitar segundo enlace | 202, enlace anterior rechazado con 410 | 404 en recuperar; T046 |
| Consumo concurrente | Un 204 y un 410 | Dos 404; T046 |

La expiración se prepara mediante fechas de BD para no esperar una hora. El caso de límite fija
`expira_en=now()` y lo intenta consumir después; comprueba rechazo desde la expiración, sin
pretender medir precisión de reloj ni tiempos de respuesta indistinguibles.

| Casos de navegador | Fallo observado |
|---|---|
| Cambio de unidad y visualización en historial | No existe control etiquetado «Unidad de peso» |
| Descargas JSON/CSV | No existe botón de exportación JSON; no se produce descarga |
| Cancelar/confirmar eliminación | No existe botón «Eliminar cuenta» |
| Recuperación, correo, cambio y reutilización | No existe enlace de recuperación desde login |
| Enlace caducado | No existe formulario de nueva contraseña en `/restablecer` |
| Accesibilidad de preferencias/recuperación | No existe control de unidad; no llega a ejecutar axe |

BD, migraciones, sesión y consultas HTTPS de Mailpit se ejecutan antes de las aserciones rojas.
Los fallos son de funciones ausentes, no de conexión, compilación o arranque.
Las aserciones posteriores a cada primer fallo quedan escritas pero **todavía no se verifican**:
por ejemplo, SMTP sintético verde no demuestra que la aplicación envíe recuperación, ni el rojo
por formulario ausente demuestra aún rechazo de tokens o accesibilidad.

## Evidencia local y límites

- `test-results/t044/rest.json`: resultado estructurado de los 29 tests REST/infraestructura.
- `test-results/t044/rest.log`: salida del runner con resultados y aserciones fallidas.
- `test-results/t044/e2e.log`: salida de los seis casos móviles y sus causas.
- `test-results/e2e/**/error-context.md`: contexto de los controles/pantallas ausentes.
- `test-results/mailpit/correo-sintetico-https.png`: captura de infraestructura SMTP.

`test-results/` está ignorado por Git; este informe conserva la evidencia resumida versionable.
Capturas, vídeo y trace desactivados en los casos de cuenta para evitar registrar enlaces de
recuperación. Las comparaciones de instantáneas completas emiten booleanos y no hashes/tokens.
REST usa un esquema aislado y lo elimina al terminar; E2E usa únicamente `gymtrack_test.public`
y borra por UUID/email exactos sus dos cuentas y sus correos, sin vaciar buzones ni tablas globales.
La exportación se lee desde la descarga real del navegador, sin sustituirla por llamadas a API.

La revisión manual de teclado/foco, WCAG completa, inspección de exportaciones y verde funcional
quedan para T050, cuando existan las pantallas. No se declara US4 verde y no se integra ni se hace commit.
