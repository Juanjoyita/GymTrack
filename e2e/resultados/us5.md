# Evidencia T056 — Rutinas (V11)

**Estado: completada.** V11 verifica creación, edición, orden, independencia entre la rutina y
una sesión iniciada, eliminación de rutina y eliminación en cascada de cuenta.

## Resultados

- T051 REST: 2/2 pruebas aprobadas.
- `e2e/tests/rutinas.spec.ts`: 2/2 pruebas aprobadas; incluye V11 y la regresión de rutina/sesión.
- Ejercicios y sesiones se comprueban en PostgreSQL con cuentas sintéticas aisladas por prueba.
- axe sin violaciones en los estados auditados; teclado/foco comprobados, incluido el foco inicial
  del diálogo de confirmación de borrado.
- La eliminación de cuenta comprobó la cascada de rutina, entrenamiento, ejercicio realizado y
  serie: todos los recuentos quedaron en cero.
- Ejecución E2E final combinada con accesibilidad: 3/3 pruebas aprobadas.

La automatización no sustituye la auditoría WCAG transversal T059.
