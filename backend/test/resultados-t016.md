# Verificación de T016 — Acceso y guard aislados

Fecha: 2026-11-13. Solo T016; sin commit ni cableado en AppModule.

## Contexto

T015 y la base completas; checklist requirements 16/16 sin pendientes. Se revisaron constitución 1.1.0, plan, contrato REST, R-03/R-04/R-21 y evidencia roja T012–T015. Se aplicó la skill local speckit-implement con FEATURE_DIR absoluto. No existe extensions.yml ni hooks que ejecutar.

El servicio, controlador y módulo auth quedan preparados para T023. AppModule sigue sin importar AuthModule. No se modifican pruebas de aceptación ni frontend; no se ejecuta ni declara verde la API integrada de T012 ni el navegador. T016 se marca completa por sus pruebas aisladas, conforme al plan.

## Archivos

| Archivo | Implementación |
|---|---|
| `backend/src/auth/auth.service.ts` | Registro con UUID, hash Argon2id, email canónico en minúsculas, conflicto de email también ante carrera UNIQUE; login con selección explícita del hash; emisión y comprobación JWT; lectura del usuario actual y version_token en cada sesión. |
| `backend/src/auth/auth.validation.ts` | Usa Zod compartido, adaptando contrasena de REST a password del dominio y remapeando errores; valida zona horaria mediante Intl. No duplica reglas de longitud/formato de credenciales ni cambia el contrato. |
| `backend/src/auth/auth.config.ts` | JWT HS256, emisor/audiencia y duración de siete días; JWT_SECRET obligatorio con al menos 32 bytes no vacíos también en dev/test. No hay secreto predeterminado ni excepción por entorno. |
| `backend/src/auth/auth.types.ts` | DTO Usuario de cuatro campos y tipos internos de sesión/acceso; mapper explícito excluye hash, version_token y token. |
| `backend/src/auth/auth.errors.ts` | Error 401 uniforme para cuenta inexistente, contraseña incorrecta y sesión inválida. |
| `backend/src/auth/auth.controller.ts` | registro/login/logout/yo. El token se devuelve exclusivamente en cookie gt_sesion; el cuerpo contiene solo Usuario. Logout elimina la cookie con los mismos atributos de seguridad y path. |
| `backend/src/auth/publico.decorator.ts` | Metadato para endpoints explícitamente públicos. |
| `backend/src/auth/solo-json.guard.ts` | Registro/login exigen Content-Type application/json; formularios URL-encoded devuelven 400 VALIDACION. |
| `backend/src/auth/auth.module.ts` | Repositorio TypeORM, JwtModule, límite 10/minuto por IP/ruta con ThrottlerGuard, controlador y AuthGuard global al importar el módulo. No se importa aún desde AppModule. |
| `backend/src/comun/auth.guard.ts` | Autentica solo cookie firmada, descarta identidad previa, ignora identidad de body/query y bearer; rechaza cookies vacías, duplicadas, mal codificadas y JWT inválidos. Helper exigirPropiedad devuelve el mismo 404 para ajeno y ausente. |
| `backend/test/unitarios/auth.spec.ts` | 17 pruebas aisladas con repositorio en memoria, Argon2id y JWT reales. |
| `backend/test/unitarios/auth-modulo.spec.ts` | 11 pruebas del módulo aislado con HTTPS y repositorio sustituido; sin AppModule ni PostgreSQL. |
| `.env.example` | JWT_SECRET vacío documentado; no se escribe ni revela un secreto real. |
| `specs/001-registro-entrenamientos/tasks.md` | Solo T016 pasa a completa. |
| `backend/test/resultados-t016.md` | Este informe. |

Sin dependencias nuevas ni cambios a package-lock.json, migraciones, entidades, main.ts, AppModule o frontend. `.vscode/` era preexistente y no se modificó.

## Evidencia rojo → verde

1. Se escribieron 17 pruebas nuevas de servicio/guard contra interfaces provisionales sin comportamiento: **17/17 rojas, 0 errores de ejecución**. Fallaban registro/login/sesión pendientes, guard que permitía acceso indebido y propiedad que no rechazaba recursos ajenos.
2. Se implementó el comportamiento y las mismas 17 pruebas quedaron verdes. Después se comprobó el módulo aislado y la serialización de cookies/limitador por HTTPS, añadiendo controles JSON/configuración.
3. El primer intento de abrir Supertest dentro del sandbox dio listen EPERM. No se contó como rojo funcional; se repitió con autorización fuera del sandbox, usando los certificados confiables de T010A.
4. Resultado final: **28/28 pruebas verdes, 2/2 suites, 0 errores de ejecución**, salida 0. No se sustituyen implementaciones de criptografía, guard, controlador ni limitador; solo se sustituye la persistencia para aislar el servicio.

Resultados JSON locales: `/private/tmp/gymtrack-t016-rojo.json` y `/private/tmp/gymtrack-t016-verde.json`. Este informe conserva los conteos sin depender de esos archivos temporales.

## Casos comprobados

- Registro normaliza email, verifica el hash persistido con Argon2id y devuelve DTO sin secretos. JWT solo incluye sub/versionToken y claims estándar; exp−iat = 604800 segundos.
- Login solicita explícitamente hash_contrasena (la entidad lo excluye por defecto), verifica contraseña y permite consultar la sesión propia.
- Email ya existente y carrera UNIQUE de email → 409 EMAIL_EN_USO. No se convierten errores ajenos a esa restricción en conflictos de email.
- Registro inválido por email/contraseña/zona → 400 VALIDACION por campo; errores de password se exponen como contrasena. No se guardan entradas inválidas.
- Contraseña incorrecta y email desconocido → mismo 401 y sin sesión. El email desconocido también recorre una verificación Argon2 con hash ficticio; no se afirma una garantía de tiempo constante extremo a extremo. Hash dañado tampoco concede acceso ni expone detalles.
- JWT expirado, manipulado, de otra clave, con claims ausentes/identidad inválida → 401. Usuario eliminado o version_token diferente → 401. Preferencias e identidad se toman de la fila vigente, no de valores adicionales del JWT/cuerpo.
- Guard rechaza falta de cookie incluso con bearer o identidad inyectada; cookie válida sobrescribe la identidad no confiable. Cookies duplicadas y escape porcentual inválido → 401.
- Propiedad: recurso propio permitido; ajeno y ausente producen 404 idéntico en controlador exclusivo del módulo de pruebas. Los servicios futuros deberán consultar por usuario_id de la sesión y aplicar el helper también a recursos anidados; no se afirma propiedad integrada de rutas aún inexistentes.
- Cookie real serializada por HTTPS en development/test/production: gt_sesion, Secure, HttpOnly, SameSite=Strict, Path=/, Max-Age=604800 y sin Domain. Mismos atributos al borrarla; después /yo devuelve 401.
- Dos agentes HTTPS conservan cookies independientes: cerrar uno no cierra el otro. Logout es borrado de cookie local según R-03; no añade lista de revocación por token ni invalida otros dispositivos. El cambio de version_token revoca sesiones de cuenta, pero su modificación por recuperación se implementará en P4.
- Diez solicitudes/minuto por IP/ruta admitidas al limitador; la undécima devuelve 429 DEMASIADAS_PETICIONES y Retry-After. Cuerpos inválidos cuentan y variar X-Forwarded-For no permite saltarse el límite con la configuración actual. El almacenamiento del limitador es en memoria, como en el módulo oficial previsto por el plan.
- Registro/login rechazan formulario URL-encoded con 400. Acceso público y rutas protegidas se comprueban en el módulo aislado real.
- Los logs capturados contienen solo metodo/ruta/estado/duracionMs, sin email, contraseña ni token. No se añade logging de excepciones/cuerpos. No se modifica localStorage ni hay token en JSON; la comprobación real del navegador queda para su tarea posterior.
- Configuración sin JWT_SECRET, corta o solo espacios falla en todos los entornos. Para T023 deberá configurarse un secreto aleatorio real fuera del repositorio; las pruebas usan uno exclusivamente sintético y restauran el entorno al terminar.

## Comandos y resultados

Ejecutados con Node 22 disponible en caché npm. Las pruebas HTTPS utilizan CA explícita; no desactivan validación TLS ni conectan a PostgreSQL.

```sh
npm run test --workspace backend -- --runTestsByPath test/unitarios/auth.spec.ts test/unitarios/auth-modulo.spec.ts --json --outputFile=/private/tmp/gymtrack-t016-verde.json
npm run lint
npm run typecheck
npm run build --workspace backend
git diff --check
```

| Comprobación | Resultado |
|---|---|
| Servicio/guard y módulo aislado HTTPS | 28/28 verdes, 2 suites. |
| Lint | Verde, sin advertencias. |
| Tipos, incluidos frontend/domain/E2E existentes | Verde. |
| Build backend (con build previo de domain) | Verde. |
| Diff/espacios | Verde. |
| API integrada T012–T014 | No se declara ni busca verde; cableado reservado a T023. |
| Navegador/E2E de auth | No ejecutado; se verifica más adelante, T024–T029. |

No se ejecutó la suite global de aceptación: contiene los rojos deliberados de tareas anteriores y no es el criterio de T016. Esta entrega no aprueba la puerta integrada del MVP. No se hizo commit; pendiente revisión del usuario.
