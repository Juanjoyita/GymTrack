# Verificación de T014 — Aceptación del catálogo de ejercicios en rojo

Fecha: 2026-11-13. Solo T014 (I3). Sin implementación del catálogo.

## Alcance y prerrequisitos

T001–T013 completas e integradas en `001-registro-entrenamientos` (85f194f). Se revisaron constitución 1.1.0, spec (US1 escenarios 4 y 8, casos límite de duplicados y borrado, FR-004 a FR-006, FR-028), plan, research R-04/R-14/R-20, data-model (`ejercicio`, `rutina_ejercicio`) y contrato REST (Ejercicios — P1 y tabla de errores).

T014 se marca completa porque sus pruebas están escritas y se ejecutaron en **rojo**, no porque exista el catálogo. Sin skip, `test.fail`, aserciones invertidas ni mocks de servicios del backend. No se anticipan T018 (migración del catálogo), T019 (API), T023 (rutas) ni T025 (selector).

## Archivos

- `backend/test/integracion/ejercicios.e2e-spec.ts`: 14 casos Jest/Supertest sobre AppModule real, HTTPS con CA explícita y esquema aislado por proceso en gymtrack_test (mismo arnés que T012/T013). Fixtures por SQL: 3 ejercicios de catálogo y 1 propio por usuario, con nombres «T014» que no coinciden con los 50 de T018.
- `frontend/test/catalogo.test.tsx`: 7 casos Vitest/RTL que renderizan la aplicación real (rutas + proveedores). Solo se sustituye `fetch` por una API en memoria que responde según el contrato.
- `specs/001-registro-entrenamientos/tasks.md`: solo T014 marcada.
- `backend/test/resultados-t014.md`: este informe.

No se modifican `backend/src`, `frontend/src`, `packages/domain`, contrato, scripts ni dependencias.

## Cobertura de requisitos

| Requisito | Casos REST | Casos de interfaz |
|---|---|---|
| FR-004 catálogo global con grupo muscular | lista catálogo y propios con la forma del contrato | recientes primero |
| FR-006 búsqueda sin mayúsculas ni tildes | busca sin mayúsculas/tildes; respeta `limite` | filtra sin mayúsculas ni tildes |
| FR-006 recientes primero (R-14: última serie del usuario) | ordena recientes y después alfabéticamente; el uso de otro usuario no cuenta | recientes primero |
| FR-005 / escenario 8: crear propio y usarlo de inmediato | crea propio visible solo para su dueño y buscable | crea y lo añade al entrenamiento |
| Validación (data-model: 1–80 caracteres, enum de grupo) | 400 VALIDACION por campo; límite de 80 aceptado | — |
| Caso límite: duplicados | 409 EJERCICIO_DUPLICADO con el existente (propio, catálogo y al renombrar); otro usuario sí puede repetir el nombre | sugiere el existente sin ofrecer crear |
| FR-005 renombrar (también con series) | renombra y cambia grupo; 400 si queda vacío | renombra propio; sin edición del catálogo |
| FR-005 eliminar propio sin uso | 204 y desaparece; segundo DELETE 404 | elimina propio sin uso |
| Bloqueo de borrado con series | 409 EJERCICIO_EN_USO `{entrenamientos: 2, rutinas: []}` | explica el bloqueo y lo conserva |
| Bloqueo de borrado en rutinas (FR-028) | 409 EJERCICIO_EN_USO `{entrenamientos: 0, rutinas: ['Pecho y tríceps']}` | (mismo aviso) |
| Catálogo global inmutable | PATCH/DELETE 404 NO_ENCONTRADO; filas del catálogo intactas | sin botones de renombrar/eliminar |
| Escenario 4 / R-04 aislamiento | otro usuario no ve, renombra ni elimina; 404 | — |
| Autenticación obligatoria | GET/POST/PATCH/DELETE sin sesión → 401 NO_AUTENTICADO | — |

## Resultado REST: 14/14 rojos

Ejecución: **1 suite fallida, 14 pruebas fallidas, 0 errores de compilación ni de configuración**, salida 1. Migraciones, fixtures (series, entrenamientos y rutinas insertados antes del login en 5 casos) y handshake HTTPS funcionan.

| Caso | Rojo observado |
|---|---|
| 13 casos con sesión | Bloqueados en `POST /api/auth/login`: 404 en vez de 200 (auth pendiente de T016/T023). |
| Sin sesión | Las 4 operaciones devuelven 404 NO_ENCONTRADO en vez de 401 NO_AUTENTICADO (rutas no registradas). |

## Resultado de interfaz: 7/7 rojos

Ejecución: **1 archivo fallido, 7 pruebas fallidas; las 29 pruebas previas del frontend siguen verdes**. Los 7 fallan al no encontrar el botón «Añadir ejercicio» del entrenamiento en curso (la sección Entrenar todavía muestra el marcador del shell). No hay errores de importación.

Localizadores acordados para T024/T025 (roles y etiquetas accesibles en español): botón `Añadir ejercicio`; `dialog` con campo `Buscar ejercicio` enfocado al abrir y área táctil `min-h-11`; botón `Crear «…»` → selector `Grupo muscular` → botón `Guardar…`; botones `Renombrar <nombre>` / `Eliminar <nombre>` solo en ejercicios propios; campo `Nombre`; el bloqueo se anuncia con `role="alert"`. Si el borrado pide confirmación, se acepta un `alertdialog` con botón `Eliminar`.

## Interpretaciones y diferencias a resolver por los responsables

- **Catálogo inmutable → 404**: el contrato dice «solo ejercicios propios» sin fijar código. Se exige `404 NO_ENCONTRADO`, el único de la tabla de errores que aplica («no pertenece al usuario», R-04). Si el equipo prefiere otro código, debe acordarse primero en el contrato.
- **Duplicado al renombrar**: se exige `409 EJERCICIO_DUPLICADO` (la tabla de errores lo define para «nombre ya existente», sin limitarlo a POST; el índice único de data-model lo impide).
- **`ultimoUso`**: se compara con la fecha `registrada_en` de la última serie del usuario (R-14).
- **Orden alfabético**: se comprueba por inicial normalizada para no depender de la colación de PostgreSQL.
- `esquemaEjercicio` de T008 admite 100 caracteres y `grupoMuscular` opcional; data-model fija 1–80 y grupo obligatorio (columna NOT NULL, enum). T014 sigue data-model y contrato; T019 deberá alinear el esquema.
- `normalizarNombre` no compacta espacios internos, a diferencia de R-14. Los fixtures usan espacios simples, así que no afecta a T014; lo deberá revisar T019.

## Aislamiento, privacidad y limpieza

- Correos `example.invalid` y contraseña sintética; sin secretos ni datos personales. No se imprimen cookies.
- Esquema `t006_infraestructura_<pid>` creado y eliminado por caso con los helpers de T006. Consulta final: **0 esquemas de integración restantes** en gymtrack_test.
- `.env` local (contraseña aleatoria, puerto 5434 por conflicto con otro PostgreSQL) y certificados TLS de prueba (CA openssl temporal en `GYMTRACK_TLS_DIR`) quedan fuera del repositorio.

## Comandos reproducibles

Con Node 22, `.env` local, `docker compose up -d --wait postgres` y certificados de `npm run tls:local` (o `GYMTRACK_TLS_DIR`):

```sh
npm run test --workspace backend -- --runTestsByPath test/integracion/ejercicios.e2e-spec.ts   # 14 fallos esperados, salida 1
npm run test:frontend -- catalogo                                                             # 7 fallos esperados, salida 1
npm run test:backend      # 25 verdes; 32 rojos esperados (T012 11, T013 7, T014 14)
npm run test:frontend     # 29 verdes; 7 rojos esperados (T014)
npm run test:domain       # 19 verdes
npm run lint              # salida 0
npm run typecheck         # salida 0 (incluye pruebas y E2E)
git diff --check
```

Verde esperado: REST tras T016, T018, T019 y T023; interfaz tras T024 y T025. La suite queda intencionalmente roja: no es una puerta de integración aprobada (Principio IV).
