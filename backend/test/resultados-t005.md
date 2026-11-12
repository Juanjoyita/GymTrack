# Verificación de T005

Fecha: 2026-11-12. Solo herramientas del monorepo; sin commit.

## Archivos

- Raíz: `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.dockerignore`.
- Backend: `package.json`, `tsconfig.json`, `jest.config.cjs`. Se conservan migraciones y pruebas; Jest admite también unitarios futuros.
- Frontend: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `test/setup.ts`, `index.html`, `src/styles.css`. HTML provisional para verificar build y Tailwind; sin shell React de T010.
- Dominio: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `src/index.ts` (export vacío; reglas pendientes de T007/T008).
- Scripts: `scripts/dev.mjs` (dos procesos y cierre coordinado), `scripts/e2e.mjs` (delega a Playwright al existir la configuración de T006), `scripts/perf.mjs` (pendiente explícito de T028A).
- Seguimiento: únicamente T005 marcada en `specs/001-registro-entrenamientos/tasks.md` y este informe. `.vscode/` era preexistente y no se modificó.

## Entorno y dependencias

Node 22 del binario ya disponible en la caché npm; Node predeterminado del equipo sigue siendo 24, por lo que debe seleccionarse Node 22 con `.nvmrc`. Instalación mediante `npm install` con acceso autorizado al registro tras ENOTFOUND dentro del sandbox. Los tres workspaces enlazados y `npm ls --depth=0` sin dependencias inválidas.

Versiones resueltas: React 18.3.1, Vite 6.4.6, Tailwind 4.3.5, NestJS 11.2.10, TypeORM 0.3.31, TypeScript 5.9.3, Vitest 5.1.0, Jest 29.7.0, Zod 4.6.7, Lighthouse 13.6.0. Instaladas las dependencias de Router, Query, Recharts, JWT, throttler, Argon2, Nodemailer, RTL, Playwright y axe previstas en el plan; sin implementar sus funcionalidades.

Se actualizaron Vitest, Zod, Nodemailer y Lighthouse antes de validar para eliminar los avisos altos/críticos de la primera instalación. Resultado de auditoría comunicado por npm: **18 avisos (7 bajos, 11 moderados), 0 altos, 0 críticos**. No se ejecutó audit fix --force ni se cambió el stack fijado por el plan.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `npm run` | Presentes dev, test:domain, test:backend, test:frontend, test:e2e, lint, typecheck, perf; también build y db:migrate/test. |
| `npm run --workspaces` | Scripts de los tres paquetes enumerados correctamente. |
| `npm run lint` | Verde, sin advertencias. |
| `npm run typecheck` | Verde en los tres workspaces y configuración/tests de dominio. |
| `npm run build` | Verde en los tres; Vite compila HTML provisional y CSS Tailwind. |
| `npm run test:backend` | **16/16 pruebas y 3/3 suites verdes** con acceso autorizado a PostgreSQL local. El intento dentro del sandbox falló por conexión; se repitió fuera y pasó. |
| `npm run test:domain` | Código 1: Vitest carga configuración, sin archivos de prueba todavía (T007). |
| `npm run test:frontend` | Código 1: Vitest carga configuración, sin archivos de prueba todavía. |
| `npm run test:e2e` | Código 1 y mensaje de infraestructura pendiente T006; no se crea su configuración ni se ejecutan navegadores. |
| `npm run perf` | Código 1 y mensaje de medición pendiente T028A; no se afirma rendimiento validado. |
| `git diff --check` | Verde. |

## Límites de alcance

T005 configura herramientas; no constituye la puerta de integración T011 ni la aceptación de historias. No se usan passWithNoTests ni pruebas artificiales para convertir suites vacías en verde. No se ejecutó el servidor web de desarrollo ni se afirma HTTPS operativo: TLS corresponde a T010A y el backend mantiene su arranque sin listener. No se modificaron el contrato REST, esquema, lógica de dominio ni historias. No se agregaron escenarios de T006/T007/T010/T028A. El comando perf queda reservado con fallo explícito hasta su implementación reproducible. No se hizo commit; queda pendiente revisión del usuario.
