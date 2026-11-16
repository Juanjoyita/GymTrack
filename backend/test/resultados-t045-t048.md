# T045–T048 — Correo, recuperación y cuenta: API verde

Fecha: 2026-11-16 (America/Bogota). Rama: `001-t045-api-cuenta`.
Estado: tareas completadas en orden **T045 → T046 → T047 → T048**. Sin commit; pendiente de revisión.

## Alcance y conformidad

Constitución 1.1.0, plan, contrato REST, modelo, US4/V10 y research R-05/R-06/R-17/R-18/R-19/R-21
revisados. Prerrequisitos de Spec Kit válidos; checklist `requirements.md` 16/16, sin pendientes.
No existe `.specify/extensions.yml`: no hay hooks antes/después de implementación.
Se verificaron los archivos de exclusión existentes; no se añaden dependencias, migraciones ni excepciones al plan.
Únicamente T045–T048 pasan a completadas en tasks.md. T049/T050 permanecen pendientes.

## Archivos de aplicación

| Archivo(s) | Resultado |
|---|---|
| `backend/src/correo/correo.config.ts`, `correo.service.ts`, `correo.module.ts` | Nodemailer configurable, SMTP local en desarrollo/pruebas; TLS implícito o STARTTLS exigido en producción; sin logger/debug ni propagación de errores sensibles |
| `backend/src/auth/recuperacion.service.ts` | Tokens aleatorios de 32 bytes; solo SHA-256 en BD; TTL de una hora; transacciones y bloqueo de usuario para emisión, invalidación y consumo |
| `backend/src/auth/auth.controller.ts`, `auth.module.ts` | Rutas públicas recuperar/restablecer registradas, JSON y limitación de intentos; integración del servicio de correo |
| `backend/src/auth/auth.cookie.ts` | Opciones compartidas para crear/borrar la cookie HttpOnly, Secure y SameSite Strict |
| `backend/src/cuenta/cuenta.service.ts` | Preferencias parciales, exportación completa consistente y borrado transaccional con contraseña actual |
| `backend/src/cuenta/cuenta.controller.ts`, `cuenta.module.ts` | Rutas protegidas preferencias/exportación/eliminación; attachment con nombre contractual y `Cache-Control: no-store`; cookie borrada solo tras confirmar la transacción |
| `backend/src/app.module.ts` | CuentaModule integrado en T048 |
| `backend/src/comun/zod-validation.pipe.ts` | Conserva el tipo de salida del esquema Zod, sin cambiar validación ni formato de errores |
| `packages/domain/src/validacion/auth.ts`, `validacion/cuenta.ts`, `index.ts` | Validación compartida de email, nueva contraseña, preferencias, zona IANA y eliminación; rechaza campos de identidad en los nuevos cuerpos |
| `.env.example` | FRONTEND_URL HTTPS y configuración SMTP TLS/credenciales opcionales; ningún secreto real |

La recuperación responde con el mismo 202/cuerpo para emails registrados y desconocidos, incluso si falla
SMTP. No se promete igualdad de tiempos. Los errores de correo no incluyen destinatarios, enlaces ni detalles
del transporte. El origen de los enlaces proviene de FRONTEND_URL validado, nunca de cabeceras del cliente;
es obligatorio en producción y usa `https://localhost:5173` por defecto local.

La nueva solicitud invalida los tokens anteriores bajo bloqueo de la cuenta. Restablecer verifica la
expiración con `clock_timestamp()` después del bloqueo; consume el token y cambia el hash Argon2id en
la misma transacción, incrementando `version_token`. Dos consumos concurrentes producen un 204 y un 410.
El aumento de versión invalida todas las sesiones anteriores.

Las preferencias solo actualizan unidad/zona del dueño de la cookie. La exportación usa un snapshot
REPEATABLE READ, sin paginación: usuario sin credenciales, ejercicios propios, rutinas con referencias y
todos los entrenamientos con ejercicios/series, incluidas sesiones vacías o en curso. Los campos son
explícitos, sin tokens ni version_token. Se filtra la propiedad también en las consultas anidadas.
CSV contiene una fila por serie, fecha local del entrenamiento, kg canónicos, lb redondeadas a dos decimales
y notas con comas/comillas/saltos escapados. Los campos de texto que comienzan con `=`, `+`, `-` o `@`
reciben un apóstrofo inicial únicamente en CSV para neutralizar fórmulas. JSON y BD conservan el texto original,
incluida la nota `=1+1`. JSON conserva también rutinas y entrenamientos sin series.

Eliminar exige la contraseña dentro de la transacción, bloquea la cuenta y usa las cascadas existentes.
Las referencias ejercicio/rutina/entrenamiento no requieren cambiar el esquema. Al fallar el borrado se
revierte toda la operación y se conserva la sesión; al terminar se borra la cookie y las sesiones de otros
dispositivos dejan de ser válidas porque ya no existe el usuario.

## Archivos de pruebas y seguimiento

- `backend/test/infraestructura/correo-aplicacion.e2e-spec.ts`: servicio real → SMTP → lectura Mailpit HTTPS,
  comprobando ausencia de logs de contenido.
- `backend/test/integracion/cuenta.e2e-spec.ts`: conserva las 17 expectativas originales T044 y añade
  11 casos de limitación de intentos, validación/JSON, emisión concurrente, fallo SMTP, logs,
  identidad de la cookie, exportación vacía, neutralización de fórmulas CSV sin alterar JSON y rollback de borrado.
- `backend/test/integracion/preferencias-exportacion.e2e-spec.ts`: servicio aislado T047 contra BD real,
  previo al registro del módulo en T048.
- `backend/test/unitarios/auth-modulo.spec.ts`: adapta el arnés P1 sin BD a la nueva dependencia
  RecuperacionService, sustituyéndola solo en esa suite por operaciones que fallan si se invocan.
  Ninguna aserción de acceso/cookies/límites se debilita; la aceptación de recuperación usa el servicio real.
- `backend/test/utils/correo.ts`: Content-Length explícito en peticiones con cuerpo, necesario para
  la limpieza DELETE; diagnóstico de método/ruta/estado sin contenido sensible.
- `packages/domain/test/recuperacion.test.ts`, `preferencias.test.ts`: 18 casos de límites y entradas.
- `specs/001-registro-entrenamientos/tasks.md`: T045–T048 marcadas.
- `e2e/resultados/us4.md`: enlace a este resultado sin borrar la evidencia roja histórica.
- Este informe.

## Rojo → verde y resultados finales

Se volvió a ejecutar la aceptación original **antes de implementar**: **17/17 rojas por 404**,
con PostgreSQL, HTTPS, login y Mailpit operativos. Evidencia: `test-results/t045-t048/rojo-t044.log`.
Los nuevos casos API de T046/T047/T048 también se ejecutaron antes de sus implementaciones y fallaron
por rutas pendientes. Los tests nuevos de esquemas/servicio empezaron con exportaciones o módulos aún
ausentes; esos errores de carga no sustituyen la evidencia roja funcional de T044.

1. T045: servicio de correo real verde, 1/1.
2. T046: 9/9 de dominio y 14/14 de recuperación API verdes; el filtro dejó fuera los ocho casos
   de cuenta aún pendientes, sin añadir skips permanentes.
3. T047: 9/9 de dominio y 1/1 de servicio aislado verdes; registro de rutas de cuenta diferido a T048.
4. T048: aceptación completa de cuenta **28/28 verde** tras añadir la regresión CSV. Con las suites de correo y servicio aislado: **30/30**.

La primera regresión completa detectó la nueva dependencia sin proveedor en la suite aislada P1;
se adaptó el arnés descrito arriba y se repitió la regresión. Durante la implementación se corrigió
la interpretación del resultado de UPDATE de TypeORM usando un CTE con SELECT: las pruebas de
reutilización y consumo concurrente comprobaron el rechazo real, no solo una respuesta simulada.

| Comprobación final (Node 22.23.5) | Resultado |
|---|---|
| Backend completo (ejecución anterior a la corrección CSV) | **21 suites, 185/185 verdes**, sin omitidos |
| Cuenta/exportación/correo tras corregir CSV | **3 suites, 30/30 verdes**, incluidos 28 casos de cuenta |
| Dominio completo (ejecución anterior, sin cambios de dominio) | **10 archivos, 66/66 verdes** |
| Typecheck backend tras corregir CSV | Verde |
| Typecheck frontend/dominio/E2E (ejecución anterior) | Verde |
| Lint | Verde |
| `git diff --check` | Verde |

```sh
npm run test --workspace backend -- --runTestsByPath test/integracion/cuenta.e2e-spec.ts test/integracion/preferencias-exportacion.e2e-spec.ts test/infraestructura/correo-aplicacion.e2e-spec.ts
npm run test --workspace backend -- --json --outputFile=../test-results/t045-t048/backend.json
npm run test:domain
npm run typecheck
npm run lint
git diff --check
```

Artefactos locales ignorados por Git: `test-results/t045-t048/aceptacion-api.{log,json}`,
`backend.{log,json}`, `dominio.log` y los registros intermedios rojo/verde. Este informe conserva el
resultado versionable. Los tests de BD trabajan en esquemas aislados de `gymtrack_test`; la limpieza
de Mailpit elimina únicamente mensajes de los destinatarios sintéticos de cada caso.

## Límites del resultado

Verificado con Mailpit local y HTTPS confiable; no se probó un servidor SMTP de producción.
No se cambiaron pantallas ni se ejecutó la aceptación de navegador pendiente de T049/T050.
El verde es de **API y servicios**, no de US4 completa: faltan interfaz, descargas desde navegador
y revisión de accesibilidad de la historia. No se hizo commit ni integración.

## Corrección posterior — fórmulas en CSV

La nueva prueba de API falló primero: esperaba `'=1+1` en CSV y recibía `=1+1`.
Tras corregir exclusivamente la serialización CSV de `cuenta.service.ts`, pasó junto con las demás
pruebas de cuenta. El caso recorre los cuatro prefijos (`=`, `+`, `-`, `@`) en nombres de ejercicio
y notas, verifica el apóstrofo en CSV, los valores originales en JSON/BD y pesos numéricos sin cambios.
Evidencia roja: `test-results/t045-t048/csv-formulas-rojo.log`; verde: `aceptacion-api.{log,json}`.
Typecheck de backend, lint y diff-check repetidos en verde. No se repitió el backend completo;
su conteo de 185 corresponde a la ejecución previa, identificada en la tabla. Sin commit.
