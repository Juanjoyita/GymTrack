# Verificación de T012 — Aceptación de acceso en rojo

Fecha: 2026-11-13. Solo T012. Sin implementación de autenticación ni commit.

## Alcance y prerrequisitos

T001–T011, incluida T010A, completas; checklist requirements 16/16, cero pendientes. Prerrequisitos Spec Kit resueltos con FEATURE_DIR absoluto. Se revisaron constitución 1.1.0, plan, spec, contrato REST y decisiones R-03/R-04. Se aplicó la skill local speckit-implement. No existe extensions.yml ni hooks que ejecutar.

T012 se marca completa porque se escribieron y ejecutaron sus pruebas **rojas**, no porque exista autenticación. No se anticipan T013–T015 ni T016/T023/T024/T029. Las pruebas conservan expectativas de éxito/rechazo contractuales, sin skip, test.fail, inversión de aserciones ni mocks de autenticación. La suite global queda intencionalmente roja: no constituye una puerta de integración aprobada.

## Archivos

- `backend/test/integracion/auth.e2e-spec.ts`: 11 casos Jest/Supertest sobre AppModule real, HTTPS y CA explícita. Fixture de cuenta con hash Argon2id y esquema aislado por proceso/caso en gymtrack_test. Sustituye únicamente el proveedor DataSource de pruebas, no controladores, servicios ni guards.
- `e2e/tests/auth.spec.ts`: 6 casos Playwright sobre frontend/API reales, Chrome estable a 360×800, timezone America/Bogota, HTTPS confiable y almacenamiento separado en segundo contexto. Cuenta existente y correo nuevo con UUID por caso.
- `specs/001-registro-entrenamientos/tasks.md`: solo T012 marcada.
- `backend/test/resultados-t012.md`: este informe y evidencia de ejecución.

No se modifican backend/src, frontend/src, esquemas compartidos, scripts, dependencias, contrato ni configuración E2E. `.vscode/` era preexistente y permanece sin cambios.

## Resultado REST: 11/11 rojos

Ejecución final: **1 suite fallida, 11 pruebas fallidas, 0 suites con errores de ejecución**, salida 1. La aplicación, migración, fixture y handshake HTTPS se inicializan correctamente en cada caso.

| Caso | Rojo observado |
|---|---|
| Registro, cookie segura, hash y sesión propia | POST /auth/registro: 404 en vez de 201. |
| Login de cuenta existente | POST /auth/login: 404 en vez de 200. |
| Logout autenticado | Bloqueado en login previo: 404 en vez de 200; no alcanza todavía POST logout ni la verificación posterior. |
| Otro dispositivo y logout independiente | Bloqueado en login previo: 404 en vez de 200; las dos sesiones aún no se ejercitan. |
| Contraseña incorrecta y email desconocido | Ambas peticiones se ejecutan: [404,404] en vez de [401,401]; la igualdad del mensaje queda pendiente. |
| /auth/yo sin sesión | 404 en vez de 401. |
| /entrenamientos/en-curso sin sesión | 404 en vez de 401. Solo se prueba el requisito de acceso, no el comportamiento de entrenamientos de T013. |
| Logout sin sesión (independiente del login) | POST /auth/logout: 404 en vez de 401. |
| Cookie manipulada | GET /auth/yo: 404 en vez de 401. |
| Registro inválido por email/contrasena | 404 en vez de 400 VALIDACION. |
| Email registrado | 404 en vez de 409 EMAIL_EN_USO. |

Las aserciones futuras también exigen DTO Usuario sin hash/token, cookie gt_sesion HttpOnly/Secure/SameSite=Strict/Path=/, Argon2id verificable en registro, sesión después del login, cierre de sesión y conservación de acceso en otro dispositivo. Esas aserciones **no quedaron verificadas**: las rutas de auth aún no están registradas. La aceptación HTTP debe pasar tras T023, como exige tasks.md.

Se usa `contrasena`, de acuerdo con el contrato. Los esquemas base T008 exportan actualmente `password`; T012 no cambia ese código ni el contrato. La integración de auth deberá resolver esa diferencia respetando la entrada REST aprobada y los errores por campo.

## Resultado E2E: 6/6 rojos

Ejecución final: **6 fallos inesperados para el runner (el rojo funcional buscado), 0 omitidos, 0 flaky y 0 errores globales de configuración**, salida 1. Frontend/API HTTPS y navegador arrancan sin excepciones TLS.

| Caso | Rojo observado |
|---|---|
| Registro mediante formulario | En /registro falta el campo accesible de email; timeout de acción de 3 s. |
| Login y recarga | En /login falta el formulario; timeout de 3 s. |
| Logout desde cuenta | Bloqueado en el formulario de login ausente. |
| Otra sesión de navegador | Bloqueado en el primer formulario de login; no alcanza aún la creación del segundo contexto. |
| Credenciales inválidas | Bloqueado en el formulario ausente; comparación de avisos pendiente. |
| Acceso sin sesión | La raíz aún muestra el shell sin pedir login, y /api/auth/yo devuelve 404 NO_ENCONTRADO en vez de 401 NO_AUTENTICADO. Las aserciones soft ejecutan ambas comprobaciones y mantienen el caso rojo. |

Los localizadores usan etiquetas/roles accesibles en español. Se eligen /registro y /login como rutas de UI para esta aceptación; el contrato REST no fija rutas de frontend. Deberán coordinarse con las páginas de T024, sin reducir los requisitos de comportamiento. No se implementan páginas para hacerlas pasar en T012. La aceptación E2E queda pendiente hasta integrar las pantallas y comprobar T029.

Capturas y contexto de fallos: `test-results/e2e/auth-*/test-failed-1.png` y `error-context.md`, ignorados por Git. Resultados completos de esta ejecución: `/private/tmp/gymtrack-t012-backend.json` y `/private/tmp/gymtrack-t012-e2e.json` (artefactos locales temporales). Este informe conserva los conteos y causas sin depender de esos temporales.

## Aislamiento, privacidad y limpieza

- Credenciales y correos exclusivamente sintéticos example.invalid, sin secretos reales.
- REST reutiliza el helper seguro de T006 para crear/migrar y eliminar únicamente t006_infraestructura_<pid> en gymtrack_test. Cada prueba crea una app nueva para aislar sesiones y el futuro limitador de peticiones. No modifica el AppModule productivo.
- E2E usa public de gymtrack_test porque allí conecta el servidor real de T011. Aplica migraciones idempotentes sin borrar filas preexistentes; cada caso crea un usuario con UUID y reserva un segundo email UUID para registro. Su limpieza exige gymtrack_test y elimina solo esos dos emails exactos con prefijo T012. No usa TRUNCATE ni borra el esquema public.
- Consulta final de solo lectura: **0 usuarios T012 restantes y 0 esquemas de integración restantes**, base gymtrack_test. No se accedió a desarrollo para crear/limpiar fixtures.
- TLS conserva todas las comprobaciones y la CA de T010A. No se imprimen cookies/JWT en las aserciones de flags; los logs HTTP observados contienen únicamente metadatos y los 404, sin cuerpos ni credenciales.

## Comandos reproducibles

Con Node 22, certificados confiables de T010A, .env local configurado, PostgreSQL disponible y puertos 3000/5173 libres:

```sh
npm run test --workspace backend -- --runTestsByPath test/integracion/auth.e2e-spec.ts --json --outputFile=/private/tmp/gymtrack-t012-backend.json
PLAYWRIGHT_JSON_OUTPUT_FILE=/private/tmp/gymtrack-t012-e2e.json npm run test:e2e -- auth.spec.ts --reporter=list,json
npm run lint
npm run typecheck
git diff --check
```

Ambos comandos de aceptación terminan con **código 1 esperado**. Lint y tipos (incluido E2E) terminan con **código 0**; diff sin errores de espacios. Se corrigió una conversión de tipo del header Set-Cookie detectada durante la preparación; la corrida final no tiene errores de tipos/configuración. Las pruebas con puertos, PostgreSQL y Chrome se ejecutaron con autorización fuera del sandbox.

No se ejecuta implementación para corregir estos fallos ni se declara verde la aceptación. No se hace commit; queda pendiente revisión del usuario.
