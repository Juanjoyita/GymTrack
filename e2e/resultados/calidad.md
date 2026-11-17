# Evidencia T059 — Accesibilidad y calidad

**Estado: parcial; T059 permanece pendiente.**

## Comprobaciones automatizadas

- `e2e/tests/accesibilidad.spec.ts`: 1/1 prueba aprobada, con axe WCAG 2 A/AA y 2.1 AA en
  las pantallas principales, navegación por teclado/foco y comprobación de controles táctiles.
- La auditoría cubre registro, inicio/recuperación/restablecimiento de acceso, entrenamiento,
  selector y registro de series, historial/detalle, progreso, cuenta y rutinas/editor/confirmación.
- Se comprobó a 360×800 en las rutas móviles indicadas por la prueba y a 1280×800 en las rutas
  principales de entrenamiento, historial, progreso, cuenta y rutinas.
- La ejecución E2E combinada de accesibilidad y rutinas aprobó 3/3 pruebas.
- Chrome estable 157.0.8103.79 fue el único navegador verificado en esta ejecución.

## Pendiente antes de completar T059

- Revisión manual WCAG 2.1 AA: lectura con lector de pantalla, contraste y recorrido completo
  de teclado/lectura en todas las pantallas.
- Repetir los flujos principales en las dos últimas versiones de Chrome, Safari, Firefox y Edge,
  tanto móvil como escritorio, y registrar las versiones.

axe y las comprobaciones automatizadas no acreditan esos puntos manuales ni la matriz
multinavegador; por ello no se declara cumplimiento WCAG global.
