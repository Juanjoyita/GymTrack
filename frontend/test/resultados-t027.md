# Verificación de T027 — Sesión y formulario de series

Fecha: 2026-11-14. Solo T027 (I3). Depende de T026A (`8d6e685`). No incluye la pantalla de conflictos con «Repetir mi cambio» ni el registro a posteriori con fecha pasada (T028).

## Alcance

tasks.md pide:
- prellenado desde la serie actual o desde la primera de la última sesión, con la referencia anterior visible;
- notas, edición, borrado con deshacer, orden y resumen;
- registrar una serie en ≤3 interacciones y mostrar un mensaje de pendientes;
- resolver el entrenamiento vacío y la inactividad (V7).

Requisitos: FR-007 a FR-013, US1 escenarios 5–10, research R-08, R-09 y R-12, data-model «Estado local del cliente», contrato «Entrenamientos — P1». Los textos y el flujo siguen los E2E de T015 (`registro`, `offline` y `conflicto`).

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` | Iniciar, «N cambios pendientes de sincronizar», tarjetas de ejercicios, nota del entrenamiento, finalizar (resumen o descarte), diálogo de inactividad y copia local como datos iniciales |
| `frontend/src/paginas/entrenamiento/TarjetaEjercicio.tsx` | Series («Serie N», «Editar serie N», «Eliminar serie N»), formulario único para añadir o editar con validación V4 del esquema compartido, prellenado, «La última vez (fecha): …», «Deshacer» durante 6 s y nota del ejercicio |
| `frontend/src/paginas/entrenamiento/operaciones.ts` | Constructores de operaciones de la cola y un reductor puro que aplica una operación al entrenamiento, tanto para la vista (servidor + pendientes) como para incorporar la confirmación |
| `frontend/src/paginas/entrenamiento/copiaLocal.ts` | Copia local del entrenamiento en curso por usuario (`gymtrack:entrenamiento:<id>`), sin credenciales |
| `frontend/src/sincronizacion/{cola,sincronizador,contexto}` (T026, I3) | Versiones encadenadas, confirmación genérica con el reductor, aviso de confirmaciones a la página y guardado de la copia local |
| `frontend/src/paginas/entrenamiento/SelectorEjercicio.tsx` (T025, I3) | El nombre accesible del botón es exactamente el nombre del ejercicio y el grupo muscular pasa a ser su descripción, como esperan los E2E (`/^press de banca$/i`) |
| `frontend/src/componentes/CampoArea.tsx`, `frontend/src/api/ejercicios.ts`, `frontend/src/textos/es.ts` | Campo de varias líneas, `GET /ejercicios/:id/ultima-sesion` y textos |
| `frontend/test/entrenamiento.test.tsx` | 23 pruebas con una API en memoria con estado (versiona, valida y descarta como el servidor) |
| `frontend/test/sincronizacion.test.ts` | +1 prueba (encadenado de versiones) |
| `frontend/test/auth.test.tsx` (T024, I3) | Espera el título del documento en lugar de leerlo en el mismo instante (era intermitente) |

## Decisiones

- **Versiones encadenadas en la cola.** Al confirmarse un cambio, las operaciones siguientes sobre el mismo recurso heredan la versión nueva (por ejemplo, guardar la nota y después finalizar). Crear series no cambia la versión del entrenamiento en el backend.
- **Deshacer.** La eliminación se aplica a la vista al instante y solo se encola si no se deshace en 6 s. Se envía antes si se elimina otra serie, se finaliza o se sale de la pantalla.
- **Finalizar.** Con red, el resumen o el aviso de descarte se muestran cuando el servidor confirma, de modo que lo que se ve coincide con lo guardado. Sin red se muestra el resumen local con «Se guardará en el servidor cuando vuelva la conexión.».
- **Inactividad.** La regla de las más de 12 h la da el servidor (`inactivo`, R-12). Se ofrece finalizar con `fin` igual a la hora de la última serie, o seguir entrenando.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | Rojo: no existían los módulos de T027; también el encadenado de versiones de la cola |
| Hallazgos de la verificación real (3 fallos) | Cada uno se reprodujo con una prueba en rojo antes de corregirlo |
| Final | **131/131 verdes** en el frontend, estables en 5 ejecuciones seguidas |

Hallazgos corregidos:
1. **La última sesión llegaba tarde y borraba lo tecleado.** El formulario se volvía a montar al recibirla. Ahora solo adopta el prellenado si el usuario no ha escrito nada.
2. **«La última vez» no se actualizaba tras finalizar.** La consulta quedaba guardada en caché. Ahora se invalida al confirmarse la finalización.
3. **Carrera al recargar con la copia local.** La carga inicial en vuelo, anterior a la confirmación, podía pisar el cambio confirmado. Ahora, si hay una carga en vuelo, se cancela, se aplica la confirmación y se vuelve a pedir.

## Navegador real (build de producción por HTTPS, API y PostgreSQL reales, 360 px)

Se reprodujo el flujo del E2E `registro.spec` de T015:

| Paso | Resultado |
|---|---|
| Iniciar, añadir Press de banca, 60 × 8 | **3 interacciones** |
| Series 2 y 3 | Prellenadas con 60 / 8: **1 toque** cada una |
| Editar serie 1 | 62,5 kg |
| Eliminar serie 3 y «Deshacer» | Se recupera |
| Sentadilla 100 × 5 dos veces, nota y finalizar | Resumen «2 ejercicios», «5 series» y «2460 kg» |

**Datos en PostgreSQL**, iguales a los esperados por el E2E:

| Ejercicio | Series (peso × repeticiones) |
|---|---|
| Press de banca | 62,5 × 8 · 60 × 8 · 60 × 8 |
| Sentadilla | 100 × 5 · 100 × 5 |

Además: nota guardada, zona `America/Bogota`, estado finalizado con `fin` y nota de ejercicio nula.

**Nuevo entrenamiento:**
- Muestra «La última vez (14 nov): 62,5 kg × 8 · 60 kg × 8 · 60 kg × 8» y prellena 62,5 / 8.
- Con el worker activo y **sin red**: añadir serie muestra «1 cambio pendiente», recargar y **reabrir otra pestaña** conservan el ejercicio y el pendiente.
- Al volver la red: «0 cambios pendientes» y las series se guardan **una sola vez** en la base.

axe WCAG 2.1 A/AA (vacío, deshacer, en curso, resumen y sin red): **0 violaciones**. Sin desplazamiento horizontal. Las cuentas `t027.demo.*` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 131/131 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |

## Avisos para T028/T029

- **T028:** pantalla de conflictos («Repetir mi cambio» / «Descartar»; `cola.repetir` y `cola.descartar` ya existen) y registro a posteriori con fecha pasada.
- **T029, `registro.spec`:** la búsqueda «Press de banca» con la expresión sin anclar `/Press de banca/i` coincide también con «Press de banca inclinado», «…declinado» y «…con agarre cerrado» (modo estricto). `offline` y `conflicto` usan `^…$` y funcionan.
- **T029, inactividad:** el E2E consulta la base justo después de pulsar «Finalizar», sin esperar a la interfaz; puede adelantarse a la petición.
- **T029, `conflicto.spec`:** el segundo dispositivo calcula el `orden` de su serie con lo que conoce, así que dos series concurrentes pueden compartir orden. Las dos se conservan (FR-031), pero el orden 1/2/3 exacto que espera el E2E dependerá de cómo lo resuelva el backend.
