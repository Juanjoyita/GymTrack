# Verificación de T019 — API del catálogo de ejercicios

Fecha: 2026-11-13. Solo T019 (I3). Sin registro en AppModule (T023), prellenado `GET /ejercicios/:id/ultima-sesion` (T022) ni selector (T025).

## Alcance y prerrequisitos

T016 (PR #15) y T018 (PR #17) integradas en `001-registro-entrenamientos` (4f03f8d). Fuentes revisadas: contrato «Ejercicios — P1» y tabla de errores, data-model «ejercicio», R-04, R-10 y R-14, FR-004 a FR-006, FR-028, y los casos límite de duplicados y borrado en uso.

## Archivos

| Archivo | Contenido |
|---|---|
| `backend/src/ejercicios/ejercicios.service.ts` | listar (recientes y alfabético, búsqueda normalizada, `limite`), crear, actualizar y eliminar propios |
| `backend/src/ejercicios/ejercicios.controller.ts` | `GET/POST /ejercicios`, `PATCH/DELETE /ejercicios/:id` (204); usuario tomado de la sesión |
| `backend/src/ejercicios/ejercicios.module.ts` | Módulo listo para que T023 lo importe |
| `backend/src/ejercicios/ejercicios.validation.ts` | Reutiliza `ZodValidationPipe` (T009) con los esquemas del dominio; valida `q` y `limite` |
| `packages/domain/src/validacion/ejercicio.ts` | Decisión A aprobada: nombre de 1 a 80 tras recortar y `grupoMuscular` obligatorio de la lista; añade `GRUPOS_MUSCULARES` y `esquemaActualizacionEjercicio` |
| `packages/domain/src/normalizar.ts` | Decisión A aprobada: compacta los espacios internos (R-14) |
| `packages/domain/test/{ejercicio,normalizar}.test.ts` | Pruebas de esos ajustes |
| `backend/test/integracion/ejercicios.service.e2e-spec.ts` | 21 pruebas del servicio aislado sobre PostgreSQL real con el catálogo de T018 |
| `backend/test/integracion/ejercicios.e2e-spec.ts` (T014, I3) | Corrección de 2 supuestos previos a T018 (ver abajo) |
| `backend/test/integracion/comun.e2e-spec.ts` (T009) | Ajuste mínimo autorizado del ejemplo (ver abajo) |
| `specs/001-registro-entrenamientos/tasks.md` | Solo T019 marcada |

## Comportamiento implementado

- **GET**:
  - Devuelve el catálogo global y los propios del usuario, sin los propios ajenos, con la forma `{ id, nombre, grupoMuscular, propio, ultimoUso }`.
  - `ultimoUso` es la última serie **del propio usuario** con ese ejercicio (R-14).
  - Orden: recientes primero y después `nombre_normalizado COLLATE "C"`, con `id` para desempatar.
  - `q` se normaliza con `normalizarNombre` y usa `LIKE` con `%`/`_` escapados.
  - `limite` admite enteros de 1 a 100; por defecto 20 (el ejemplo del contrato). Fuera de rango devuelve 400 VALIDACION por campo.
- **POST**:
  - Responde 201 con el ejercicio propio y guarda el nombre recortado.
  - Si el nombre coincide con uno propio o del catálogo, responde 409 EJERCICIO_DUPLICADO con el existente en `actual`, priorizando el del catálogo. Los propios de otros usuarios no cuentan.
  - Si dos peticiones crean el mismo nombre a la vez, la violación de unicidad (23505) se traduce en el mismo 409.
- **PATCH**:
  - Solo sobre ejercicios propios, también si ya tienen series. Admite `nombre` y/o `grupoMuscular`.
  - Renombrar a un nombre existente responde 409 EJERCICIO_DUPLICADO.
  - Un ejercicio del catálogo, ajeno, inexistente o con id no UUID responde 404 NO_ENCONTRADO (R-04).
- **DELETE**:
  - Responde 204 si el ejercicio no está en uso.
  - Si está en uso, responde 409 EJERCICIO_EN_USO con `actual: { entrenamientos, rutinas }`: los entrenamientos se cuentan sin repetir y las rutinas se devuelven por nombre, en orden.
  - El borrado se hace en una transacción con bloqueo `FOR UPDATE`. Si la clave foránea diferida (23503) salta al confirmar, se traduce en el mismo 409.
- **Interpretación:** un ejercicio que aparece en un entrenamiento **sin series** también bloquea el borrado y cuenta en `entrenamientos`. La clave foránea `NO ACTION` lo impediría igualmente, y borrar ese ejercicio realizado alteraría el entrenamiento del usuario.

## Test-first

| Suite | Antes | Después |
|---|---|---|
| Dominio | 6 rojos nuevos (sin `GRUPOS_MUSCULARES`, 81 caracteres y grupo inválido aceptados, espacios sin compactar) | 29/29 verdes |
| Servicio (`ejercicios.service.e2e-spec.ts`) | Rojo: no existía el módulo `ejercicios.service` | 21/21 verdes |

## Aceptación T014 con arnés temporal

Se registraron `AuthModule` y `EjerciciosModule` en `app.module.ts` **solo durante la ejecución**, con un `JWT_SECRET` aleatorio, y después se revirtió el archivo (no forma parte del commit; el cableado es de T023).

- Primera ejecución: 12/14. Los 2 fallos eran supuestos de las pruebas de T014 (I3), escritas antes de que existiera el catálogo de T018:
  1. La lista sin `limite` daba por hecho que los fixtures aparecerían entre los 20 primeros. Ahora se pide `limite=100`.
  2. La comprobación de inmutabilidad comparaba todo el catálogo con los 3 fixtures. Ahora se limita a los ids de los fixtures. Los PATCH y DELETE ya respondían 404 y las aserciones siguen intactas.
- Tras la corrección: **14/14 verdes**. Sin el arnés siguen en rojo (404 por rutas no registradas) hasta T023, como exige tasks.md.

## Ajuste de `comun.e2e-spec.ts` (T009, autorizado)

La prueba «usa el resultado transformado por el esquema compartido» usaba `esquemaEjercicio` como ejemplo del pipe sin enviar `grupoMuscular`, que ahora es obligatorio por el contrato. Ahora envía `grupoMuscular: 'pecho'` y espera `{ nombre: 'Press', grupoMuscular: 'pecho' }`. Conserva lo que comprueba: el recorte y el descarte del campo `ignorado`.

## Resultados finales

| Verificación | Resultado |
|---|---|
| Dominio | 29/29 verdes |
| Backend | 91 verdes y 32 rojos esperados (T012 11, T013 7, T014 14). Mismos 32 rojos y mismos motivos que tras T018: 0 diferencias |
| Frontend | 29 verdes y 7 rojos esperados (interfaz de T014, pendiente de T024/T025) |
| `npm run typecheck` | Salida 0 |
| ESLint de los archivos de T019 (`--max-warnings 0`) | Salida 0 |
| `npm run lint` global | Salida 1 solo por los errores previos de T017 (`sesiones.service.ts` y su spec, Integrante 2), sin cambios aquí |

## Comandos reproducibles

Con Node 22, `.env` local, `docker compose up -d --wait postgres` y certificados TLS:

```sh
npm run test:domain
npm run test --workspace backend -- --runTestsByPath test/integracion/ejercicios.service.e2e-spec.ts
npm run test:backend      # 91 verdes; 32 rojos esperados hasta T023
npm run typecheck
npx eslint backend/src/ejercicios backend/test/integracion packages/domain --max-warnings 0
```

Datos sintéticos (`example.invalid`); sin secretos.
