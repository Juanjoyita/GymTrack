# Research: Registro y seguimiento de entrenamientos

**Feature**: `001-registro-entrenamientos` | **Fecha**: 2026-11-11 | **Plan**: [plan.md](./plan.md)

Este documento resuelve las incógnitas técnicas del plan. El stack base (React + TypeScript +
Tailwind, NestJS + TypeORM, PostgreSQL, Docker Compose, API REST) lo fija la constitución 1.1.0 y no
se reevalúa aquí. Cada decisión sigue el formato Decisión / Razón / Alternativas.

---

## R-01. Organización del repositorio

- **Decisión**: monorepo con *npm workspaces* y tres paquetes: `backend/` (NestJS), `frontend/`
  (React + Vite) y `packages/domain/` (TypeScript puro, sin dependencias de framework).
- **Razón**: la clarificación 4 exige que la interfaz y el servidor apliquen **las mismas** reglas
  de validación, y el Principio IV exige tests unitarios de la lógica de dominio (volumen, 1RM,
  récords, conversión de unidades). Un paquete compartido evita duplicar esa lógica y permite
  probarla una sola vez. npm workspaces viene con npm: no añade herramientas.
- **Alternativas**: dos repositorios separados (duplica reglas y complica el trabajo de 4 personas);
  Nx o Turborepo (herramientas extra innecesarias para tres paquetes).

## R-02. Versiones de las herramientas

- **Decisión**: Node.js 22 LTS, TypeScript 5.x (modo `strict`), NestJS 11, TypeORM 0.3, React 18,
  Vite 6, Tailwind CSS 4, PostgreSQL 16. Las versiones exactas se fijan en `package-lock.json`.
- **Razón**: versiones estables y con soporte durante todo el curso; son las que generan las CLI
  oficiales (`nest new`, `npm create vite`).
- **Alternativas**: versiones más antiguas (sin ventajas) o *canary* (inestables).

## R-03. Autenticación y sesión

- **Decisión**: email + contraseña. Hash con **Argon2id** (paquete `argon2`). Tras iniciar sesión,
  el servidor emite un JWT firmado (`@nestjs/jwt`) con validez de 7 días, guardado en una **cookie
  `httpOnly`, `Secure`, `SameSite=Strict`**. Un `AuthGuard` global protege todas las rutas salvo las
  públicas (registro, inicio de sesión, restablecimiento). El usuario tiene un campo
  `version_token`, que se incrementa al restablecer la contraseña o al eliminar la cuenta; los JWT
  con una versión anterior se rechazan. Cerrar sesión borra la cookie.
- **Razón**: la cookie `httpOnly` impide que JavaScript lea el token (mitiga XSS). `SameSite=Strict`,
  junto con una API que solo acepta JSON, mitiga CSRF sin tokens adicionales. `version_token`
  permite invalidar sesiones sin una tabla de sesiones. Argon2id es la primera opción del Principio V.
- **Alternativas**: sesiones en servidor con tabla propia (más piezas); token en `localStorage`
  (expuesto a XSS); Passport (capa extra innecesaria para un único método de acceso); par de tokens
  *access/refresh* (complejidad no justificada en un MVP).

## R-04. Autorización (cada usuario solo accede a sus datos)

- **Decisión**: todos los repositorios de dominio filtran por `usuario_id` tomado del JWT, **nunca**
  de la URL ni del cuerpo. Un recurso de otro usuario responde `404` (igual que uno inexistente),
  para no revelar su existencia. Hay tests de integración que lo verifican en cada endpoint.
- **Razón**: Principio V (comprobación en el servidor en cada operación) y FR-002.
- **Alternativas**: comprobar la propiedad después de leer el recurso y responder `403` (revela la
  existencia del recurso y es más fácil olvidarlo).

## R-05. Recuperación de contraseña

- **Decisión**: se genera un token aleatorio de 32 bytes (`crypto.randomBytes`). En la base de datos
  se guarda **solo su hash SHA-256**, con `expira_en = ahora + 1 h` y `usado_en`. El enlace se envía
  con **Nodemailer** por SMTP. En desarrollo y pruebas, el SMTP es **Mailpit** (contenedor de Docker
  Compose, con interfaz web y API para leer los correos desde los tests E2E). La respuesta de
  `POST /auth/recuperar` es siempre `202` con el mismo cuerpo, exista o no el email. Al usar el
  token: se marca como usado, se cambia la contraseña y se incrementa `version_token` (se cierran
  todas las sesiones). El token nunca aparece en los logs.
- **Razón**: aplica tal cual la clarificación 3. Guardar solo el hash evita que una filtración de la
  base de datos permita usar enlaces vigentes. Mailpit es gratuito y local.
- **Alternativas**: proveedor de email de pago (descartado en la clarificación); mostrar el enlace
  en la consola (filtra un secreto en los logs, Principio V); MailHog (sin mantenimiento).

## R-06. Unidad canónica y precisión del peso

- **Decisión**: el peso se guarda **siempre en kg** en una columna `numeric(8,4)` (4 decimales). La
  conversión usa el factor exacto 1 lb = 0,45359237 kg. La interfaz muestra el peso con 2 decimales
  como máximo en la unidad preferida. La validación (0–500 kg, máximo 2 decimales) se aplica al
  valor **en la unidad que introdujo el usuario**, y el límite de 500 kg se comprueba sobre el valor
  convertido (FR-008).
- **Razón**: con 4 decimales en kg, un valor introducido en lb con 2 decimales vuelve a mostrarse
  exactamente igual (el error máximo, 0,00005 kg ≈ 0,0001 lb, desaparece al redondear a 2
  decimales), así que cambiar kg↔lb no altera lo que el usuario ve (Principio I, US4). Una única
  unidad canónica simplifica los cálculos de progreso.
- **Alternativas**: guardar el valor y la unidad originales (dos columnas, y todos los cálculos
  tendrían que convertir); `float`/`double` (errores de redondeo binario).
- **Nota técnica**: TypeORM devuelve los `numeric` como `string`; se usa un *transformer* de columna
  que los convierte a `number`.

## R-07. Fechas y zonas horarias

- **Decisión**: todas las marcas de tiempo son `timestamptz` (UTC). Cada entrenamiento guarda la
  **zona horaria IANA** del dispositivo al iniciarse (`zona_horaria`, por ejemplo
  `America/Bogota`), y su "día local" se calcula con ella. El usuario guarda su zona horaria actual
  para los filtros por rango de fechas.
- **Razón**: Principio I y el caso límite de "fechas y zonas horarias": un entrenamiento hecho a las
  23:30 en Madrid aparece en ese día aunque luego se consulte desde Bogotá.
- **Alternativas**: usar solo la zona horaria del usuario (un viaje cambiaría el día de entrenamientos
  pasados).

## R-08. Conservación local y sincronización (FR-012, Principio III)

- **Decisión**: el frontend mantiene una **cola de operaciones pendientes** (*outbox*) persistida en
  `localStorage`. Cada operación de escritura de un entrenamiento (crear, editar o eliminar series,
  ejercicios realizados o el propio entrenamiento) se aplica primero al estado local (respuesta
  visual inmediata, < 100 ms) y se encola. Un sincronizador envía la cola **en orden**, uno a uno,
  cuando hay conexión: al arrancar la app, con el evento `online` y cada 10 s mientras queden
  pendientes. Los identificadores (UUID v4) se generan en el cliente, así que crear un recurso es
  **idempotente**: si un `POST` se repite tras un corte, el servidor reconoce el `id` y responde con
  el recurso existente sin duplicarlo. La interfaz muestra un indicador "N cambios pendientes de
  sincronizar" y marca cada serie pendiente.
- **Razón**: cumple SC-004 (0 % de series confirmadas perdidas) con recarga, cierre de pestaña y
  pérdida de conexión, sin *service worker* ni base de datos en el navegador. El volumen de datos de
  un entrenamiento (decenas de series) cabe holgadamente en `localStorage`. La spec no exige que la
  app funcione sin conexión desde el primer uso.
- **Alternativas**: IndexedDB (API asíncrona más compleja, innecesaria para este volumen); *service
  worker* con *Background Sync* (complejidad alta y soporte desigual en Safari); librerías de
  sincronización como RxDB o PouchDB (dependencia y modelo de datos ajenos al stack).

## R-09. Conflictos entre dispositivos (FR-031)

- **Decisión**: **bloqueo optimista** con una columna `version` (entera, `@VersionColumn` de TypeORM)
  en las entidades editables (`serie`, `ejercicio_realizado`, `entrenamiento`, `rutina`). Toda
  petición `PATCH` o `DELETE` incluye la `version` que el cliente conoce. Si no coincide con la
  actual, el servidor responde **`409 Conflict`** con la versión actual del recurso y no aplica
  nada. Si el recurso ya no existe, responde `404`; como el cliente solo edita o elimina recursos
  que conoce (los tiene en su estado local con su `version`), el sincronizador interpreta ese `404`
  como "eliminado desde otro dispositivo" y lo trata como un conflicto más. La creación nunca entra
  en conflicto (los `id` son únicos), así que las
  series nuevas válidas de ambos dispositivos se conservan siempre. Ante un `409`, el sincronizador
  **detiene esa operación** (no la reintenta), la saca de la cola y la muestra en un aviso de
  conflicto con la versión actual y la opción "Repetir mi cambio" (que crea una nueva operación con
  la versión actual) o "Descartar mi cambio".
- **Razón**: aplica tal cual la clarificación 5 y el Principio I (ningún cambio sobrescribe en
  silencio datos más recientes). `@VersionColumn` es una función nativa de TypeORM: no añade
  dependencias.
- **Alternativas**: "gana el último" (descartada en la clarificación); bloqueo pesimista o edición
  exclusiva por dispositivo (descartada); CRDT u *operational transform* (desproporcionado); guardar "lápidas" de los registros eliminados
  para que el servidor responda `409` en vez de `404` (tabla extra sin beneficio, porque el cliente
  ya sabe que el recurso existía).

## R-10. Validación compartida

- **Decisión**: esquemas **Zod** en `packages/domain` con las reglas de FR-008 y del resto de
  entradas. El backend los aplica con un `ZodValidationPipe` propio (unas 20 líneas) y el frontend
  los usa en los formularios para mostrar el error junto al campo (FR-027). Los errores tienen un
  formato común (ver `contracts/api.md`).
- **Razón**: una sola definición de las reglas garantiza que interfaz y servidor validan igual
  (clarificación 4) y sirve a la vez de tipo TypeScript.
- **Alternativas**: `class-validator` (el habitual en NestJS, pero no se reutiliza fácilmente en el
  frontend y obligaría a duplicar las reglas).

## R-11. Cálculos de progreso y récords personales

- **Decisión**: volumen, 1RM estimado y récords se calculan **bajo demanda** con funciones puras de
  `packages/domain` (probadas con tests unitarios) sobre los datos agregados por consultas SQL. Los
  récords **no se guardan en una tabla**: al derivarse siempre de las series, cualquier edición o
  eliminación los recalcula automáticamente (FR-021). Para avisar de un récord durante el
  entrenamiento (FR-022), el frontend carga los récords del ejercicio al añadirlo a la sesión
  (calculados solo con **sesiones anteriores**: entrenamientos finalizados distintos del actual con
  al menos una serie de ese ejercicio) y compara en local (respuesta inmediata incluso sin conexión).
- **Reglas de negocio** (spec, clarificaciones 2026-11-11):
  - **Volumen** (de carga externa) de una serie = `peso_kg × repeticiones`; con peso 0 es 0. El
    volumen de un ejercicio en una sesión es la suma de sus series en esa sesión (todas sus
    apariciones).
  - **1RM estimado** (Epley) = `peso × (1 + repeticiones / 30)`; con 1 repetición, el propio peso.
    **No se calcula** para series de más de 12 repeticiones ni para series con peso 0. El 1RM de una
    sesión es el de su mejor serie válida; si no tiene ninguna, la sesión no tiene 1RM (`null`, no 0).
  - **Peso máximo** de una sesión = mayor peso de sus series (puede ser 0).
  - **Empates**: un récord solo cambia cuando un valor lo **supera** estrictamente. Al igualarlo se
    conserva la fecha (y el entrenamiento) de la primera vez que se alcanzó, y no hay aviso. En la
    consulta, entre sesiones con el mismo valor máximo gana la de `inicio` más antiguo.
  - **Primera sesión**: si el ejercicio no tiene sesiones anteriores, no se muestra ningún aviso de
    récord en esa sesión; sus resultados quedan como referencia inicial.
  - **Avisos de peso máximo y 1RM**: al registrar cada serie, si su valor supera el récord anterior.
    Si la métrica todavía no tiene valor anterior (por ejemplo, 1RM de un ejercicio que antes solo
    se hizo con peso 0), no se avisa: el primer valor es la referencia inicial, igual que en la
    primera sesión.
  - **Aviso de volumen**: cuando el usuario pulsa **"Terminar ejercicio"** en un ejercicio
    realizado, se compara el volumen de ese ejercicio en la sesión con el mayor volumen de una sesión
    anterior y se avisa solo si lo supera. Los ejercicios que no se terminaron con el botón se
    comprueban al finalizar el entrenamiento, y los avisos se muestran en el resumen final.
    "Terminado" se guarda en `ejercicio_realizado.terminado_en` para que se vea igual en otros
    dispositivos; el botón no se cuenta en las ≤ 3 interacciones por serie (Principio III), porque se
    pulsa una vez por ejercicio.
  - **Reabrir un ejercicio**: el usuario puede reabrir un ejercicio terminado (desmarcarlo) y seguir
    registrando series. Los récords siempre reflejan el valor actual (FR-021). Al volver a
    terminarlo (o al finalizar el entrenamiento si sigue sin terminar), el aviso de volumen se
    comprueba de nuevo y solo se muestra si el volumen supera **a la vez** el récord anterior y el
    último volumen ya notificado para ese ejercicio en esa sesión. Ese valor se guarda en
    `ejercicio_realizado.volumen_notificado_kg`, de modo que el mismo récord no se notifica dos
    veces aunque se cambie de dispositivo. Si el ejercicio aparece varias veces en la sesión, se
    toma el mayor `volumen_notificado_kg` de sus apariciones.
- **Razón**: con 500 entrenamientos (SC-005) la agregación por ejercicio es pequeña (cientos de
  filas) y se resuelve con índices en milisegundos. Evitar una tabla de récords elimina toda la
  lógica de invalidación. Aislar las reglas en `records.ts` permite probar cada una con su caso
  límite (Principio IV).
- **Alternativas**: tabla de récords mantenida en cada escritura (riesgo de inconsistencias y más
  código); vistas materializadas (innecesarias a esta escala); avisar del volumen en cuanto el
  acumulado supera el récord (descartado: el usuario prefirió comprobarlo al terminar el ejercicio).

## R-12. Entrenamiento en curso, inactividad y entrenamiento vacío

- **Decisión**: un índice único parcial `(usuario_id) WHERE estado = 'en_curso'` garantiza FR-013 en
  la base de datos. El entrenamiento guarda `ultima_actividad_en` (se actualiza con cada serie). Si
  han pasado más de 12 h, `GET /entrenamientos/en-curso` devuelve `inactivo: true` y la interfaz
  pregunta si finalizarlo (con `fin = hora de la última serie`) o descartarlo. Al finalizar un
  entrenamiento sin series, el servidor lo elimina y responde `{ "descartado": true }`; la interfaz
  avisa al usuario.
- **Razón**: aplica los casos límite de la spec sin procesos en segundo plano (*cron*).
- **Alternativas**: un *job* periódico que cierre entrenamientos (la spec exige preguntar al usuario).

## R-13. Deshacer eliminaciones

- **Decisión**: eliminar una serie o un ejercicio realizado muestra un aviso con "Deshacer" durante
  **5 s**; la operación de borrado se encola cuando vence el plazo. Eliminar un entrenamiento, una
  rutina, un ejercicio propio o la cuenta pide **confirmación** en un diálogo.
- **Razón**: Principio I y FR-010 permiten confirmación o deshacer; deshacer es más rápido entre
  series (Principio III), y la confirmación es más segura para eliminaciones grandes.
- **Alternativas**: borrado lógico con papelera (más complejidad sin requisito que la pida).

## R-14. Ejercicios: unicidad y búsqueda sin mayúsculas ni tildes

- **Decisión**: cada ejercicio guarda `nombre_normalizado` (minúsculas, sin tildes, espacios
  compactados), calculado por una función de `packages/domain`. Un índice único sobre
  `(COALESCE(usuario_id, catalogo), nombre_normalizado)` impide duplicados dentro del catálogo y
  dentro de los ejercicios de un usuario; el servicio comprueba además que un ejercicio propio no
  coincida con uno del catálogo. La búsqueda usa `nombre_normalizado LIKE '%texto%'`. "Usados
  recientemente" se ordena por la fecha de la última serie del usuario con ese ejercicio.
- **Razón**: FR-005, FR-006 y el caso límite de nombres duplicados, sin la extensión `unaccent` de
  PostgreSQL (la normalización se hace igual en cliente y servidor).
- **Alternativas**: extensión `unaccent` + `citext` (dependencia de la configuración de la base de
  datos y no reutilizable en el frontend).

## R-15. Gráficos de progreso

- **Decisión**: **Recharts** para los gráficos de línea, siempre acompañados de una tabla
  equivalente y accesible (FR-019, Principio VI). Las series del gráfico se distinguen también por
  la forma del marcador y la etiqueta, no solo por el color.
- **Razón**: librería React madura y declarativa; dibujar gráficos a mano en SVG costaría más tiempo
  al equipo.
- **Alternativas**: Chart.js (API imperativa, menos natural en React); solo tabla (la spec pide
  gráfico y tabla).

## R-16. Estado del frontend y navegación

- **Decisión**: **React Router** para la navegación y **TanStack Query** para las lecturas del
  servidor (caché, reintentos, invalidación tras escribir). El entrenamiento en curso y la cola de
  sincronización viven en un *store* propio pequeño (contexto de React + `useReducer`) persistido
  en `localStorage`.
- **Razón**: son las opciones habituales del ecosistema React; TanStack Query evita escribir a mano
  la caché y la invalidación que necesitan historial y progreso tras cada edición (US2 escenario 4).
- **Alternativas**: Redux Toolkit (más código y conceptos); `fetch` sin caché (más errores de datos
  desactualizados).

## R-17. Exportación de datos (FR-025)

- **Decisión**: `GET /exportacion?formato=json` devuelve un documento con el usuario (sin
  credenciales), sus ejercicios propios, rutinas y entrenamientos anidados con sus series.
  `GET /exportacion?formato=csv` devuelve un CSV plano con **una fila por serie** (fecha local,
  entrenamiento, ejercicio, grupo muscular, orden, repeticiones, peso en kg, peso en lb, notas). Se
  genera en memoria (a esta escala, unos pocos MB como mucho).
- **Razón**: formatos abiertos que pide el Principio I, sin colas ni ficheros temporales.
- **Alternativas**: un ZIP con varios CSV (más complejo de abrir y de probar).

## R-18. Eliminación de la cuenta (FR-026)

- **Decisión**: `DELETE /cuenta` exige la contraseña actual. Todas las claves foráneas que dependen
  del usuario usan `ON DELETE CASCADE`, de modo que un único `DELETE` en una transacción borra todo.
- **Razón**: implementación sencilla (Principio I, versión 1.1.0) y verificable con un test de
  integración que comprueba que no queda ninguna fila del usuario.
- **Alternativas**: borrado diferido o anonimización (no lo pide la spec).

## R-19. Estrategia de pruebas (Principio IV)

- **Decisión**:
  - `packages/domain`: **Vitest**, tests unitarios con casos límite (Epley, volumen, conversión de
    unidades, validación, normalización de nombres).
  - `backend`: **Jest** (el que trae NestJS) + **Supertest** para tests de integración de la API
    contra un PostgreSQL de pruebas en Docker Compose (base de datos `gymtrack_test`, se limpia
    entre suites).
  - `frontend`: **Vitest** + **React Testing Library** para componentes y para la cola de
    sincronización.
  - E2E: **Playwright** con el perfil de móvil 360×800 para los flujos críticos (registrar
    entrenamiento, consultar historial, ver progreso, exportar datos), incluido un test que corta la
    red (`context.setOffline`) y recarga la página (SC-004).
  - Accesibilidad: **@axe-core/playwright** en cada pantalla (automático) + lista de comprobación
    manual (teclado, foco, lector de pantalla) en los criterios de aceptación.
  - Rendimiento: **Lighthouse CLI** con una configuración que reproduce el entorno de la
    constitución (360×800, CPU 4×, 10/5 Mbps, 100 ms), ejecutado 5 veces sobre el *build* de
    producción.
- **Razón**: todas son herramientas habituales del stack, sin servicios externos ni infraestructura
  compleja; la única dependencia de infraestructura es el Docker Compose que ya exige la
  constitución.
- **Alternativas**: Cypress (más pesado y sin emulación de red tan directa); Testcontainers
  (infraestructura extra frente a Docker Compose).

## R-20. Catálogo inicial de ejercicios

- **Decisión**: 50 ejercicios en español con su grupo muscular principal, cargados con una
  migración de datos (*seed*) idempotente. Grupos musculares: pecho, espalda, hombros, bíceps,
  tríceps, antebrazos, cuádriceps, isquiotibiales, glúteos, gemelos, abdomen. El listado completo
  está en [data-model.md](./data-model.md#catálogo-inicial).
- **Razón**: la spec delega en el plan el contenido exacto del catálogo.

## R-21. Protección básica de los endpoints de autenticación

- **Decisión**: `@nestjs/throttler` limita `POST /auth/login`, `POST /auth/registro` y
  `POST /auth/recuperar` a 10 peticiones por minuto por IP. Los logs registran método, ruta, código
  y duración, **nunca** cuerpos, emails, tokens ni pesos.
- **Razón**: Principio V (datos sensibles fuera de los logs; protección mínima frente a ataques de
  fuerza bruta contra contraseñas y enlaces). Es un módulo oficial de NestJS con una sola línea de
  configuración. No añade funcionalidad visible.
- **Alternativas**: sin límite (riesgo de fuerza bruta); bloqueo de cuentas (no lo pide la spec y
  permite bloquear cuentas ajenas).
