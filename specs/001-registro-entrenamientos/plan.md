# Implementation Plan: Registro y seguimiento de entrenamientos

**Branch**: `001-registro-entrenamientos` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-registro-entrenamientos/spec.md`

## Summary

Aplicación web mobile-first para registrar entrenamientos de fuerza (ejercicios, series,
repeticiones y peso), consultar el historial, ver el progreso y los récords por ejercicio,
gestionar la cuenta y organizar rutinas propias por día. Se entrega en cinco historias
independientes: P1 registro con autenticación básica, P2 historial, P3 progreso, P4 cuenta y datos,
P5 rutinas.

Enfoque técnico: monorepo con npm workspaces. El **frontend** es React + TypeScript + Tailwind. El
**backend** es NestJS + TypeORM + PostgreSQL y expone una API REST. Un paquete compartido
**`packages/domain`** contiene las reglas de validación (Zod) y los cálculos (volumen, 1RM de Epley,
récords, conversión kg/lb), para que interfaz y servidor validen y calculen igual. El registro
tolera cortes de conexión con una cola local de operaciones en `localStorage` e identificadores
generados en el cliente (escrituras idempotentes). Los conflictos entre dispositivos se detectan
con bloqueo optimista (`version`) y se resuelven por el usuario. Los récords se derivan de las
series en cada consulta, sin tabla propia. Detalle de cada decisión en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`) sobre Node.js 22 LTS

**Primary Dependencies**: React 18 + Vite 6 + Tailwind CSS 4, React Router, TanStack Query,
Recharts; NestJS 11 + TypeORM 0.3, `@nestjs/jwt`, `@nestjs/throttler`, `argon2`, Nodemailer; Zod
(compartido en `packages/domain`)

**Storage**: PostgreSQL 16 (Docker Compose en desarrollo y pruebas). En el navegador,
`localStorage` para el entrenamiento en curso y la cola de sincronización

**Testing**: Vitest (dominio y frontend), React Testing Library, Jest + Supertest (API contra
PostgreSQL de pruebas), Playwright + @axe-core/playwright (E2E y accesibilidad), Lighthouse CLI
(rendimiento)

**Target Platform**: navegadores modernos (dos últimas versiones de Chrome, Safari, Firefox y Edge,
móvil y escritorio) desde 360 px de ancho; servidor Node.js en Linux

**Project Type**: aplicación web (frontend SPA + backend API REST)

**Performance Goals** (entorno reproducible de la constitución): primera carga interactiva < 3 s en
≥ 4 de 5 ejecuciones; respuesta visual local al registrar una serie < 100 ms; historial y progreso
con 500 entrenamientos < 2 s (SC-005)

**Constraints**: ≤ 3 interacciones por serie (SC-001); 0 series confirmadas perdidas con cortes,
recargas o cierres (SC-004); WCAG 2.1 AA; controles ≥ 44×44 px; HTTPS en cualquier entorno
desplegado; ningún dato personal ni secreto en logs o en el repositorio

**Scale/Scope**: proyecto académico; decenas de usuarios de prueba, hasta ~500 entrenamientos por
usuario; ~15 pantallas; 5 historias de usuario; equipo de 4 personas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| **I. Integridad y propiedad de los datos** | Ninguna operación altera datos en silencio: bloqueo optimista con `409` y resolución por el usuario (R-09). Eliminaciones con deshacer (series) o confirmación (entrenamientos, rutinas, cuenta) (R-13). Peso en kg canónico `numeric(8,4)`; el cambio kg/lb solo afecta a la visualización (R-06). `timestamptz` + zona IANA por entrenamiento (R-07). Exportación JSON y CSV y eliminación de cuenta con `ON DELETE CASCADE`, implementación sencilla (R-17, R-18). Todo cambio de esquema mediante migraciones de TypeORM. | ✅ Cumple |
| **II. Simplicidad y MVP primero** | Alcance limitado a la spec; nada de IA, funciones sociales, pagos ni wearables. Historias P1–P5 entregables por separado; P1 incluye la autenticación para aportar valor sola. Sin servicios adicionales salvo Mailpit (justificado). Dependencias fuera del stack obligatorio, justificadas en *Complexity Tracking*. | ✅ Cumple (con justificaciones) |
| **III. Registro rápido, mobile-first** | Diseño desde 360 px. Formulario de serie prellenado (FR-009) y confirmación en un toque: ≤ 3 interacciones. Escritura local inmediata y cola de sincronización en `localStorage` que sobrevive a recargas y cortes (R-08). Controles ≥ 44×44 px. | ✅ Cumple |
| **IV. Test-first** | Tests de aceptación por historia escritos y en rojo antes de implementar. Unitarios de `packages/domain` con casos límite (volumen, 1RM, récords, unidades, validación). E2E para registrar, historial, progreso y exportación. Herramientas habituales del stack; solo Docker Compose como infraestructura (R-19). Nada se integra con tests en rojo. | ✅ Cumple |
| **V. Privacidad y seguridad** | Autorización en el servidor en cada operación, filtrando por el usuario de la sesión (R-04). Argon2id; JWT en cookie `httpOnly` `Secure` `SameSite=Strict` (R-03). Tokens de recuperación guardados como hash, de un solo uso y válidos 1 h (R-05). Datos personales mínimos; logs sin cuerpos, emails, tokens ni pesos (R-21). Validación de entradas en el servidor con los mismos esquemas que el cliente (R-10). HTTPS obligatorio fuera de `localhost`. | ✅ Cumple |
| **VI. Accesibilidad** | WCAG 2.1 AA verificada con axe (automático) y revisión manual en cada historia. Gráficos de progreso con tabla equivalente; las series del gráfico no dependen solo del color (R-15). Navegación por teclado y foco visible. | ✅ Cumple |
| **Stack obligatorio** | React + TypeScript + Tailwind; NestJS + TypeScript; TypeORM; PostgreSQL; Docker Compose; API REST. | ✅ Cumple |
| **Rendimiento medible** | Lighthouse CLI con el perfil exacto de la constitución (360×800, CPU 4×, 10/5 Mbps, 100 ms), 5 ejecuciones (R-19). | ✅ Cumple |

**Resultado previo a la fase 0**: sin violaciones. Hay dependencias adicionales, justificadas abajo.

**Re-evaluación tras la fase 1** (data-model, contrato y quickstart): el diseño mantiene todos los
puntos anteriores. Se eliminó una tabla de "lápidas" para conflictos que no aportaba valor (R-09).
Las cuatro reglas de progreso y récords que quedaban abiertas se cerraron el 2026-11-11 (spec:
clarificaciones, FR-020 a FR-022; research R-11) y se revisaron contra la constitución:

- **I**: los récords siguen derivándose de las series y se recalculan al editar o eliminar; el
  criterio de empate (se conserva la primera fecha) es determinista y no altera datos guardados.
- **III**: el botón "Terminar ejercicio" se pulsa una vez por ejercicio, no por serie, así que el
  registro de una serie sigue requiriendo ≤ 3 interacciones (SC-001). Es un control táctil de
  ≥ 44×44 px.
- **IV**: cada regla (peso 0, 1RM `null`, empates, primera sesión, momento del aviso de volumen) es
  un caso límite obligatorio de los tests unitarios de `packages/domain` y del fixture V9.
- **VI**: los avisos de récord se anuncian en una región `aria-live="polite"` con texto (no solo
  color ni icono) y no roban el foco.

No quedan puntos abiertos ni violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/001-registro-entrenamientos/
├── spec.md              # Especificación (con clarificaciones 2026-11-11)
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas R-01 a R-21
├── data-model.md        # Fase 1: entidades, reglas, transiciones y catálogo
├── quickstart.md        # Fase 1: puesta en marcha y escenarios de validación V1–V12
├── contracts/
│   └── api.md           # Fase 1: contrato de la API REST
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
package.json                    # npm workspaces + scripts comunes (dev, test:*, lint, typecheck, perf)
docker-compose.yml              # postgres (gymtrack, gymtrack_test) + mailpit
.env.example                    # variables de desarrollo sin secretos reales

packages/domain/                # TypeScript puro, sin dependencias de framework (salvo Zod)
├── src/
│   ├── unidades.ts             # kg ↔ lb, redondeo para mostrar
│   ├── validacion/             # esquemas Zod: serie, entrenamiento, ejercicio, rutina, auth
│   ├── metricas.ts             # volumen, 1RM (Epley), peso máximo por sesión
│   ├── records.ts              # récords personales y detección de nuevo récord
│   └── normalizar.ts           # nombres sin mayúsculas ni tildes
└── test/
    ├── *.test.ts
    └── fixtures/progreso-referencia.json

backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── comun/                  # ZodValidationPipe, filtro de errores, guard de auth, logger sin PII
│   ├── auth/                   # registro, login, logout, recuperación (P1 / P4)
│   ├── cuenta/                 # preferencias, exportación, eliminación (P4)
│   ├── ejercicios/             # catálogo y ejercicios propios (P1)
│   ├── entrenamientos/         # entrenamientos, ejercicios realizados, series (P1 / P2)
│   ├── progreso/               # evolución y récords (P3)
│   ├── rutinas/                # rutinas por día (P5)
│   ├── correo/                 # envío con Nodemailer
│   └── database/
│       ├── data-source.ts
│       ├── migrations/         # esquema + seed del catálogo
│       └── seeds/carga.ts      # 500 entrenamientos para SC-005 (solo dev/test)
└── test/
    ├── integracion/            # *.e2e-spec.ts por módulo (Jest + Supertest)
    └── utils/                  # limpieza de la base de datos de pruebas y factorías

frontend/
├── src/
│   ├── main.tsx
│   ├── app/                    # router, layout, proveedores (TanStack Query, sesión)
│   ├── api/                    # cliente HTTP tipado según contracts/api.md
│   ├── sincronizacion/         # cola de operaciones, sincronizador, conflictos (R-08, R-09)
│   ├── textos/                 # textos de la interfaz centralizados (es)
│   ├── componentes/            # UI accesible reutilizable (botones, campos, diálogos, avisos)
│   └── paginas/
│       ├── auth/               # registro, login, recuperar, restablecer
│       ├── entrenamiento/      # entrenamiento en curso y registro de series
│       ├── historial/          # lista, filtros y detalle
│       ├── progreso/           # gráfico + tabla + récords
│       ├── cuenta/             # preferencias, exportación, eliminación
│       └── rutinas/            # lista y edición de rutinas
└── test/                       # Vitest + React Testing Library

e2e/
├── playwright.config.ts        # proyecto móvil 360×800
├── tests/                      # auth, registro, offline, conflicto, historial, progreso, cuenta, rutinas
└── lighthouse/                 # configuración del entorno de rendimiento de la constitución
```

**Structure Decision**: aplicación web en monorepo con tres workspaces (`frontend`, `backend`,
`packages/domain`) y una carpeta `e2e/` con los tests de extremo a extremo. Los módulos del backend
y las carpetas de páginas del frontend se corresponden con las historias de usuario, de modo que
cada integrante puede trabajar una historia en su propia rama con pocos conflictos de merge. La
propiedad compartida es `packages/domain` y `contracts/api.md`: sus cambios se revisan entre todos.

## Orden de entrega sugerido (para /speckit-tasks)

1. **Base común**: monorepo, Docker Compose, migración inicial, `packages/domain` (unidades,
   validación, métricas), pipe de validación, filtro de errores, guard de autenticación.
2. **P1**: auth básica + catálogo de ejercicios + entrenamiento en curso + series + cola de
   sincronización + conflictos. Es el MVP mínimo entregable.
3. **P2**: historial, detalle, filtros, edición y eliminación.
4. **P3**: progreso y récords (reglas de R-11; incluye el botón "Terminar ejercicio").
5. **P4**: preferencias kg/lb, exportación, recuperación de contraseña, eliminación de cuenta.
6. **P5**: rutinas.

Tras la base común, P2, P4 y P5 pueden avanzar en paralelo con P1, siempre contra el contrato
acordado.

## Complexity Tracking

> Sin violaciones de la constitución. Esta tabla justifica, como pide el Principio II, las
> dependencias, capas y servicios que van más allá del stack obligatorio.

| Elemento añadido | Por qué es necesario | Alternativa más simple descartada porque |
|---|---|---|
| `packages/domain` (tercer workspace) | Validación idéntica en interfaz y servidor (clarificación 4) y lógica de dominio probada una sola vez (Principio IV) | Duplicar reglas en frontend y backend provoca divergencias difíciles de detectar |
| Zod | Esquemas compartidos que además generan los tipos TypeScript | `class-validator` no se reutiliza bien en el frontend |
| Mailpit (contenedor en Docker Compose) | Probar la recuperación de contraseña sin servicios de pago (clarificación 3) y leer los correos en los E2E | Mostrar el enlace en la consola expone un secreto en los logs (Principio V) |
| Nodemailer | Enviar el correo de recuperación por SMTP | Implementar SMTP a mano |
| `argon2` | Hash de contraseñas exigido por el Principio V | Ninguna: es obligatorio |
| `@nestjs/jwt` | Firmar y verificar la sesión | Sesiones en tabla propia: más código y consultas |
| `@nestjs/throttler` | Limitar la fuerza bruta en login y recuperación (Principio V) | Sin límite: riesgo de adivinar contraseñas |
| React Router | Navegación entre ~15 pantallas | Navegación manual con estado: frágil y sin URLs compartibles |
| TanStack Query | Caché e invalidación tras cada edición (historial y progreso recalculados) | `fetch` a mano: datos desactualizados y más código |
| Recharts | Gráficos de progreso (FR-019) | SVG a mano: mucho más tiempo del equipo |
| Cola de sincronización en `localStorage` | Exigida por el Principio III y FR-012 / SC-004 | Ninguna más simple cumple el requisito; se descartaron IndexedDB y *service worker* por complejidad |
| Bloqueo optimista (`version`) | FR-031: detectar conflictos sin sobrescribir en silencio | "Gana el último" (descartado en la clarificación 5) |
| Playwright, axe, Lighthouse CLI | E2E de flujos críticos, accesibilidad y rendimiento reproducible exigidos por la constitución | Pruebas manuales: no son reproducibles ni bloquean la integración |
