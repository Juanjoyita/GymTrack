# T061B — Repetición del README desde clon limpio

Fecha: **2026-11-17, America/Bogota**. **Estado: ejecutada la repetición técnica; no aprobada**.
T061B queda sin marcar: falta acreditar la revisión de otro integrante I4. Los ocho fallos
frontend iniciales se corrigen en la continuación descrita abajo; no se borran sus resultados históricos.
Esta ejecución la realiza el agente a petición de la usuaria; no se atribuye a una persona distinta.
No se hacen commit ni push. La continuación corrige el foco y sincroniza tests, sin ocultar fallos.

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


## Revisión y aislamiento

Se siguió el [README](../../README.md) de la rama publicada, sin copiar `.env`, `node_modules`,
builds ni archivos locales de otro clon:

```bash
git clone --branch 001-registro-entrenamientos https://github.com/Juanjoyita/GymTrack.git /private/tmp/gymtrack-t061b-clean/GymTrack
```

- HEAD remoto y base del árbol de trabajo: **`b816e99`**. Rama local de documentación: `001-t061b-cierre`.
- Clon inicialmente sin cambios. Después se aplicaron allí las mismas correcciones documentales
  del README para comprobarlas. No se copiaron los cambios locales pendientes de T059 al clon.
- macOS **26.5.2**, arm64; Node **22.23.5**, npm **10.9.9**; Docker Engine **29.9.3**,
  Compose **5.7.0**, Chrome **157.0.8103.79** instalado; mkcert disponible.
- Es un clon y volumen limpios sobre un host existente, **no una máquina/VM recién instalada**.
  La CA de mkcert y el almacén de confianza del usuario ya existían; se generaron certificados
  nuevos en `/private/tmp/gymtrack-t061b-clean/tls`, sin reutilizar las claves del otro clon.
- Proyecto Compose exclusivo `gymtrack-t061b-clean`; volumen PostgreSQL nuevo. El PostgreSQL
  del host ya ocupaba 5432. Se configuraron `POSTGRES_PORT=DB_PORT=15432`, SMTP **11025**,
  panel Mailpit **18025**, `MAILPIT_URL=https://localhost:18025`, sin alterar servicios anteriores.
  API/frontend conservan 3000/5173; los arneses se ejecutaron secuencialmente.
- Contraseña PostgreSQL y JWT generados con el bloque del README, sin imprimirlos; `.env` con
  permisos 600. Certificado/clave/CA pública fuera del repositorio; TLS validado, sin bypass.

## Pasos, comandos y resultados

Todos los comandos npm se ejecutaron en la raíz del clon con Node 22 en PATH.
Los valores de puertos/directorio TLS se establecieron mediante la tabla de configuración del README.

| Paso | Comando / comprobación | Resultado |
|---|---|---|
| Instalación | `npm ci` | **PASS**, salida 0; instalación propia desde lockfile. Avisos de dependencias abajo. |
| Configuración | `cp .env.example .env` y bloque Node del README | **PASS**, secretos nuevos no mostrados; sin copiar configuración del árbol original. |
| HTTPS | `GYMTRACK_TLS_DIR=/private/tmp/gymtrack-t061b-clean/tls npm run tls:local` | **PASS**, nuevo certificado, confianza del usuario y permisos de clave. |
| Servicios | `docker compose up -d --wait`; `docker compose ps` | **PASS**; PostgreSQL `healthy`, Mailpit en ejecución y panel HTTPS 200 en puerto configurado 18025. |
| Migraciones dev | `npm run db:migrate` | **PASS**, base nueva `gymtrack`, dos migraciones, 50 ejercicios globales. |
| Migraciones test | `npm run db:migrate:test` | **PASS**, base nueva `gymtrack_test`, dos migraciones, 50 ejercicios globales. |
| Repetición de migraciones | Ambos comandos anteriores de nuevo | **PASS**, sin migraciones pendientes en dev/test; idempotencia comprobada. |
| Carga opcional dev | `npm run db:seed:carga` | **PASS**, 500 entrenamientos y 1.500 series en la cuenta sintética de la base dev aislada. |
| Arranque | `npm run dev` | **PASS**; frontend HTTPS 200, API `/api/auth/yo` sin cookie 401 y Mailpit HTTPS 200. |
| Recorrido de interfaz | Chrome 360×800, cuenta sintética | **PASS** repetido con limpieza correcta: crear cuenta, iniciar sesión de entrenamiento, elegir ejercicio, registrar serie, finalizar, abrir Historial/Progreso/Rutinas/Cuenta y eliminar cuenta sintética. |
| Build | `npm run build` | **PASS**, salida 0. |
| Lint | `npm run lint` | **PASS**, salida 0. |
| Tipos | `npm run typecheck` | **PASS**, salida 0. |
| Todas las pruebas | `npm test` | **FAIL**, salida 1: dominio 82/82 y backend 289/289 pasan; frontend 262/270 pasa, 8 fallan; E2E no se ejecuta por cortocircuito. |
| Confirmación frontend | `npm run test:frontend` | **FAIL** reproducido: los mismos 8 fallos en tres archivos. |
| E2E inicial | `npm run test:e2e` | **FAIL**, 42/43: falta la cuenta de carga que la suite de 500 entrenamientos exige. |
| Preparación omitida | `npx cross-env NODE_ENV=test npm run db:seed:carga --workspace backend` | **PASS**, 500 entrenamientos y 1.500 series sintéticas en test; ejecución equivalente con `npm exec -- cross-env ...`. Se añadió al README antes de las pruebas. |
| E2E con carga | `npm run test:e2e` | **43/43 PASS**, salida 0, 53,4 s. Se conserva el intento inicial 42/43. |
| Rendimiento | `npm run perf` | **PASS**, salida 0: cinco cargas cumplen, respuesta local 13,8 ms, historial 22,2 ms y progreso 15,4 ms. Detalle en [puerta final](cierre.md). |

El recorrido de pantallas fue dirigido por Playwright, sin simular la API; no se cuenta como sesión
humana de usabilidad ni como revisión manual WCAG/VoiceOver. El resto de flujos funcionales del README
se comprueba en los E2E de cuenta, progreso y rutinas, con su resultado explícito en la puerta final.

## Pasos implícitos encontrados y correcciones del README

1. **Dos clones con el mismo nombre pueden compartir proyecto/volumen Compose.** Se añadió
   `COMPOSE_PROJECT_NAME` y la necesidad de puertos separados antes del arranque. Se usó un volumen
   nuevo; no se cambiaron contraseñas ni se borraron volúmenes del otro proyecto.
2. **El E2E completo necesita la carga de 500 entrenamientos antes de `npm test`/`test:e2e`.**
   Se añadió el comando de carga test a la secuencia y se aclaró su alcance sintético.
3. El estado de la entrega se enlaza a este informe y al de cierre, sin afirmar que T061B/T062
   estén aprobadas o que la marca administrativa T061 demuestre usabilidad humana.

Estas correcciones no resuelven los ocho fallos funcionales/del arnés frontend: no se presentan como
una instalación completamente verde y no se sustituye `npm test` por una selección que los omita.

## Incidentes y pendientes

- **Frontend:** `auth.test.tsx` (2), `rutinas.test.tsx` (1) y `shell.test.tsx` (5).
  Aserciones de foco, contenido aún cargando, alerta de desconexión y encabezados de las cinco secciones.
  El origen definitivo (producto, asincronía o arnés) no queda aislado aquí; no se declara corregido.
- **Dependencias:** `npm audit --json` informa **51 entradas vulnerables**: 10 moderadas y 41 altas,
  0 críticas; no equivale a 51 CVE independientes. Hay dependencias directas señaladas en Jest,
  `@types/jest`, `ts-jest`, `react-router-dom`, TypeORM, `typescript-eslint`, Vite y Vitest.
  No se ejecutó `npm audit fix` ni se modificaron manifiestos/lockfile. Se requiere triage y corrección
  con regresión antes de considerar resuelta esa parte de seguridad de entrega.
- **Error del arnés auxiliar de limpieza:** el primer recorrido web completó sus pasos, pero
  `APIRequestContext` de Node no tenía CA configurada; su excepción imprimió una cookie de prueba
  en la salida de la herramienta. Se eliminó inmediatamente la única cuenta sintética de esa base
  y con ello se revocó su sesión; quedó cero usuarios. No se incluye el valor en archivos/informes.
  La repetición usó `NODE_EXTRA_CA_CERTS` y manejo de errores saneado: recorrido **PASS**, eliminación
  HTTP **204**. No se presenta ese primer intento como limpio ni como fallo TLS de la aplicación.
- **Revisión independiente:** falta que otro integrante I4 siga el README corregido y acredite su
  resultado desde su entorno; este agente ya participó en redactarlo. La prueba técnica de clon
  limpio queda disponible, pero no se inventa una firma independiente.
- **Usabilidad/accesibilidad:** siguen pendientes las observaciones humanas y T059; no se resuelven
  mediante esta repetición ni se cambia su evidencia. El detalle está en la matriz de cierre.

## Evidencia local y cierre

Logs y resúmenes se guardan en `test-results/t061b-t062/` del árbol de trabajo original,
fuera del clon, para que la limpieza de servicios no pierda el historial: `instalacion.log`,
`tls.log`, `compose.log`, `migracion-dev.log`, `migracion-test.log`, `arranque-dev.log`,
`arranque-navegador.json`, `arranque-repetido.json`, `build.log`, `lint.log`, `tipos.log`,
`pruebas.log`, `frontend-separado.log`, `e2e-separado.log`, `carga-test.log`,
`e2e-con-carga.log`, `rendimiento.log`, `audit.json` y `comandos.json`.
Los artefactos son locales e ignorados; no contienen la cookie del incidente. La comprobación
final de los tres documentos encontró **33 enlaces locales existentes**, bloques Bash válidos y
ningún error de espacios (`git diff --check`, también comprobados los informes nuevos no versionados).
Los **8 archivos de T059** inventariados antes de trabajar conservan sus hashes de contenido.
Se detuvieron exclusivamente los contenedores del proyecto de pruebas; se conservó el volumen
y no quedan servidores web del clon escuchando. El clon temporal se conserva para revisión.

**T061B no aprobada** mientras no exista la verificación independiente requerida. Los fallos
frontend iniciales se conservan como historial y su corrección se registra en la continuación.
Se conserva el árbol de T059 y no se hace commit ni push. No se certifica instalación limpia de
Windows/Linux, dispositivos físicos o navegadores no ejecutados en este host.
