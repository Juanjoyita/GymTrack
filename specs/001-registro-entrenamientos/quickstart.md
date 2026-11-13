# Quickstart: Registro y seguimiento de entrenamientos

**Feature**: `001-registro-entrenamientos` | **Fecha**: 2026-11-11 | **Plan**: [plan.md](./plan.md)

Guía para levantar el proyecto y comprobar que la funcionalidad cumple la especificación. Los
comandos son los que existirán cuando se implementen las tareas; los nombres de los scripts de npm
forman parte del plan y deben respetarse.

## Requisitos previos

- Node.js 22 LTS y npm 10+
- Docker Desktop (o Docker Engine + Docker Compose v2)
- mkcert para generar y confiar certificados locales (claves fuera del repositorio).
- Google Chrome estable (pruebas de rendimiento y accesibilidad)

## Puesta en marcha

```bash
cp .env.example .env              # valores de desarrollo; nunca se suben secretos al repositorio
npm install                       # instala los tres workspaces
npm run tls:local                 # genera y confía certificados locales; Mailpit se integra en T043A
docker compose up -d              # PostgreSQL 16 (dev y test); Mailpit disponible desde T043A
npm run db:migrate                # aplica migraciones, incluido el catálogo de 50 ejercicios
npm run dev                       # backend HTTPS en :3000 y frontend HTTPS en :5173
```

| Servicio | URL |
|---|---|
| Aplicación | https://localhost:5173 |
| API | https://localhost:3000/api |
| Mailpit (desde T043A, correos de prueba) | https://localhost:8025 |

## HTTPS local y entorno de entrega (T010A/T011)

Instala mkcert (macOS: `brew install mkcert`) y ejecuta `npm run tls:local` con tu
usuario habitual. En macOS, el script confía en la CA en el llavero **del usuario**;
puede aparecer una autorización del sistema. En Linux usa `mkcert -install` y los
prerrequisitos de confianza de su distribución. Reinicia los navegadores abiertos
si no reconocen todavía la CA. La instalación global de macOS con `mkcert -install`
requiere permisos administrativos y no es necesaria si el llavero del usuario ya confía.

Certificado, clave y copia **pública** de la CA quedan en
`~/.local/share/gymtrack/tls/`; la clave tiene permisos 600. La clave privada de la CA
permanece en el CAROOT de mkcert. No se comparten ni versionan claves. Para cambiar
el directorio, exporta `GYMTRACK_TLS_DIR` con una ruta absoluta antes de generar y
arrancar los servicios. `TLS_CERT_PATH`, `TLS_KEY_PATH` y `TLS_CA_PATH` permiten usar
archivos alternativos (rutas absolutas, o relativas a la raíz del proyecto). No hace
falta sobrescribir un `.env` local existente: añade solo las variables necesarias.

Frontend y API escuchan exclusivamente HTTPS en localhost:5173 y localhost:3000.
El cliente usa `/api` en el mismo origen; Vite lo reenvía por HTTPS al backend y
comprueba su certificado con la CA. No hace falta CORS para este flujo.
Si faltan certificados, el arranque falla; no existe alternativa HTTP.

`npm run test:e2e` inicia y cierra ambos servidores con `NODE_ENV=test`, sin reutilizar
servidores de desarrollo. Usa Chrome estable instalado, viewport 360×800 y
certificados comprobados (`ignoreHTTPSErrors: false`). El proceso Node recibe la
CA **pública** mediante `NODE_EXTRA_CA_CERTS`; Supertest también usa HTTPS y CA explícita.
Los tests acceden solo a `gymtrack_test`, con fixtures en esquema aislado. Los puertos
3000/5173 deben estar libres antes de ejecutar E2E. Captura: `test-results/e2e/`.

Para la entrega, servir `frontend/dist` en un hosting HTTPS y conservar `/api` en el
mismo origen mediante proxy hacia la API HTTPS. El servidor debe recibir la cadena
completa del certificado válido para su dominio y la clave mediante `TLS_CERT_PATH`
y `TLS_KEY_PATH` (montaje/secretos del entorno, fuera de Git); la CA pública o privada
debe ser confiable para el proxy. El backend escucha localhost:3000, adecuado para
un proxy en el mismo host. No se usa la CA personal de mkcert en producción ni se
desactiva la validación TLS. Esta tarea documenta la configuración; no despliega un
entorno remoto. Mailpit HTTPS se integra en T043A; cookies Secure se verifican tras
autenticación en T023/T029.

## Ejecutar las pruebas

```bash
npm test                  # todos los arneses existentes, incluido E2E HTTPS
npm run test:domain       # unitarios de packages/domain (Vitest)
npm run test:backend      # integración de la API contra gymtrack_test (Jest + Supertest)
npm run test:frontend     # componentes y cola de sincronización (Vitest + RTL)
npm run test:e2e          # flujos críticos + axe en viewport 360×800 (Playwright)
npm run lint && npm run typecheck
npm run perf              # Lighthouse 5 veces sobre el build de producción (entorno de la constitución)
```

Puerta de integración (constitución): todo lo anterior en verde antes de fusionar un pull request.

---

## Escenarios de validación

Cada escenario indica la historia y los requisitos que valida. Los detalles de los datos y del
contrato están en [data-model.md](./data-model.md) y [contracts/api.md](./contracts/api.md).

### V1 — Registro, sesión y aislamiento entre usuarios (US1, FR-001 a FR-003)

1. Registrarse con `ana@example.com` → se entra en la aplicación.
2. Cerrar sesión e iniciarla en otra ventana privada → se ven los mismos datos.
3. Registrar a `beto@example.com` y pedir por la API un entrenamiento de Ana → `404`.

**Esperado**: test E2E `auth.spec` y tests de integración de propiedad en verde.

### V2 — Registrar un entrenamiento completo (US1, FR-007 a FR-011, SC-001)

1. Iniciar un entrenamiento, añadir "Press de banca" y registrar 3 series (60 kg × 8).
2. Contar las interacciones por serie con el ejercicio seleccionado → **≤ 3**.
3. Añadir "Sentadilla", registrar 2 series y finalizar.

**Esperado**: el resumen muestra 2 ejercicios, 5 series y el volumen correcto; en P1 se compara la persistencia exacta contra el fixture en la BD y se comprueba el prellenado tras reingresar, sin usar consultas ni pantallas P2. La inclusión en la pantalla de historial se verifica en V8.

### V3 — Prellenado con la última sesión (US1 escenario 7, FR-009)

1. Con V2 hecho, iniciar otro entrenamiento y añadir "Press de banca".

**Esperado**: la primera serie aparece con 60 kg × 8 y se muestra la sesión anterior.

### V4 — Validaciones (FR-008, FR-027)

| Entrada | Esperado |
|---|---|
| 0 kg × 10 | Se acepta (peso corporal) |
| 500 kg × 1 | Se acepta |
| 500,01 kg | Rechazado: máximo 500 kg |
| 1102,31 lb | Se acepta (≈ 499,999 kg) |
| 1102,32 lb | Rechazado |
| 60,125 kg | Rechazado: máximo 2 decimales |
| 8,5 repeticiones / 0 / 101 | Rechazado: entero de 1 a 100 |
| −5 kg | Rechazado |

**Esperado**: cada error aparece junto a su campo, y el mismo caso devuelve `400 VALIDACION` en la
API (validación idéntica en interfaz y servidor).

### V5 — Sin conexión y recarga (FR-012, SC-004)

1. Servir el build de producción por HTTPS, cargar online y esperar a que el service worker controle la página y complete el precaché del shell. Con un entrenamiento en curso, cortar la red (DevTools → *Offline*) y registrar 3 series.
2. Recargar la página sin red y cerrar y reabrir la pestaña.
3. Registrar otra serie tras la recarga/reapertura todavía sin red y restablecer la conexión.

**Esperado**: las series introducidas siguen visibles y marcadas como pendientes; al volver la conexión se
sincronizan y el indicador de pendientes llega a 0. En la base de datos hay exactamente 4 series
nuevas (sin duplicados). Cubierto por el E2E `offline.spec`.

### V6 — Conflicto entre dos dispositivos (FR-031)

1. Abrir el mismo entrenamiento en dos navegadores (A y B).
2. En A, añadir una serie; en B, añadir otra → ambas se conservan.
3. En A, cambiar la serie 1 a 65 kg; en B (sin recargar), cambiarla a 70 kg.

**Esperado**: B recibe un aviso de conflicto que muestra 65 kg y permite repetir su cambio o
descartarlo; nada se sobrescribe sin que el usuario lo decida. Repetir el paso 3 con B sin
conexión y sincronizando después produce el mismo aviso.

### V7 — Entrenamiento olvidado y entrenamiento vacío (casos límite, R-12)

1. Crear un entrenamiento en curso con `ultima_actividad_en` de hace 13 h (fixture del test).
2. Abrir la aplicación → pregunta si finalizarlo o descartarlo; al finalizar, `fin` = hora de la
   última serie.
3. Iniciar un entrenamiento y finalizarlo sin series → aviso y no aparece en el historial.

### V8 — Historial, edición y eliminación (US2, FR-015 a FR-018)

1. Con varios entrenamientos, comprobar el orden descendente, el resumen y los filtros por ejercicio
   y por fechas.
2. Editar una serie pasada → el resumen y el progreso se recalculan.
3. Eliminar un entrenamiento → pide confirmación y desaparece del historial y del progreso.

### V9 — Progreso y récords (US3, FR-019 a FR-023, SC-006)

1. Cargar el conjunto de referencia de `packages/domain/test/fixtures/progreso-referencia.json`.
2. Abrir el progreso de "Press de banca" en cada periodo.

**Esperado**: peso máximo, volumen, 1RM (Epley; series de más de 12 repeticiones y de peso 0
excluidas) y récords coinciden al 100 % con los valores calculados a mano del fixture; el gráfico
tiene una tabla equivalente. El fixture incluye obligatoriamente estos casos (FR-020 a FR-022):

| Caso | Esperado |
|---|---|
| Sesión solo con series de 0 kg (por ejemplo, dominadas) | Volumen 0; 1RM `null` (no 0) |
| Dos sesiones con el mismo peso máximo | El récord conserva la fecha de la primera |
| Primera sesión de un ejercicio, varias series crecientes | Ningún aviso de récord |
| Segunda sesión: serie con más peso que el récord | Aviso inmediato de récord de peso |
| Segunda sesión: serie que **iguala** el récord | Sin aviso; la fecha del récord no cambia |
| Segunda sesión: volumen mayor que el récord → "Terminar ejercicio" | Aviso de récord de volumen al pulsar el botón, no antes |
| Ejercicio no terminado con el botón, volumen récord → finalizar entrenamiento | Aviso de récord de volumen en el resumen final |
| Récord de volumen ya notificado → reabrir sin añadir volumen → terminar | Sin aviso (ya se notificó) |
| Récord de volumen ya notificado → reabrir, añadir una serie → terminar | Nuevo aviso con el volumen mayor |

### V10 — Cuenta y datos (US4, FR-024 a FR-026)

1. Cambiar la unidad a lb → los pesos se muestran convertidos; volver a kg → valores originales.
2. Exportar en JSON y en CSV → los archivos contienen todos los entrenamientos y series y ningún
   hash ni token.
3. Pedir la recuperación de contraseña con un email registrado y con uno inexistente → la misma
   respuesta; en Mailpit solo llega el correo del registrado. Usar el enlace → cambia la contraseña;
   reutilizarlo → enlace no válido. Un enlace de más de 1 hora → no válido.
4. Eliminar la cuenta con la contraseña → la sesión se cierra y no queda ninguna fila del usuario.

### V11 — Rutinas (US5, FR-028 a FR-030)

1. Crear "Pecho y tríceps" para el lunes con 3 ejercicios; editarla (quitar uno y añadir otro).
2. Iniciar un entrenamiento desde ella → la sesión tiene esos ejercicios en el mismo orden.
3. Cambiar la sesión (añadir un ejercicio) → la rutina no cambia. Eliminar la rutina → el
   entrenamiento no cambia.

### V12 — Calidad transversal (Principios III y VI, SC-005, SC-008)

- `npm run test:e2e` incluye axe en todas las pantallas sin incidencias críticas; se hace además la
  revisión manual (teclado, foco visible, lector de pantalla en la pantalla de registro de series).
- Controles táctiles ≥ 44×44 px en el viewport de 360 px.
- `npm run perf`: primera carga interactiva < 3 s en ≥ 4 de 5 ejecuciones; respuesta visual al
  registrar una serie < 100 ms.
- Con 500 entrenamientos sembrados (`npm run db:seed:carga`), el historial y el progreso cargan en
  < 2 s.

## Entrega y verificaciones por incremento

En T029 se ejecutan V1–V7 sin pantalla de historial, accesibilidad y rendimiento del MVP: primera carga <3 s en al menos 4/5 ejecuciones con todas las cachés vacías y respuesta visual local <100 ms, usando el perfil constitucional. V5 se ejecuta por separado tras preparar la caché estática online. El script `perf` admite el incremento P1 sin exigir rutas de P2/P3; al cierre añade la medición con 500 entrenamientos.

Mailpit y el fixture SMTP deben estar operativos antes de ejecutar la aceptación roja de P4; el correo sintético de infraestructura no implementa recuperación. El README se redacta en T061A y un segundo integrante verifica sus instrucciones desde entorno limpio en T061B antes de T062.
