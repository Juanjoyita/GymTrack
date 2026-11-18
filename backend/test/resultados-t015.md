# Verificación de T015 — Registro, offline y conflictos

Fecha: 2026-11-13. T015 completada tras ejecutar la aceptación roja en Node 22. No se implementa producción ni se hacen commits.

## Archivos preparados

- `backend/test/utils/registro-fixtures.ts`: cuenta sintética por UUID, entrenamiento vacío, entrenamiento inactivo por 13 h, inicio cercano a medianoche y matriz completa de valores V4. Conexión y limpieza verifican `NODE_ENV=test`, `gymtrack_test.public` y el prefijo de correo T015; la limpieza elimina únicamente la cuenta de ese caso.
- `e2e/tests/registro.spec.ts`: dos ejercicios y cinco series, límite de tres interacciones, edición/deshacer, resumen y persistencia exacta, entrenamiento vacío, inactividad, medianoche y valores V4.
- `e2e/tests/offline.spec.ts`: cola pendiente tras cortes intermitentes, recarga y reapertura de pestaña, sincronización y conteo sin duplicados.
- `e2e/tests/conflicto.spec.ts`: dos contextos de navegador, nuevas series de ambos dispositivos y resolución explícita de un cambio offline tardío.

## Validación estática

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Correcto, incluye E2E |
| `npm run lint` | Correcto |
| Escaneo de espacios finales en los cinco archivos añadidos | Correcto |

## Corrección del arranque en Windows

`scripts/dev.mjs` inicia los workspaces con `npm.cmd` y `shell: true` en Windows, conserva `npm` y el comportamiento desacoplado en Unix, y muestra el error de `spawn` en vez de terminar en silencio. La ejecución Playwright llegó a lanzar los siete casos y a iniciarlos contra los servidores HTTPS, confirmando que el fallo de `config.webServer` quedó corregido.

El primer intento ya alcanzó Playwright, pero las conexiones desde el host fueron rechazadas por una contraseña de rol anterior a la de `.env`. Se comprobó el acceso administrativo local por socket y se alineó la contraseña del rol local `gymtrack` con el valor configurado en `.env`; no se expuso el secreto ni se borraron o modificaron filas. La base volvió a aceptar conexiones y se usó `gymtrack_test`.

## Resultados rojos observados

Todas las ejecuciones funcionales de abajo se hicieron con Node `v22.23.3`, PostgreSQL de pruebas y certificados TLS locales confiables. Los comandos E2E ejecutaron Chromium con `ignoreHTTPSErrors: false`. Las suites iniciaron correctamente; no hubo errores de inicialización de aplicación, base, configuración de Jest/Playwright o TLS.

| Aceptación | Resultado | Evidencia funcional |
|---|---:|---|
| T012 REST, T013 REST y T014 REST | 3 suites fallidas; **32 pruebas fallidas** | Las rutas aún no registradas devuelven `404` donde el contrato requiere `200`, `201`, `400`, `401` o `409`. T012 aporta 11 fallos, T013 7 y T014 14. |
| T012 E2E `auth.spec.ts` | **6 fallidas** | Los formularios accesibles de registro/login no están implementados; el caso sin sesión recibe `404` en `/api/auth/yo` en vez de `401`. |
| T014 frontend `catalogo.test.tsx` | **7 fallidas** | La aplicación no muestra el botón accesible «Añadir ejercicio». |
| T015 E2E `registro.spec.ts`, `offline.spec.ts`, `conflicto.spec.ts` | **7 fallidas** | Los siete casos fallan al buscar el campo accesible `correo electrónico|email` del formulario `/registro`, que aún no existe. |

Comandos de aceptación:

```powershell
fnm env --shell power-shell | Out-String | Invoke-Expression
fnm use 22.23.3 --silent-if-unchanged
npm run test:e2e -- registro.spec.ts offline.spec.ts conflicto.spec.ts
npm run test:e2e -- auth.spec.ts
npm run test --workspace backend -- --runTestsByPath test/integracion/auth.e2e-spec.ts test/integracion/registro.e2e-spec.ts test/integracion/ejercicios.e2e-spec.ts
npm run test:frontend -- catalogo
```

### Alcance de la evidencia

El rojo no es de configuración: Playwright inicia los servidores y los casos alcanzan localizadores y respuestas HTTP reales. Los cinco casos de registro y los casos de offline/conflicto se detienen en el prerrequisito de cuenta ausente. Por ello, aunque T015 queda completada como preparación y ejecución de la puerta roja antes de implementar, **esta corrida no demuestra aún** el comportamiento de edición/deshacer, conectividad, recuperación offline, concurrencia ni resolución de conflictos. Esas aserciones quedan para repetirse cuando exista el acceso y UI requeridos. T012–T014 igualmente permanecen intencionalmente rojas; T016–T018 quedan desbloqueadas para su implementación y no se marcan completas.

Consulta posterior de solo lectura: **0 cuentas `t015.*@example.invalid` y 0 esquemas temporales T006** en `gymtrack_test`. La evidencia de ejecuciones anteriores está en [resultados-t012.md](./resultados-t012.md) y [resultados-t014.md](./resultados-t014.md).

No se hizo commit; queda pendiente la revisión del usuario.
