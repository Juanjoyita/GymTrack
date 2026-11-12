# Verificación de T002–T004

Fecha: 2026-11-12. Alcance: infraestructura NestJS/TypeORM, esquema inicial y migraciones. Sin historias de usuario, catálogo, frontend ni commit.

## Entorno

- Node 22.23.5, npm 10.9.10, TypeScript 5.9; versiones de dependencias fijadas en `package-lock.json`.
- PostgreSQL 16 de Docker Compose, `localhost:5433`, bases `gymtrack` y `gymtrack_test`.
- `synchronize: false`, `migrationsRun: false`, configuración desde `.env` ignorado por Git; ninguna contraseña real en este informe.
- `.nvmrc` selecciona Node 22. El equipo tenía Node 24; la verificación se ejecutó con el binario de Node 22 descargado mediante npm exec.

## Resultados

1. `npm run typecheck` y `npm run build` (comandos TypeScript equivalentes bajo Node 22): correctos.
2. Suite Jest/Supertest: **16/16 pruebas, 3 suites en verde**. Comprueba configuración inválida, separación de bases, arranque real de NestJS, conexión TypeORM y prefijo `/api` con controlador exclusivo del test.
3. Esquema `t004_verificacion` inicialmente vacío dentro de `gymtrack_test`: primera migración crea las ocho tablas del modelo y la tabla de control `migrations`. No carga ejercicios del catálogo.
4. Segunda ejecución: cero migraciones aplicadas; snapshots de las filas de las ocho tablas antes/después idénticos.
5. Restricciones verificadas: sesión activa única, límites de peso/repeticiones, nombres duplicados, protección de ejercicio referenciado, cascadas de cuenta, SET NULL del origen de rutina y preservación de usuario ajeno/catálogo. Rollback de la migración validado solo dentro de una transacción de pruebas revertida.
6. Primera corrida con `KEEP_TEST_SCHEMA=1`; después `docker compose restart postgres` y `docker compose up -d --wait --wait-timeout 60`: **healthy**. Corrida con `VERIFY_PERSISTENCE=1`: **10/10 pruebas, 3 suites en verde**; conservó una fila por tabla, peso `60.1234`, inicio UTC `2026-11-12T04:00:00.000Z`, zona IANA y registro de migración; repetir migración no alteró el snapshot. Al finalizar se eliminó exclusivamente el esquema sintético T004.
7. Desarrollo tenía `public` vacío durante las pruebas. Después `npm run db:migrate` aplicó la migración inicial y la segunda ejecución devolvió **No migrations are pending**. Quedó la migración `EsquemaInicial1794441600000` y cero usuarios de fixture en desarrollo.
8. Suite final mediante `npm run test:backend`: **16/16 en verde**. Verificación adicional con psql: esquema sintético ausente y PostgreSQL **healthy**. `git diff --check`: correcto.

## Reproducir

Con Node 22 y `.env` local configurado:

```sh
npm install
npm run typecheck
npm run build
npm run test:backend
KEEP_TEST_SCHEMA=1 npm run test:backend
docker compose restart postgres
docker compose up -d --wait --wait-timeout 60
VERIFY_PERSISTENCE=1 npm run test:backend
npm run db:migrate
npm run db:migrate
```

No ejecutar otras suites en paralelo durante la comprobación de persistencia. El helper rechaza bases distintas de `gymtrack_test`, no limpia `public` y no elimina un esquema T004 preexistente al iniciar una corrida normal: debe revisarse o completarse su verificación de persistencia primero. `db:migrate:test` permite aplicar explícitamente el esquema a `public` en pruebas; no fue necesario para la verificación aislada.

## Decisiones y límites

- Las dos FK de ejercicios conservan `ON DELETE NO ACTION` y son `DEFERRABLE INITIALLY DEFERRED`: la prueba detectó que sin diferirlas la cascada anidada de cuenta fallaba. Se verifica también `SET CONSTRAINTS ALL IMMEDIATE` antes de revertir la transacción de prueba para detectar referencias inválidas. No se implementa aún la eliminación de cuenta de P4.
- NestJS inicializa conexión y prefijo sin abrir un listener de producto: HTTPS se configura en T010A; Supertest utiliza un servidor de pruebas efímero.
- Lint global, frontend y paquete domain corresponden a tareas posteriores; no se declaran implementados.
- Auditoría npm: 10 avisos (7 bajos, 3 moderados; ninguno alto/crítico), asociados a Jest/ts-jest y TypeORM/glob/minimatch. Las correcciones completas sugeridas cambian versiones mayores, incluida TypeORM 1.1.3 frente al 0.3 exigido por el plan; no se aplicó `audit fix --force`. Quedan documentados para revisión de dependencias.
