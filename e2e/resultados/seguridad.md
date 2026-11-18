# T060 — Seguridad y propiedad

Fecha: **2026-11-17, America/Bogota** (ejecuciones finales durante 2026-11-18 UTC).
Estado: **PASS — T060 verificada**. Solo se ejecuta T060. El usuario autorizó expresamente
adelantar esta verificación mientras T059 sigue pendiente; esa excepción afecta al orden,
no a los criterios de seguridad. T059 conserva sus cambios y evidencia; T061 no se inicia.

## Entorno y aislamiento de las pruebas

- macOS 26.5.2 / Darwin arm64; Node 22.23.5; NestJS 11.2.10; TypeORM 0.3.31;
  Vite 6.4.6; Playwright 1.65.0; Chrome **157.0.8103.79**, viewport **360×800**.
- Docker Compose: PostgreSQL 16 y Mailpit v1.27.4, ambos saludables, expuestos solo en loopback.
- API y frontend con certificados locales confiables. Node valida contra la CA local;
  Chrome usa el almacén de confianza del sistema con `ignoreHTTPSErrors: false`.
- Base **gymtrack_test**, esquema temporal exclusivo del proceso, migraciones reales;
  dos cuentas sintéticas nuevas por caso, contraseñas aleatorias y hash Argon2id.
  No se usa la base de desarrollo ni cuentas personales. Se eliminan el esquema y los
  mensajes de esas cuentas después de cada caso. Los servidores web creados por la suite se cierran.
- Módulos, guard, controladores y servicios reales de la aplicación; únicamente se sustituye
  la conexión TypeORM por la del esquema de prueba. No hay endpoints de prueba ni bypass de autorización.

## Criterios y resultados

| Criterio | Evidencia y resultado |
|---|---|
| Propiedad P1–P5 | **PASS**. 30 casos de recursos ajenos, cada uno A→B y B→A: 404 `NO_ENCONTRADO`, `actual: null` y todas las filas de las ocho tablas sin cambios. Incluye UUID reutilizado, padres/hijos mezclados y versiones obsoletas. |
| P1 | **PASS**. Entrenamientos, activa/finalización, ejercicios privados, prellenado, ejercicios realizados y series: lectura, creación, edición y eliminación propias; acceso ajeno rechazado. Catálogo global visible e inmutable. |
| P2/P3 | **PASS**. Historial, filtros, progreso y récords no exponen identificadores ajenos. Caso adicional con el mismo ejercicio global en ambas cuentas: sesiones, prellenado y récords conservan el dueño; 20/150 kg y volúmenes 160/1200 kg no se mezclan. |
| P4 | **PASS**. Preferencias, exportaciones JSON/CSV y eliminación dependen de la cookie. Identidad ajena enviada por cuerpo rechazada; query/cabecera no cambia el dueño. Contraseña de B no elimina A. B y el catálogo se conservan tras borrar A; cascadas y revocación comprobadas. |
| P5 | **PASS**. Listado, detalle, alta, edición, borrado y comienzo desde rutina propios; lectura/escritura de rutina ajena o referencias a ejercicio privado ajeno rechazadas. |
| Ausencia de autenticación | **PASS**. 41 casos sin cookie devuelven 401 sin mutar la BD, incluido crear ejercicio. Cookie manipulada y bearer sin cookie no autentican. |
| Validación del servidor | **PASS**. 12 entradas inválidas devuelven 400 sin mutación: límites/precisión de peso, repeticiones, UUID, fecha con intento de inyección, periodo, unidad, zona IANA, formato, rutina vacía/día y nota excesiva. JSON malformado y formularios rechazados; login, registro y recuperación limitados a diez intentos/minuto. |
| HTTPS | **PASS**. API real en `NODE_ENV=development/test/production`; frontend development y preview test/production; panel/API Mailpit. HTTPS con CA válida funciona; HTTP se rechaza. API rechaza CA no confiable, exige certificados y configura mínimo TLS 1.2. |
| Cookies | **PASS**. Login real en los tres modos: `Secure`, `HttpOnly`, `SameSite=Strict`. Chrome confirma propiedades; `document.cookie` no puede leer `gt_sesion`. |
| Contraseñas y recuperación | **PASS**. Argon2id y token hash SHA-256, TTL de una hora, uso único, caducidad, concurrencia y revocación de sesiones cubiertos también por la regresión de cuenta. Recuperación real vía Mailpit y navegador cambia la contraseña de A y revoca A, conservando B. |
| Logs | **PASS**. 99 casos y 362 entradas del backend comprobadas, más stdout/stderr del frontend. Se capturan los cinco canales console y se rechazan secretos conocidos, emails e identificadores de las cuentas. El log HTTP solo permite método, plantilla de ruta, estado y duración; no cuerpos, query, tokens, hashes ni pesos. Consola del navegador comprobada sin secretos/emails. |
| Repositorio | **PASS**, con excepción pública revisada abajo. 335 archivos actuales (versionados y nuevos no ignorados) y 582 blobs textuales del historial alcanzable. Comparación con 495 valores secretos conocidos y patrones de clave privada, AWS, GitHub y JWT; escaneo de correos. Cero hallazgos pendientes. `.env` está ignorado y no versionado. |
| Almacenamiento local | **PASS en Chrome real**. LocalStorage, sessionStorage, CacheStorage e IndexedDB comprobados antes/después de login, recarga, cola offline, sincronización, logout, cambio A→B, enlace y restablecimiento. Cero contraseñas/tokens o claves de credenciales; cero respuestas API en caché; cero bases IndexedDB. El token del enlace se retira de la URL. |

El almacenamiento local **sí contiene** la copia y cola del entrenamiento y metadatos mínimos de
sesión (id/email/unidad/zona) previstos por el plan para funcionar offline. La comprobación exige
que no contengan contraseñas ni tokens; no afirma que localStorage esté vacío ni libre de todos
los datos del usuario. Las cookies HttpOnly contienen la sesión por diseño.

## Hallazgos iniciales y resolución

Primera ejecución: **95/97 PASS**, dos fallos conservados en
`test-results/t060/primera-seguridad.log`, `primera-resultados.json` y `primera-repositorio.json`.
No se modificó código de producción para resolverlos:

1. El arnés esperaba siempre el título Entrenar tras el login de B. La aplicación puede regresar
   a Cuenta, ruta protegida recordada tras logout. Se espera la salida de login y se navega
   explícitamente a Entrenar. Se mantiene la exigencia de respuesta 200 y cookie real.
2. Cuatro avisos del escáner correspondían a un contacto público de soporte en avisos `glob`
   de `package-lock.json` y tres blobs históricos. No son datos de usuarios ni credenciales.
   La excepción solo afecta a correos en los campos `packages[node_modules/glob].deprecated`
   y `packages[node_modules/typeorm/node_modules/glob].deprecated`, con estas huellas SHA-256 exactas:
   `55485ce46ec1f7d3378548cbc9d651e489f775e5b19ce47544e7c1de8782b504` y
   `d81cf0371c03b2377fa98e6637e518eda198e83fb8eeaae8c9757f35b99a4a2c`.
   Los secretos conocidos y patrones se buscan siempre sobre el texto original, sin excepción.
   No se ha excluido un archivo completo, dominio ni historial.

Reejecución focalizada: **2/2 PASS** (95 omitidos por el filtro de selección, no por `skip` en código).
Primera ejecución completa verde: **147/147 PASS**, cuatro suites, sin omitidos
(97 T060 + 28 cuenta + 11 autenticación integrada + 11 módulo de autenticación).
Tras ampliar la cobertura: **99/99 PASS T060**, sin omitidos; junto a las 50 pruebas de regresión
anteriores, **149 casos distintos verificados**.

## Comandos y artefactos

Desde la raíz, con Node 22.23.5 en PATH y los servicios Compose ya disponibles:

```sh
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
npm run build --workspace @gymtrack/frontend
npm run test --workspace backend -- --runTestsByPath test/integracion/seguridad.e2e-spec.ts --json --outputFile=../test-results/t060/seguridad-final.json
npm run test --workspace backend -- --runTestsByPath test/integracion/seguridad.e2e-spec.ts test/integracion/cuenta.e2e-spec.ts test/integracion/auth.e2e-spec.ts test/unitarios/auth-modulo.spec.ts --json --outputFile=../test-results/t060/resultados.json
npm run typecheck --workspace backend
npm run lint
git diff --check
```

Build, tipos, lint y diff: **PASS**. Checklist de requisitos: **16/16**, sin modificar marcadores.
No existen hooks de extensiones para esta ejecución. La suite necesita el build frontend previo,
certificados confiables y los servicios locales; falla si estos requisitos no están disponibles.

Artefactos locales ignorados en `test-results/t060/`: `seguridad-final.json/.log`,
`resultados.json`, `seguridad.log`, `repositorio.json`, `logs.json`, `navegador.json`,
`navegador-diagnostico.json`, `build-frontend.log`, `tipos.log`, `lint.log` y evidencia inicial.
El diagnóstico solo guarda etapa, método, plantilla de ruta y estado, sin cuerpos, cabeceras ni query.
Se comprobó además la evidencia generada contra secretos del entorno y patrones JWT/clave privada/hash,
sin coincidencias. No se guardan contraseñas, JWT, tokens de recuperación ni correos de cuentas en este informe.

## Límites y pendientes

- **T060: ningún criterio pendiente en los entornos del proyecto comprobados.** No hay despliegue
  público de producción que pueda auditarse; `production` se ejecutó localmente con TLS real.
  Esto no certifica infraestructura futura, navegadores no ejecutados ni logs de sistemas externos.
- El escaneo cubre archivos textuales actuales no ignorados e historial Git alcanzable, valores
  conocidos y patrones indicados. No es una garantía de detectar cualquier secreto desconocido,
  ni abarca objetos Git inalcanzables o archivos externos al repositorio.
- **T059 sigue pendiente** de su evidencia manual y de navegadores, según sus informes conservados:
  [calidad](calidad.md), [navegadores](t059-navegadores.md) y [guion manual](t059-revision-manual.md).
  Ninguna intervención manual adicional bloquea T060. No se marca T059.
- **T061 no iniciada**. Cambios de T060: suite de seguridad, este informe y marcador T060 de tasks.
  Sin cambios de producción, commit ni push; pendiente de revisión del usuario.

---

## Registro previo conservado (superado por la autorización y ejecución anteriores)

### Estado anterior de T060

Fecha: 2026-11-17, America/Bogota. **Estado: no iniciada, pendiente de cerrar T059.**

La solicitud establece completar T059 antes de ejecutar T060. `tasks.md` también establece esa
dependencia. La evidencia de [calidad](calidad.md) sigue parcial: faltan resultados de VoiceOver,
revisión manual completa y matriz de las dos versiones de cada navegador en móvil/escritorio.
Por ello no se marca T060, no se presenta seguridad como verificada y no se ha creado todavía
`backend/test/integracion/seguridad.e2e-spec.ts`.

| Criterio T060 | Resultado en esta ejecución |
|---|---|
| Dos cuentas sintéticas; matriz de operaciones propias/ajenas P1–P5 | No ejecutado |
| Validación de entradas en el servidor | No ejecutado como auditoría T060 |
| HTTPS en todos los entornos web | No auditado por T060; el entorno local T059 se abrió por HTTPS |
| Cookies Secure y demás propiedades de sesión | No auditado |
| Ausencia de secretos/PII en logs y repositorio | No auditado; no se declara un análisis global por los JSON limitados de T059 |
| Contraseñas/tokens ausentes de almacenamiento local | No auditado |

Una vez recibida la evidencia pendiente y cerrada T059 se escribirá/ejecutará la suite indicada,
con PostgreSQL de pruebas y dos cuentas sintéticas, y se registrarán comandos, entornos,
resultados reales y hallazgos. Las pruebas de almacenamiento requieren además navegador y
no se deducirán solo de un test REST. No se utilizarán cuentas ni datos personales reales.

Comandos T060 ejecutados: **ninguno**. Cambios de aplicación por T060: **ninguno**.
No hay commit ni push. El trabajo de T059 y la intervención requerida constan en
[el guion manual](t059-revision-manual.md).

## Actualización de la continuación autónoma

El agente ejecutó la matriz Chrome/Edge y el inventario de versiones/VoiceOver documentados en
[t059-navegadores.md](t059-navegadores.md). Las suites funcionales ya existentes incluyen comprobaciones
de acceso/cookies/exportación; esas comprobaciones dentro de T059 **no sustituyen** la auditoría global
T060 ni su matriz de operaciones P1–P5. T059 aún carece de la evidencia restante de lector y Safari/Firefox.
Por ello no se crea ni se ejecuta prematuramente `seguridad.e2e-spec.ts` ni se marca T060.
