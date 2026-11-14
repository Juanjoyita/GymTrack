# Verificación de T023 — Integración REST de P1

Fecha: 2026-11-14. Solo T023. Sin commit.

## Alcance

T017–T022 completas, con evidencia roja de aceptación T012–T015 y servicios aislados disponibles. Se revisaron constitución 1.1.0, plan y contrato REST; checklist requirements 16/16 sin pendientes. Prerrequisitos Spec Kit resueltos con FEATURE_DIR absoluto y skill local speckit-implement. No existe extensions.yml ni hooks que ejecutar.

Se integran acceso, catálogo, entrenamiento en curso, operaciones anidadas de ejercicios/series y prellenado. La autenticación y el guard global se ejecutan ahora desde AppModule real. No se implementan pantallas, historial P2, progreso, rutinas, cuenta avanzada ni escenarios E2E de navegador.

## Archivos

| Archivo | Cambio |
|---|---|
| `backend/src/app.module.ts` | Registra AuthModule, EjerciciosModule y EntrenamientosModule junto con TypeORM. |
| `backend/src/auth/auth.module.ts` | Actualiza comentario de integración; mantiene guard global, JWT y limitación de intentos. |
| `backend/src/entrenamientos/entrenamientos.module.ts` | Declara repositorios, servicios, presentación y controlador P1. |
| `backend/src/entrenamientos/entrenamientos.controller.ts` | Conecta POST/GET en-curso/PATCH/DELETE/finalizar y POST/PATCH/DELETE anidados; toma usuario de la sesión, valida entradas, aplica versiones y códigos 200/201/204; transforma actual de conflictos al DTO contractual. |
| `backend/src/entrenamientos/entradas.ts` | Valida objetos, UUID, enteros/versiones, fechas ISO no futuras, notas y forma de pesoEntrada antes de llamar a servicios. Reutiliza validación de fecha compartida. |
| `backend/src/entrenamientos/presentacion.ts` | Mapea nombres SQL a campos REST, numeric a número, ordena ejercicios/series y calcula resumen con calcularVolumen compartido. No devuelve usuario_id ni nombres SQL. |
| `backend/src/ejercicios/ejercicios.module.ts` | Registra UltimaSesionService. |
| `backend/src/ejercicios/ejercicios.controller.ts` | Expone GET /ejercicios/:id/ultima-sesion; devuelve JSON null explícito si no hay antecedente. |
| `backend/src/entrenamientos/ejercicios-realizados.service.ts` | Añade crearConEstado para distinguir inserción/reintento de forma atómica y emitir 201/200. Conserva interfaz crear utilizada por pruebas previas. |
| `backend/src/entrenamientos/sesiones.service.ts` | Finalizar comprueba versión bajo bloqueo de la transacción; fin anterior a inicio devuelve 400 VALIDACION. |
| `backend/src/entrenamientos/series.service.ts` | Editar sin nuevo peso conserva kg canónicos de cuatro decimales; no vuelve a aplicarles el límite de dos decimales de entrada original. |
| `backend/jest.config.cjs`, `backend/test/setup-env.ts` | Secreto JWT aleatorio efímero del runner de pruebas cuando no se suministra uno; no modifica .env ni introduce un secreto predeterminado en producción. |
| `backend/test/integracion/conexion.e2e-spec.ts` | Marca público únicamente el controlador exclusivo de prueba de conexión, ahora que AppModule incorpora el guard global. |
| `backend/test/integracion/registro.e2e-spec.ts` | Corrige dos fixtures incompatibles con el modelo/contrato; añade cuatro casos HTTP de integración y verificaciones de resumen/fin inválido. |
| `specs/001-registro-entrenamientos/tasks.md` | Solo T023 se marca completa. |
| `backend/test/resultados-t023.md` | Este informe. |

Sin dependencias nuevas, cambios de contrato, migraciones, esquema ni frontend. `.vscode/` era preexistente y no se modificó.

## Rutas integradas

- Acceso: POST /auth/registro, /auth/login, /auth/logout; GET /auth/yo.
- Catálogo: GET/POST /ejercicios; PATCH/DELETE /ejercicios/:id; GET /ejercicios/:id/ultima-sesion.
- Sesión: POST /entrenamientos; GET /entrenamientos/en-curso; PATCH/DELETE /entrenamientos/:id; POST /entrenamientos/:id/finalizar.
- Ejercicios realizados: POST /entrenamientos/:id/ejercicios; PATCH/DELETE /entrenamientos/:id/ejercicios/:erId.
- Series: POST /entrenamientos/:id/ejercicios/:erId/series; PATCH/DELETE de la serie anidada.

Base /api. No se añaden GET de lista/detalle de historial P2. Correcciones de fechas por PATCH y rutinaId no nulo quedan para sus tareas; P1 permite registro pasado mediante POST con inicio/fin.

## Evidencia de integración

Primera ejecución de la suite completa tras registrar módulos: **133/137 pruebas verdes**, T012 y T014 ya verdes. Los cuatro fallos de T013 se debían a:

1. El fixture de catálogo insertaba es_catalogo (columna inexistente) y omitía nombre_normalizado. Se corrigió usando usuario_id NULL y nombre normalizado, como el modelo aprobado.
2. El caso de finalizar esperaba conservar un entrenamiento sin ninguna serie. Se añadió una serie real al fixture y se conservaron sus expectativas de finalización/nota/fechas. Se añadió además un caso independiente que exige descartar el entrenamiento vacío y devolver 204 al recuperar el activo, según el contrato.

No se cambian respuestas productivas para conservar entrenamientos vacíos ni se elimina la comprobación original de finalización.

La cobertura HTTP adicional mostró dos fallos funcionales (ambos en rojo antes de corregirse):

- Sin antecedentes, Nest serializaba el retorno null como cuerpo vacío; ahora el endpoint devuelve JSON null.
- Editar solo repeticiones de una serie ingresada en lb rechazaba los kg canónicos por sus decimales. Ahora conserva el peso persistido y valida los dos decimales solo cuando llega un nuevo pesoEntrada.

## Resultado final

`npm run test:backend`: **143/143 pruebas verdes, 14/14 suites, salida 0**.

| Aceptación REST | Resultado |
|---|---|
| T012 — auth.e2e-spec.ts | **11/11 verdes**: registro, login, logout, sesiones independientes, credenciales inválidas, validación, duplicados y ausencia/manipulación de sesión. |
| T013 — registro.e2e-spec.ts | **13/13 verdes**: siete casos originales con fixtures corregidos, cuatro casos de integración y dos regresiones concurrentes. |
| T014 — ejercicios.e2e-spec.ts | **14/14 verdes**: catálogo, búsqueda normalizada, recientes, CRUD propio, validación, duplicados, bloqueo en uso y aislamiento. |
| Otras pruebas backend existentes | Verdes, incluidos servicios aislados, criptografía/guard/cookies, migraciones, catálogo y persistencia/concurrencia. |

Los cuatro casos añadidos comprueban: 204 sin activo y descarte vacío; POST idempotente de sesión/ejercicio realizado; prellenado propio tras finalizar/reingresar y aislamiento del otro usuario; conservación de peso lb→kg con conflictos de versión y DELETE de serie/ejercicio/sesión. El caso de conflictos comprueba que actual usa campos REST y no peso_kg, y que finalizar con versión vieja no descarta ni altera la sesión.

Cookie gt_sesion Secure/HttpOnly/SameSite Strict/Path=/ comprobada por la aceptación T012 sobre la API integrada HTTPS, además de los casos aislados de T016. Los logs HTTP conservan solo metadatos; no se añade logging de cuerpos, credenciales o tokens.

## Comandos y entorno

Node 22 y certificados confiables de T010A; PostgreSQL local de pruebas. Suite ejecutada con autorización fuera del sandbox para puertos HTTPS y conexión PostgreSQL. Los fixtures y limpieza mantienen gymtrack_test y sus esquemas aislados; no se modifica desarrollo.

```sh
npm run test:backend
npm run lint
npm run typecheck
npm run build --workspace backend
git diff --check
```

Todos terminaron con salida 0 en la verificación final. Log completo de la ejecución verde: `/private/tmp/gymtrack-t023-concurrencia-backend.log` (artefacto local temporal). Lint sin errores/advertencias; tipos incluyen los tres workspaces y E2E; build backend compila domain previamente.

Para arrancar la aplicación fuera de Jest, JWT_SECRET sigue siendo obligatorio y debe configurarse como secreto real aleatorio en el entorno local/de entrega, tal como documenta .env.example desde T016. El secreto efímero añadido pertenece exclusivamente al runner y no cambia esa política.

No se ejecutó navegador ni se declara verde T024–T029. La aceptación REST de P1 sí queda verificada; no implica la puerta MVP completa. Sin commit; pendiente revisión del usuario.

## Corrección acotada: creación concurrente de entrenamientos

Solicitud de revisión aplicada sin commit, conservando el resto de T023:

- `SesionesService.iniciarConEstado` usa INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *. No usa save, upsert con UPDATE ni consulta previa a la inserción. Una fila existente nunca se actualiza durante creación/reintento.
- Solo después de no insertar (o resolver la restricción de activo) se consulta el UUID existente: propietario actual → creado:false/200; otra cuenta → 404. UUID insertado → creado:true/201. UUID distinto con otra sesión activa conserva 409 ENTRENAMIENTO_EN_CURSO.
- El controlador consume ese resultado y elimina su consulta previa y captura genérica de 23505. La interfaz iniciar que devuelve la fila sigue disponible para los consumidores de servicio anteriores.
- `registro.e2e-spec.ts` añade dos variantes de regresión HTTPS/SQL real: solicitudes simultáneas del mismo usuario con datos distintos y solicitudes de dos cuentas para el mismo UUID. Una barrera de planificación sobre el antiguo save reprodujo determinísticamente el fallo, sin simular resultados SQL: fechas, nota, zona y versión cambiaban; con dos cuentas también cambiaba usuario_id. Ambas variantes quedaron rojas antes de corregir producción.
- La implementación atómica ya no usa save. Las variantes ahora exigen respectivamente [200,201] y [201,404], una sola fila, propietario/datos/versión originales del ganador y snapshot completo intacto tras reintentos. También comprueban 404 para un UUID ajeno aunque la cuenta que reintenta tenga otra sesión activa.
- Se adaptaron únicamente los mocks de inserción en `unitarios/sesiones.service.spec.ts` al INSERT directo, conservando las comprobaciones de los errores de unicidad.

Comprobación final: npm run test:backend → **143/143 verdes, 14 suites, salida 0** (8,175 s). Incluye T012–T014 y la prueba existente de dos UUID distintos con [201,409]. Lint, tipos y diff también verdes. Evidencia roja de las dos variantes: `/private/tmp/gymtrack-t023-concurrencia-rojo.log`. Todos los cambios siguen sin commit para revisar y subir T023 junta.
