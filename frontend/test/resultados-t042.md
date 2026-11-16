# Verificación de T042 — Integración de rutas, cliente y textos

Fecha: 2026-11-16. Solo T042 (I3). Depende de T041 (`7d94a8b`). La ruta `/progreso`, el cliente `api/progreso.ts` y los textos ya existían desde T040; no se duplican.

## Alcance

tasks.md pide comprobar:
- la invalidación tras cambios del historial;
- los avisos integrados sin añadir interacciones al registro de serie.

El responsable aprobó además:
- actualizar el progreso sin tocar Historial P2 (I4);
- conservar los récords previos para trabajar sin conexión;
- corregir la carga infinita de `/progreso` cuando falla la API.

## Diseño

**Criterio de qué cambia el progreso.** Es una función pura, `afectaAlProgreso`, en `api/progreso.ts`, aplicada a cada escritura confirmada (2xx, método distinto de GET).

Cuentan:
- crear, editar o eliminar series de un entrenamiento que no es el que está en curso;
- eliminar un ejercicio realizado o un entrenamiento;
- finalizar el entrenamiento en curso.

No cuentan:
- las notas;
- terminar o reabrir un ejercicio;
- crear entrenamientos o añadir ejercicios vacíos;
- el acceso y el catálogo;
- las series del entrenamiento en curso, que entra en el progreso al finalizarse.

**De dónde salen las escrituras.** `solicitar` (`api/cliente.ts`) avisa de cada escritura confirmada. Por ahí pasan tanto las mutaciones de Historial como la cola de sincronización, así que no hace falta tocar `sincronizacion/contexto.tsx` ni el código del Integrante 4. `Proveedores.tsx` se suscribe y llama a `actualizarProgreso`.

**Claves de caché.** Están centralizadas en `clavesProgreso`:
- la vista de `/progreso`;
- los récords previos del entrenamiento en curso.

**Qué hace `actualizarProgreso(cliente, entrenamientoId)`:**
- `resetQueries` de la vista. En TanStack Query 5 devuelve las consultas a su estado inicial, sin datos. Si la página está montada se vuelve a pedir al momento; si no, al abrirla se ve «Cargando…» y nunca un valor anterior. Por eso también se quitó `placeholderData`.
- `invalidateQueries` de los récords previos de otros entrenamientos. Se vuelven a pedir pero **conservan sus datos** si no hay red, lo que mantiene las comparaciones sin conexión de T041.
- invalidar `['ejercicios']`, porque `ultimoUso` decide el ejercicio predeterminado.

**Error de carga.** Si falla la API se muestra «No se pudo cargar tu progreso.», o «No hay conexión con el servidor.», junto con «Reintentar». Los filtros siguen visibles. No hay reintentos automáticos, igual que en Entrenar. Las tarjetas de récords solo aparecen con datos confirmados, así que no muestran «Sin datos» mientras cargan.

## Archivos

| Archivo | Cambio |
|---|---|
| `frontend/src/api/cliente.ts` (T010, I3) | `alEscribir`: avisa de escrituras confirmadas |
| `frontend/src/api/progreso.ts` (T040, I3) | `clavesProgreso`, `afectaAlProgreso` y `actualizarProgreso` |
| `frontend/src/app/Proveedores.tsx` (T024, I3) | Suscripción que actualiza el progreso |
| `frontend/src/paginas/progreso/PaginaProgreso.tsx` y `TarjetasRecords.tsx` (T040, I3) | Claves centralizadas, error con «Reintentar», sin reintentos automáticos ni datos provisionales |
| `frontend/src/paginas/entrenamiento/ListaEjercicios.tsx` y `PaginaEntrenar.tsx` (T041, I3) | Clave centralizada de los récords previos |
| `frontend/src/textos/es.ts` | Texto del error de progreso |
| `frontend/test/progreso-integracion.test.tsx` | 29 pruebas nuevas |
| `frontend/test/utils/api-entrenamiento.ts` (T027–T041, I3) | Progreso y récords calculados con el dominio a partir de los finalizados, detalle del entrenamiento, `ultimoUso` y finalizar que pasa el entrenamiento a los finalizados |
| `frontend/test/progreso.test.tsx` (T040, I3) | La sección de récords se vuelve a buscar porque se vuelve a montar al cambiar de ejercicio |

**Historial P2 (I4):** sin cambios en su código ni en sus pruebas.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | Rojo: no existían `afectaAlProgreso`, `alEscribir`, `actualizarProgreso`, `clavesProgreso` ni el estado de error |
| Prueba de que las pruebas detectan el defecto | Con la suscripción desactivada fallan las 4 de cambios (editar, eliminar, finalizar y registro a posteriori). La del registro a posteriori se reforzó para exigir que no haya tabla antigua |
| Final | **220/220 verdes** en el frontend, estables en 2 ejecuciones |

Cobertura:
- los 19 casos del criterio (incluidos el acceso, las notas y el entrenamiento en curso);
- el aviso solo con 2xx;
- `actualizarProgreso`;
- editar una serie y eliminar un entrenamiento desde Historial;
- finalizar un entrenamiento y el registro a posteriori;
- error de la API y sin red, con «Reintentar»;
- récords previos conservados sin red;
- sin interacciones ni peticiones de progreso extra al registrar series.

## Navegador real (build de producción por HTTPS, API y PostgreSQL reales, 360 px)

| Paso | Resultado |
|---|---|
| Progreso inicial | 2 nov 60/480/76 y 9 nov 70/350/81,67 |
| Historial: serie del 9 nov a 72 kg y volver a Progreso (sin recargar) | Primer instante sin filas; después 72/360/84 y récords de 72 kg y 84 kg |
| Historial: eliminar el 9 nov y volver | Primer instante sin filas; después una sola sesión, «1 sesión» en el gráfico y récords recalculados (60, 76 y 480) |
| La API falla al cambiar de periodo | «No se pudo cargar tu progreso.» y «Reintentar», que recupera la tabla |
| axe WCAG 2.1 A/AA (tras editar y en error) | **0 violaciones**; sin desplazamiento horizontal |

Las cuentas `t042.demo.*@example.invalid` se borraron de la base de desarrollo.

## E2E (Chrome, base de pruebas, puerto 5173 comprobado libre)

| Suite | Resultado |
|---|---|
| `historial.spec` (I4) | 2/2 ✓ |
| `progreso.spec` (T036, I4), avisos de T041 | 6/6 ✓ |
| `progreso.spec`, gráfico y tabla por periodo (T040) | ✘ Espera la fecha ISO «2026-11-02» y la tabla muestra «2 nov 2026» (formato español aprobado). Discrepancia conocida; la prueba no se modificó |

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 220/220 |
| Dominio | 48/48 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Pendiente

- **Formato de la tabla frente al E2E de T036 (I4):** fechas ISO y punto decimal. Hay que acordar en T043 el ajuste del E2E conservando su cobertura.
- **«Un servidor E2E terminó inesperadamente»:** aparece al cerrar los servidores E2E (script de otro integrante) y no afecta a los resultados.
