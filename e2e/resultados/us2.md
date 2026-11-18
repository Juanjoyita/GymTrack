# Evidencia US2 — Historial de entrenamientos

## Alcance

Se ejecutaron T030–T035. T029 permanece pendiente por el reinicio offline de Chrome referido en el contexto previo; se continuó con US2 por autorización explícita. El archivo `e2e/resultados/us1.md` citado en ese contexto no está presente en este checkout y no se recreó fuera del alcance. No se comprobó el recálculo de progreso, que corresponde a la regresión de T043.

Al comenzar esta ejecución, los cambios de T030–T035 ya estaban en el árbol de trabajo y sus casillas ya estaban marcadas. Se conservaron. Se volvieron a ejecutar y validar las pruebas; no se puede acreditar retrospectivamente el estado rojo previo a la implementación en este checkout.

## Resultados

| Comprobación | Resultado |
|---|---|
| Aceptación REST de historial | 5/5 pruebas aprobadas |
| V8 Playwright | 2/2 pruebas aprobadas; build de producción incluido |
| Pruebas unitarias frontend | 143/143 pruebas aprobadas |
| Tipos de frontend y E2E | Aprobados |
| ESLint de archivos modificados | Aprobado, sin advertencias |
| `git diff --check` | Aprobado |
| SC-007 — abrir el entrenamiento más reciente | 604 ms; límite <15 s |
| axe | 0 violaciones en detalle con datos y lista vacía |

## Fixture, base de datos y aislamiento

- La aceptación REST usa dos usuarios y confirma que el usuario B recibe 404 al consultar, actualizar o eliminar el entrenamiento del usuario A.
- Playwright registra una cuenta de fixture, siembra dos entrenamientos finalizados y comprueba la lista, filtro combinado por ejercicio y día local, y el detalle más reciente.
- Tras corregir una serie de 8 a 9 repeticiones y guardar la nota, la prueba consulta PostgreSQL y comprueba ambos valores persistidos.
- Tras confirmar la eliminación, la prueba verifica que el entrenamiento ya no existe en la base de datos. Cancelar mantiene el detalle y no borra el registro.

## Accesibilidad y teclado

- Revisión axe sin violaciones en detalle y estado vacío.
- Orden semántico de encabezados: título de página H1 y ejercicios H2.
- Los filtros y campos de edición tienen etiquetas asociadas; acciones y enlaces conservan foco visible.
- Pruebas de teclado verifican foco visible con Tab, cierre del diálogo con Escape y retorno del foco al control que lo abrió. El botón Cancelar conserva el detalle sin ejecutar la eliminación.
- Alcance probado: Chrome 157.0.8103.51, viewport 360×800, zona `America/Bogota`. No se ejecutó una auditoría con lector de pantalla ni una matriz de otros navegadores.

## Comandos

- `npm run test --workspace backend -- --runTestsByPath test/integracion/historial.e2e-spec.ts`
- `fnm exec --using=22.23.3 node scripts/e2e.mjs e2e/tests/historial.spec.ts`
- `npm run typecheck --workspace frontend`
- `npm run typecheck:e2e`
- `npm exec eslint -- ...` sobre los archivos modificados
