# GymTrack

Aplicación web en español para registrar entrenamientos de fuerza y consultar su evolución.
Proyecto académico con cinco historias: **P1** cuenta/sesión y registro de ejercicios, series,
repeticiones, pesos y notas; **P2** historial, filtros, edición y eliminación; **P3** progreso,
volumen y récords; **P4** preferencias kg/lb y zona horaria, recuperación por correo,
exportación JSON/CSV y eliminación de cuenta; **P5** rutinas propias por día e inicio desde plantilla.

Stack: React 18, TypeScript, Tailwind CSS 4 y Vite 6; NestJS 11, TypeORM 0.3 y PostgreSQL 16;
npm workspaces (`frontend`, `backend`, `packages/domain`) y API REST. El dominio comparte
validación y cálculos. No incluye cardio, pagos, funciones sociales, wearables ni generación de rutinas.

La [especificación](specs/001-registro-entrenamientos/spec.md), el
[plan](specs/001-registro-entrenamientos/plan.md), la
[constitución](.specify/memory/constitution.md) y el
[quickstart con escenarios V1–V12](specs/001-registro-entrenamientos/quickstart.md)
definen alcance y criterios. La [lista de tareas](specs/001-registro-entrenamientos/tasks.md)
registra el estado de entrega. Esta guía prepara T061A; **la comprobación independiente desde un
clon limpio por I4 (T061B) aún está pendiente**. La
[repetición técnica del README](e2e/resultados/readme.md) y la
[puerta final](e2e/resultados/cierre.md) registran resultados y fallos observados; no están aprobadas.

## Requisitos

- Git; Node.js **22.x** (el proyecto exige `>=22 <23`) y npm **10 o superior**.
- Docker Desktop iniciado, o Docker Engine con **Docker Compose v2**.
- **mkcert** disponible en PATH para generar certificados locales confiables.
  En macOS puede instalarse con `brew install mkcert`; en Linux instalarlo con el gestor
  de la distribución y preparar su almacén de confianza (en Debian/Ubuntu, `libnss3-tools`
  para los navegadores que usan NSS). La instalación de confianza puede pedir autorización del sistema.
- **Google Chrome estable instalado**, requerido por Playwright y Lighthouse.
  En Linux deben estar disponibles sus dependencias de sistema; el comando
  `npx playwright install-deps chromium`, después de instalar npm, prepara las de Chromium
  y puede requerir permisos administrativos. No sustituye la instalación de Google Chrome.
- Puertos locales libres: **3000** API, **5173** frontend, **5432** PostgreSQL,
  **1025** SMTP y **8025** panel Mailpit. Los puertos de base de datos/correo son configurables.

Los bloques siguientes usan Bash (macOS/Linux; en Windows requieren Git Bash y las herramientas
en PATH). Ejecutarlos desde la raíz del clon salvo cuando se indique otra terminal/directorio.
No hace falta PostgreSQL instalado en el host: Compose ejecuta la base de desarrollo y la de pruebas.

## Preparar un clon limpio

```bash
git clone --branch 001-registro-entrenamientos https://github.com/Juanjoyita/GymTrack.git
cd GymTrack
node --version
npm --version
docker compose version
mkcert --version
npm ci
cp .env.example .env
```

El comando anterior corresponde al clon limpio de T061B **después de integrar el README** en
`001-registro-entrenamientos`. Si I4 lo revisa antes de la fusión, una vez publicada la rama
`001-t061a-readme`, debe sustituir el comando de clonación por:

```bash
git clone --branch 001-t061a-readme https://github.com/Juanjoyita/GymTrack.git
```

Clonar una rama no incorpora archivos sin commit ni cambios que todavía no se hayan publicado.
`npm ci` usa el lockfile y se ejecuta solo en la raíz. Copiar `.env.example` únicamente al preparar
el clon nuevo: no sobrescribir un `.env` que ya tenga configuración.

Si hay otro clon en la misma máquina, definir en el nuevo `.env` un `COMPOSE_PROJECT_NAME`
exclusivo (por ejemplo `gymtrack-revision`) **antes de arrancar Compose** y elegir puertos
BD/SMTP/panel libres con las variables de la tabla. Esto crea contenedores y volumen separados;
un clon llamado también `GymTrack` usaría por defecto el mismo proyecto Compose. No ejecutar
simultáneamente las aplicaciones de ambos clones: API/frontend mantienen los puertos 3000/5173.

Generar los dos secretos locales sin imprimirlos ni copiarlos a esta documentación:

```bash
node <<'JS'
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const ruta = '.env';
let contenido = fs.readFileSync(ruta, 'utf8');
for (const clave of ['POSTGRES_PASSWORD', 'JWT_SECRET']) {
  const vacio = new RegExp(`^${clave}=$`, 'm');
  contenido = contenido.replace(vacio, () => `${clave}=${randomBytes(32).toString('hex')}`);
}
fs.writeFileSync(ruta, contenido, { mode: 0o600 });
fs.chmodSync(ruta, 0o600);
console.log('Configuración local preparada; secretos no mostrados.');
JS
```

El bloque conserva valores existentes; está preparado para las entradas vacías de `.env.example`.
No compartir `.env`, claves privadas, cookies ni enlaces de recuperación. El repositorio los ignora.
El backend exige `JWT_SECRET` de al menos 32 bytes y una contraseña PostgreSQL no vacía.

### Variables de configuración

Editar `.env` como texto; **no ejecutarlo con `source`**. Node, Vite y Compose lo cargan.
No definir `NODE_ENV=production` ni `GYMTRACK_E2E=1` globalmente para trabajar en desarrollo.

| Variables | Configuración local y función |
|---|---|
| `COMPOSE_PROJECT_NAME` (opcional) | Nombre exclusivo al revisar varios clones; separa contenedores y volumen sin modificar los del otro clon. |
| `POSTGRES_PASSWORD` | Secreto generado; lo usan tanto Compose como la conexión del backend. |
| `POSTGRES_PORT`, `DB_PORT` | Ambos `5432`. Si está ocupado, cambiar **ambos** al mismo puerto libre, por ejemplo `5433`. |
| `DB_HOST`, `DB_USERNAME` | `localhost`, `gymtrack`: Node se ejecuta en el host. |
| `DB_DATABASE`, `DB_TEST_DATABASE` | `gymtrack`, `gymtrack_test`. Mantenerlas separadas; las pruebas rechazan otra base de test. |
| `JWT_SECRET` | Secreto aleatorio generado; nunca se expone al frontend. |
| `GYMTRACK_TLS_DIR` | Vacío usa `~/.local/share/gymtrack/tls`. Si se cambia, usar ruta absoluta y exportarla **antes** de `npm run tls:local`; el script Bash no carga `.env`. Mantener el mismo valor en `.env`. |
| `TLS_CERT_PATH`, `TLS_KEY_PATH`, `TLS_CA_PATH` | Vacías usan `localhost.pem`, `localhost-key.pem`, `ca.pem` del directorio TLS. Para archivos alternativos, usar rutas absolutas también accesibles a Docker. |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025`: correo sintético capturado por Mailpit, sin envío externo. Cambiar `SMTP_PORT` también cambia el puerto publicado por Compose. |
| `SMTP_FROM` | Remitente sintético de `.env.example`; no requiere cuenta de correo. |
| `MAILPIT_PORT`, `MAILPIT_URL` | `8025`, `https://localhost:8025`; actualizar ambos si cambia el puerto. |
| `FRONTEND_URL` | `https://localhost:5173`, origen de los enlaces de recuperación. |
| `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | En local: `false` y credenciales vacías. En producción: TLS implícito si `true`; si `false`, se exige STARTTLS. Credenciales configuradas ambas o ninguna, según el servidor. |
| `CHROME_PATH` (opcional, añadir o exportar) | Ruta absoluta al ejecutable Chrome para `npm run perf`; necesaria en macOS/Linux porque la búsqueda automática actual usa rutas Windows. |

Cambiar la contraseña en `.env` después de crear el volumen PostgreSQL **no cambia** la del servidor
ya inicializado. Conservar la contraseña de ese volumen o migrarla de forma deliberada; no borrar
el volumen para resolver un error de acceso si contiene datos que se quieren conservar.

## HTTPS y servicios de desarrollo

```bash
npm run tls:local
docker compose up -d --wait
docker compose ps
npm run db:migrate
npm run db:migrate:test
npm run dev
```

`tls:local` genera un certificado para localhost/127.0.0.1/::1, confía en la CA y guarda certificado,
clave y CA pública fuera del repositorio. En macOS usa el llavero del usuario; en Linux llama a
`mkcert -install`. La clave del certificado queda con permisos 600 y la clave privada de la CA
permanece en CAROOT de mkcert. Generar los certificados **antes** de Compose: Mailpit los monta
solo para lectura. Reiniciar Chrome si estaba abierto antes de instalar la confianza.

PostgreSQL debe aparecer como **`healthy`** en `docker compose ps`. Para Mailpit, comprobar
que esté en ejecución con `docker compose ps` y que abra **https://localhost:8025** (o el puerto
configurado). En el primer volumen PostgreSQL crea
`gymtrack` y `gymtrack_test`; la segunda migración siembra **50 ejercicios globales**.
Las migraciones posteriores no repiten cambios ya aplicados. No se usa `synchronize` ni se
aplican migraciones automáticamente al arrancar la aplicación.

| Servicio | Dirección / comprobación |
|---|---|
| Aplicación | **https://localhost:5173**; crear una cuenta sintética desde «Crear cuenta». |
| API | **https://localhost:3000/api**; `GET /api/auth/yo` sin sesión devuelve **401**, no es un fallo de arranque. `/api` no es una página ni un endpoint de salud. |
| Mailpit | **https://localhost:8025**; bandeja de correo sintético. |
| PostgreSQL | `localhost:5432` (o el puerto configurado), bases separadas dev/test. |

Frontend y API escuchan en localhost y exigen HTTPS; Vite reenvía `/api` por HTTPS al backend
validando la CA. No hace falta configurar CORS para este flujo. Las cookies de sesión son
`Secure`, `HttpOnly` y `SameSite=Strict`; no hay contraseña ni token de sesión en localStorage.
Usar siempre **localhost**, sin mezclarlo con 127.0.0.1 para la sesión. No aceptar certificados
inválidos ni desactivar la validación TLS. El SMTP de Mailpit es transporte interno local sin
credenciales/STARTTLS, publicado solo en loopback; su panel y API web usan HTTPS.

Para parar desarrollo: `Ctrl+C` en la terminal de `npm run dev`. Después, si se desea detener
los servicios auxiliares, ejecutar `docker compose stop`. Los datos PostgreSQL permanecen en el
volumen; `docker compose up -d --wait` permite volver a iniciarlos. No usar `down -v` para apagar.

## Recorrido funcional y correo sintético

1. Crear una cuenta con un correo del dominio `example.invalid` y una contraseña elegida para
   pruebas. No hay usuario inicial obligatorio ni que confirmar el correo para registrarse.
2. Iniciar entrenamiento, elegir un ejercicio, anotar peso/repeticiones y añadir series.
   Finalizar, abrir Historial y consultar Progreso. El catálogo global se comparte; los datos
   del entrenamiento y los ejercicios privados pertenecen únicamente a su usuario.
3. Crear una rutina por día e iniciar otra sesión desde ella; cambiar la sesión no modifica la plantilla.
4. En Cuenta, cambiar kg/lb y zona horaria; exportar JSON/CSV. JSON conserva el texto original;
   CSV neutraliza los prefijos de fórmula en los campos de texto.
5. Cerrar sesión, pedir recuperación desde «Olvidé mi contraseña» y abrir el mensaje en Mailpit.
   Usar el enlace HTTPS sin compartirlo. Caduca en una hora, es de un solo uso y un nuevo enlace
   invalida el anterior; restablecer revoca las sesiones previas. No se envía correo a Internet.
6. Probar eliminación solo con una cuenta sintética desechable: requiere confirmación y contraseña,
   y elimina también sus entrenamientos, series, ejercicios privados y rutinas.

## Build, pruebas y comprobaciones

Detener `npm run dev` antes de las pruebas de backend, E2E o rendimiento; necesitan los puertos
3000/5173 libres. Mantener Compose y los certificados disponibles. **No ejecutar arneses en paralelo**
contra la misma base de pruebas. Desde la raíz:

```bash
npm run db:migrate:test
npm run build
npm run lint
npm run typecheck
npx cross-env NODE_ENV=test npm run db:seed:carga --workspace backend
npm test
```

La carga de test se prepara antes de `npm test` o de ejecutar `npm run test:e2e` por separado:
la suite E2E incluye `rendimiento-500.spec.ts`, que necesita esa cuenta con 500 entrenamientos.
Repetir el comando de carga reemplaza únicamente los datos de esa cuenta sintética en test.

El build previo es necesario incluso para `test:backend`: T060 abre el frontend compilado para
comprobar almacenamiento y cookies en Chrome real. `npm test` ejecuta en orden dominio, backend,
frontend y E2E. `npm run test:e2e` reconstruye backend/frontend, inicia sus propios servidores HTTPS
sobre `gymtrack_test` y los cierra; no reutiliza servidores de desarrollo. Usa Chrome instalado
(`channel: chrome`), viewport 360×800 y validación de certificados activa. No hace falta descargar
el Chromium de Playwright para este perfil. Los demás arneses crean sus fixtures; no necesitan sembrar
una cuenta personal ni ejecutar antes el recorrido manual.

| Comando desde la raíz | Cobertura / requisitos |
|---|---|
| `npm run test:domain` | Unitarios de validación, conversiones, volumen, 1RM y récords; sin BD. |
| `npm run test:frontend` | Componentes, formularios, cola y lógica offline con Vitest/RTL. |
| `npm run test:backend` | Jest/Supertest, PostgreSQL de test, SMTP/Mailpit y Chrome; requiere build frontend previo. |
| `npm run test:e2e` | Playwright: acceso, registro, offline/conflictos, historial, progreso, cuenta, rutinas y axe. |
| `npm run lint` | ESLint sin warnings permitidos. |
| `npm run typecheck` | Tipos de los workspaces y E2E. |
| `npm run build` | Dominio/backend compilados y frontend listo en `frontend/dist`. |
| `npm run perf` | Cinco cargas frías Lighthouse y mediciones de registro/historial/progreso con carga sintética. |

Para repetir solo T060, después de los preparativos anteriores:

```bash
npm run test --workspace backend -- --runTestsByPath test/integracion/seguridad.e2e-spec.ts
```

Las pruebas solo usan `gymtrack_test`; las de integración crean esquemas aislados y otros fixtures
limpian sus propios datos. No apuntar arneses a desarrollo o a una base con información personal.
Resultados y capturas locales: `test-results/` (ignorado por Git); los informes compartidos están en
`e2e/resultados/`. Las capturas de fallo pueden mostrar la pantalla: usar exclusivamente datos sintéticos
y revisar los artefactos antes de compartirlos. No pegar `.env`, contraseñas, cookies o enlaces en logs.

### Datos de carga y rendimiento

La carga opcional crea **500 entrenamientos y 1.500 series** en una cuenta sintética dedicada.
Repetirla reemplaza los entrenamientos/rutinas de esa cuenta; no usar esa cuenta para datos que
se quieran conservar. Su identidad de prueba está definida en `backend/src/database/seeds/carga.ts`.
Se rechaza en producción. Para crear la carga en desarrollo o en test, respectivamente:

```bash
npm run db:seed:carga
npx cross-env NODE_ENV=test npm run db:seed:carga --workspace backend
```

`npm run perf` prepara automáticamente la carga en test, compila e inicia sus servidores y los cierra.
Configurar el ejecutable Chrome antes de lanzarlo; elegir **una** ruta real de la máquina:

```bash
# macOS
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
# Linux: alternativa al comando anterior, si esa es la ruta de instalación
# export CHROME_PATH='/usr/bin/google-chrome'
npm run perf
```

Perfil exigido: Chrome estable, 360×800, CPU 4×, red 10/5 Mbps y latencia 100 ms; primera carga
interactiva <3 s en al menos 4/5 ejecuciones, respuesta local <100 ms, historial/progreso con 500
entrenamientos <2 s. Artefactos en `test-results/perf/`; el comando **reescribe**
`e2e/resultados/rendimiento.md`. El generador actual etiqueta el entorno como Windows: al usar otro
SO, registrar el entorno real y revisar esa etiqueta antes de compartir el informe. Esta guía no
atribuye mediciones existentes a una nueva máquina ni declara una nueva ejecución de rendimiento.

## Modo offline y límites

El service worker se activa en el **build de producción**, no en el servidor de desarrollo de Vite.
Para un recorrido manual offline, ejecutar `npm run build`; en una terminal desde la raíz:

```bash
npm run dev --workspace backend
```

En otra terminal, desde la raíz del clon:

```bash
cd frontend
npx vite preview --host localhost --port 5173 --strictPort
```

No tener `npm run dev` raíz activo al mismo tiempo. Abrir https://localhost:5173 online, iniciar
sesión, cargar el entrenamiento y esperar a que el service worker controle la página y termine de
precargar el shell. Solo entonces cortar la red y probar series, recarga y reapertura.

- Se guardan la copia del entrenamiento, cola de operaciones y metadatos mínimos de sesión
  en localStorage por usuario. El service worker almacena el shell estático, no respuestas de la API.
  Contraseñas y tokens no se guardan allí; la sesión reside en una cookie HttpOnly.
- La sincronización ocurre con la aplicación abierta al recuperar conexión; no hay Background Sync.
  El primer acceso, registro/login, recuperación, exportación y otras consultas al servidor necesitan red.
  No se garantiza disponer offline de todo el historial o todas las pantallas nunca visitadas.
- Las operaciones pendientes dependen del navegador/dispositivo. Borrar datos del sitio, usar una sesión
  privada que se cierre o perder ese dispositivo puede borrar cambios aún no sincronizados.
- Un conflicto de versión requiere decidir en la interfaz; nunca se sobrescribe silenciosamente.
  Antes de cerrar sesión o cambiar de dispositivo, comprobar que no quedan operaciones pendientes.
- Solo fuerza: pesos 0–500 kg o equivalente lb, hasta dos decimales de entrada; repeticiones enteras
  1–100. Peso 0 es válido; no genera 1RM. No hay apps nativas ni sincronización entre dispositivos sin red.

## Entorno de entrega y solución de problemas

Para un despliegue real se requiere hosting HTTPS de `frontend/dist`, fallback SPA a `index.html`
y `/api` en el mismo origen mediante proxy a la API **HTTPS**. El backend compilado arranca con
`NODE_ENV=production` (`npx cross-env NODE_ENV=production node backend/dist/main.js` tras el build)
y escucha localhost:3000: el proxy debe poder alcanzarlo. Proveer certificado de dominio con cadena
completa, clave y CA confiable con las variables TLS; no usar la CA personal de mkcert en producción.
Configurar BD, `JWT_SECRET`, `FRONTEND_URL` HTTPS y SMTP de entrega con TLS. Las migraciones se aplican
antes del arranque; Mailpit y Vite preview son herramientas locales, no la infraestructura de producción.
No hay despliegue remoto ni automatización de ese despliegue incluidos en esta guía.

| Problema | Comprobación / corrección |
|---|---|
| No arranca Compose o Mailpit | Generar certificados antes; comprobar rutas TLS y que Docker esté iniciado. `docker compose ps` muestra estado; no publicar configuración expandida que contenga secretos. |
| Puerto PostgreSQL ocupado | Cambiar `POSTGRES_PORT` y `DB_PORT` juntos antes del primer arranque. |
| Falla autenticación a PostgreSQL | Revisar usuario/puerto/contraseña del volumen existente; cambiar `.env` no reinicializa ese volumen. |
| Falta `gymtrack_test` en un volumen antiguo | Crear solo esa base con `docker compose exec postgres createdb -U gymtrack -O gymtrack gymtrack_test`, luego `npm run db:migrate:test`. No borrar desarrollo. |
| Certificado no confiable | Ejecutar `npm run tls:local`, reiniciar navegador y comprobar CA/rutas; no usar `--ignore-certificate-errors`, `curl -k` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| Puertos 3000/5173 ocupados en tests | Detener desarrollo o preview anteriores; los tests arrancan sus propios servidores. |
| T060 indica que falta el frontend | Ejecutar `npm run build` antes de backend. |
| Lighthouse no encuentra Chrome | Definir `CHROME_PATH` absoluto; comprobar Chrome estable y la confianza TLS en ese usuario del sistema. |
| Recuperación sin mensaje | Usar cuenta registrada sintética, Mailpit activo y origen/puertos SMTP correctos; comprobar la bandeja local, sin copiar el enlace a logs. |

## Evidencia y revisión desde clon limpio (I4)

| Área | Evidencia existente |
|---|---|
| P1 / P2 / P3 | [Registro](e2e/resultados/us1.md), [historial](e2e/resultados/us2.md), [progreso](e2e/resultados/us3.md). |
| P4 / P5 | [Cuenta](e2e/resultados/us4.md), [rutinas](e2e/resultados/us5.md). |
| SMTP / carga / rendimiento | [Mailpit](e2e/resultados/t043a.md), [carga](e2e/resultados/carga.md), [rendimiento](e2e/resultados/rendimiento.md). |
| Seguridad T060 | [Resultados, comandos, alcance y límites](e2e/resultados/seguridad.md). |
| Accesibilidad y navegadores T059 | [Calidad](e2e/resultados/calidad.md). **Pendiente** de completar evidencia. |

Los informes conservan sus fechas y entornos; sus resultados no equivalen a verificar este clon.
Las sesiones humanas de usabilidad siguen pendientes (n=0), aunque T061 está marcada en tasks
por indicación de la usuaria. T061B (lectura independiente) y T062 (puerta final) siguen sin aprobar;
sus informes enlazados conservan los fallos y resultados de la repetición técnica.
SC-009 requiere un mes real de observación; no se declara cumplido mediante pruebas automatizadas.

Para T061B, I4 debe seguir **solo este README** en un clon de la revisión acordada, sin reutilizar
`.env` ni builds de otro clon: preparar requisitos/configuración/TLS, arrancar Compose, migrar,
registrarse y recorrer las pantallas, parar desarrollo y ejecutar build, lint, tipos, pruebas y
rendimiento. Comprobar los enlaces de esta guía y registrar revisión, SO, Node/npm, Docker/Compose,
Chrome, comandos, resultados y cada paso que necesite aclaración. Guardar la evidencia sin secretos en
`e2e/resultados/readme.md` al ejecutar T061B; cualquier paso implícito o fallo debe corregirse antes de
aprobarla. Ese recorrido no se ha realizado como parte de T061A.
