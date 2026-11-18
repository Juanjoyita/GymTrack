# Verificación de T018 — Migración idempotente del catálogo inicial

Fecha: 2026-11-13. Solo T018 (I3). Sin API, CRUD ni pantallas del catálogo (T019, T023, T025).

## Alcance y prerrequisitos

T015 integrada (PR #14), igual que T016 y T017, en `001-registro-entrenamientos` (db92ebf). Fuentes revisadas: tasks.md (T018: «exactamente los 50 ejercicios y grupos de data-model, sin duplicados tras repetir migraciones»), data-model («ejercicio», «Catálogo inicial»), research R-14 y R-20, y quickstart (`npm run db:migrate` carga el catálogo).

## Archivos

- `backend/src/database/migrations/002-catalogo.ts`: migración `CatalogoInicial1794528000000`. Contiene 50 filas literales (id, nombre, nombre normalizado, grupo) en el orden de data-model, todas con `usuario_id = NULL`. `up` usa `INSERT … ON CONFLICT DO NOTHING`; `down` borra solo esos ids del catálogo.
- `backend/src/database/data-source.ts`: registra la migración tras `EsquemaInicial1794441600000`.
- `backend/test/integracion/catalogo.e2e-spec.ts`: 5 pruebas nuevas.
- `backend/test/integracion/migraciones.e2e-spec.ts` (T002–T004): ajuste mínimo, autorizado por el responsable de T018 (ver abajo).
- `specs/001-registro-entrenamientos/tasks.md`: solo T018 marcada.

Decisiones:
- **Identificadores** fijos `c0000000-0000-4000-8000-0000000000NN` (UUID v4 válidos, NN = 01–50), estables entre entornos y reejecuciones.
- **Nombres normalizados**: se generaron con `normalizarNombre` de `@gymtrack/domain` y se guardaron como literales, para que la migración no cambie si el dominio evoluciona. La prueba exige que coincidan con la función del dominio.
- **Idempotencia**: `ON CONFLICT DO NOTHING` cubre la clave primaria y el índice único `(COALESCE(usuario_id, …), nombre_normalizado)`. Un ejercicio propio con el mismo nombre no entra en conflicto, porque la unicidad es por usuario, y no se modifica.

## Test-first

La prueba `catalogo.e2e-spec.ts` lee la tabla «Catálogo inicial» directamente de `data-model.md`, de modo que la referencia es la especificación y no la migración.

| Momento | Resultado |
|---|---|
| Antes de implementar | **5/5 rojos**. Las migraciones aplicadas eran solo `[EsquemaInicial]` y el catálogo tenía 0 filas, aunque data-model se leía con 50. |
| Después de implementar | **5/5 verdes**. |

Casos cubiertos:
1. Una base limpia aplica `[EsquemaInicial, Catalogo…]` y carga exactamente los 50 nombres y grupos de data-model, sin ejercicios propios.
2. Los UUID son únicos y fijos, `nombre_normalizado` coincide con el dominio, solo hay grupos del enum aprobado y aparecen los 11 grupos con `usuario_id` NULL.
3. Repetir `runMigrations()` aplica 0 migraciones. Ejecutar `up` dos veces más no duplica nada. Si se borra una fila del catálogo, `up` la restaura con el mismo id.
4. Los ejercicios propios existentes («Press de banca» propio y otro), comparados con un snapshot, no cambian al recargar el catálogo.
5. `down` (en una transacción revertida) elimina solo el catálogo y conserva los propios; `up` lo restaura a 50.

## Ajuste de `migraciones.e2e-spec.ts` (T002–T004)

Esa suite fijaba el estado previo a T018, «solo esquema, sin catálogo». Las aserciones que T018 invalida legítimamente se ajustaron sin eliminar ni deshabilitar ninguna prueba:

| Aserción original | Motivo | Nueva aserción |
|---|---|---|
| `runMigrations()` aplica 1 migración | Hay una segunda migración de datos | Se aplican exactamente `['EsquemaInicial1794441600000', 'CatalogoInicial1794528000000']`, en orden (más estricto que contar) |
| `ejercicio` vacía tras migrar | El catálogo se carga por migración | 50 filas de catálogo y 0 propias |
| Segunda ejecución: snapshot idéntico | Sigue siendo válida | Se conserva y se añade «el catálogo sigue teniendo 50» (sin duplicados) |
| Tras borrar la cuenta queda 1 ejercicio | Ahora también queda el catálogo | 50 + 1 (el de catálogo de la prueba) y 0 propios; confirma además que el propio del usuario borrado desaparece por cascada |
| Persistencia (`VERIFY_PERSISTENCE=1`): 1 fila por tabla | `ejercicio` incluye el catálogo | 1 fila por tabla, salvo `ejercicio` = 50 + 1 |

Se mantienen sin cambios las pruebas de integridad (sesión activa única, límites de peso y repeticiones, borrado referenciado, duplicados), las entidades TypeORM y el down/up del esquema. Se añadió la constante `CATALOGO = 50` con un comentario de origen.

## Resultados

| Verificación | Resultado |
|---|---|
| `catalogo.e2e-spec.ts` (T018) | 5/5 verdes |
| `migraciones.e2e-spec.ts` (T004 ajustada) | 7/7 verdes |
| Persistencia: `KEEP_TEST_SCHEMA=1` → `docker compose restart postgres` → `VERIFY_PERSISTENCE=1` | 1/1 verde; esquema sintético eliminado al final |
| `npm run db:migrate` dos veces en desarrollo (CLI real de TypeORM) | Se ejecutan las 2 migraciones y después «No migrations are pending». 50 en catálogo, 50 ids, 50 nombres normalizados y 11 grupos distintos |
| Backend completo | 70 verdes y 32 rojos esperados (T012 11, T013 7, T014 14) |
| Rojos esperados con y sin T018 | Mismas 32 pruebas y mismos motivos (0 diferencias): 404 por rutas sin registrar hasta T019/T023 |
| Frontend | 29 verdes y 7 rojos esperados (T014, interfaz pendiente de T024/T025) |
| Dominio | 19/19 verdes |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 1 por 11 errores **previos** en `backend/src/entrenamientos/sesiones.service.ts` y `backend/test/unitarios/sesiones.service.spec.ts` (T017, ba3b2ac), ya presentes en la rama compartida. Los archivos de T018 pasan con `--max-warnings 0`. No se corrigen aquí por pertenecer a otro módulo. |

## Comandos reproducibles

Con Node 22, `.env` local, `docker compose up -d --wait postgres` y certificados TLS:

```sh
npm run test --workspace backend -- --runTestsByPath test/integracion/catalogo.e2e-spec.ts test/integracion/migraciones.e2e-spec.ts
KEEP_TEST_SCHEMA=1 npm run test --workspace backend -- --runTestsByPath test/integracion/migraciones.e2e-spec.ts
docker compose restart postgres && docker compose up -d --wait --wait-timeout 60
VERIFY_PERSISTENCE=1 npm run test --workspace backend -- --runTestsByPath test/integracion/migraciones.e2e-spec.ts
npm run db:migrate && npm run db:migrate   # la segunda: No migrations are pending
npm run test:backend && npm run typecheck && npx eslint backend/src/database backend/test/integracion --max-warnings 0
```

Datos sintéticos (`example.invalid`, hashes ficticios); sin secretos.
