# Verificación de T025 — Selector y gestión de ejercicios

Fecha: 2026-11-14. Solo T025 (I3). Depende de T024 (`0139f4e`, `7f2f18f`). No incluye iniciar o finalizar entrenamientos, series ni notas (T027), ni la cola sin conexión (T026).

## Alcance

Según tasks.md, T025 debe dejar en verde la aceptación de interfaz de T014 con recientes, búsqueda, creación inmediata, renombrado y la explicación del bloqueo de borrado. Requisitos: FR-004 a FR-006, US1 escenario 8, casos límite de duplicados y de borrado en uso, FR-028 y el contrato «Ejercicios — P1».

Las pruebas de T014 abren el selector desde un entrenamiento en curso. Por eso T025 incluye una vista **mínima** de Entrenar (aprobada por el responsable):
- carga `GET /entrenamientos/en-curso` (o 204);
- muestra los ejercicios añadidos y el botón «Añadir ejercicio».

Sin entrenamiento muestra «No tienes un entrenamiento en curso. Pronto podrás iniciarlo aquí.», sin botones. Añadir un ejercicio llama directamente a `POST /entrenamientos/:id/ejercicios` con un UUID del cliente; en T026 pasará por la cola.

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/paginas/entrenamiento/SelectorEjercicio.tsx` | Selector: recientes primero, búsqueda, creación con grupo muscular, renombrado, borrado con confirmación y aviso de uso |
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` | Vista mínima del entrenamiento en curso; el ejercicio aparece al instante y, si el servidor lo rechaza, se retira con un aviso |
| `frontend/src/api/{ejercicios,entrenamientos}.ts` | Cliente tipado del contrato |
| `frontend/src/componentes/Dialogo.tsx` | Modal accesible reutilizable: `aria-modal`, título asociado, foco atrapado, Escape y devolución del foco |
| `frontend/src/componentes/CampoSeleccion.tsx` | Lista desplegable con etiqueta y error anunciado |
| `frontend/src/componentes/{Campo,Boton}.tsx` | `forwardRef`; variante `peligro` para el botón |
| `frontend/src/componentes/Iconos.tsx`, `frontend/src/textos/es.ts`, `frontend/src/app/rutas.tsx` | Iconos, textos y la ruta de Entrenar |
| `frontend/test/selector.test.tsx` | 13 pruebas nuevas |
| `frontend/test/shell.test.tsx` (T010, I3) | La red simulada responde 204 en `/entrenamientos/en-curso`; Entrenar sale de la comprobación de «qué incluirá», que solo aplica a las secciones que siguen siendo marcadores |

## Decisiones

- **Lista completa sin buscar (`limite=100`).** La verificación real mostró que con el límite por defecto (20) «Press de banca» no aparecía sin buscar. 100 es el máximo de la API y cubre el catálogo (50) más los propios.
- **Sugerir el existente.** Si el texto coincide con un ejercicio existente (sin mayúsculas, tildes ni espacios repetidos), no se ofrece «Crear». Si el servidor detecta un duplicado que no estaba en la lista (409), se muestra «Ya existe «X»» con el botón «Usar «X»».
- **Confirmar antes de eliminar.** La spec no lo exige, pero es una acción irreversible. Se usa un `alertdialog` con el foco en «Cancelar» y el resto del diálogo inerte.
- **Sin reintentos automáticos al buscar.** Ante un fallo de red se ofrece «Reintentar» de inmediato.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | 16 rojos por funcionalidad: 7 de T014 y 9 nuevos, todos por falta de «Añadir ejercicio» o del estado vacío |
| Hallazgos de la verificación real | 4 pruebas nuevas en rojo antes de corregir: límite de la lista y devolución del foco tras renombrar y tras cancelar un borrado, y Escape con el foco fuera del diálogo |
| Final | **66/66 verdes** en el frontend (T014 de interfaz 7/7 y T025 13/13) |

## Navegador real (Chromium, API y PostgreSQL reales, 360 px)

| Comprobación | Resultado |
|---|---|
| Sin entrenamiento | Estado vacío |
| Entrenamiento creado por API (201) y abrir el selector | Foco en el buscador; 50 ejercicios del catálogo visibles sin buscar |
| Buscar «TRICEPS» | Encuentra «Extensión de tríceps…» |
| Crear «Press Hammer» (Pecho) | Se guarda y se añade; el servidor lo confirma en `ejercicios` |
| Eliminarlo | Bloqueo real: «No puedes eliminar «Press Hammer» porque aparece en 1 entrenamiento. Puedes renombrarlo.» |
| Renombrar | El foco vuelve a «Renombrar Press Hammer inclinado» |
| Escape | El foco vuelve a «Añadir ejercicio» |
| axe WCAG 2.1 A/AA (estado vacío, en curso, selector, crear, confirmar, bloqueado; tableta y escritorio) | 0 violaciones |
| Desplazamiento horizontal | Ninguno |

Las cuentas `t025.demo.*@example.invalid` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 66/66 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | 118 kB gzip |
| `git diff --check` | Correcto |

## Aviso para T029 (I4)

Los E2E de T015 (`registro`, `offline` y `conflicto`) eligen el ejercicio con `getByRole('button', { name: new RegExp(nombre, 'i') })` después de buscar «Press de banca» o «Sentadilla». En el catálogo real esas búsquedas devuelven varios ejercicios: «Press de banca inclinado», «Sentadilla frontal», etc. Además, el nombre accesible del botón incluye el grupo muscular. La expresión coincidirá con varios botones y Playwright fallará por modo estricto.

Sugerencia para T029: anclar la expresión, por ejemplo `new RegExp('^' + nombre + '\\b', 'i')` con `.first()` o `exact`. No se modifican aquí porque son pruebas de otro integrante.
