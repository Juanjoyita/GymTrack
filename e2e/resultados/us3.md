# Evidencia T043 — Progreso y récords

Fecha: 2026-11-16 (America/Bogota). Alcance exclusivo: T043, V9 y regresión V8.

**Estado: pendiente de completar la revisión con lector de pantalla real.** La casilla T043
permanece abierta: las comprobaciones funcionales y automáticas no sustituyen ese requisito
de accesibilidad de US3. No se hicieron commits ni se avanzó a T043A.

## Entorno y preparación

- Node 22.23.5, Chrome estable 157.0.8103.78, viewport 360×800 y zona America/Bogota.
- Build de producción, HTTPS con CA local confiable, sin ignorar errores TLS; service worker activo.
- PostgreSQL 16 mediante Docker Compose, base `gymtrack_test`, migraciones y cuentas sintéticas
  con limpieza por fixture. Se inició Docker Desktop y `docker compose up -d --wait postgres`.
- Checklist `requirements.md`: 16/16 completados. Constitución 1.1.0 y plan revisados.
  No existe `.specify/extensions.yml`; no hay hooks que despachar.
- T029 sigue pendiente en el plan de tareas; esta ejecución no certifica la puerta MVP ni la
  auditoría transversal T059. T042 ya estaba marcada como completada.

## Cambios

`e2e/tests/progreso.spec.ts`:

- Aserciones por fila y celda con fecha y número en español: evitan falsos positivos al buscar
  valores en cualquier lugar de la tabla. No se importan los formateadores de producción.
- Récords visibles, primera fecha en empate, axe de progreso y registro, tamaño de selectores,
  navegación con Tab y conservación del foco al anunciar récords.
- Regresión integrada de edición y eliminación desde historial, tras haber cargado la caché
  de progreso: tabla, número de sesiones del gráfico y récords se actualizan sin recarga manual.
- Persistencia del volumen notificado comprobada directamente en PostgreSQL antes de recargar:
  reabrir y terminar no repite el aviso; añadir volumen permite un nuevo aviso.
- Caso visible de peso cero, 1RM ausente y aviso de tendencia insuficiente con una sesión.

No se modificó código de aplicación, esquema, dependencias ni la aceptación previa de historial.
Esta tarea amplía la verificación de la implementación existente; no acredita retrospectivamente
el rojo de T036/T037. El primer intento integrado falló por infraestructura no iniciada y hubo
una corrección del selector de texto de la nueva prueba de tendencia; no eran fallos de dominio.

## Métricas comprobadas a mano — SC-006

Volumen = suma de peso × repeticiones. Epley = peso × (1 + repeticiones / 30), salvo una repetición
(peso directo), peso cero o más de 12 repeticiones (sin 1RM). El redondeo a dos decimales es visual.

| Fecha | Cálculo del volumen | Peso máximo | Mejor 1RM |
|---|---|---:|---:|
| 2024-06-15 | 50×10 + 60×5 = 800 | 60 | 70 |
| 2026-02-01 | 70×5 + 60×8 = 830 | 70 | 81,666666… |
| 2026-09-10 | 75×5 + 60×8 = 855 | 75 | 87,5 |
| 2026-11-02 | 75×5 + 60×8 + 0×10 + 1×13 = 868 | 75 | 87,5 |
| 2026-11-03, dominadas | 0×10 + 0×8 = 0 | 0 | null |

Coincidencia del conjunto de referencia: 100 % (con tolerancia numérica en decimales periódicos).
Peso máximo 75 y 1RM 87,5 conservan 2026-09-10; volumen 868 corresponde a 2026-11-02.
Periodos 1m/3m/1a/todo: 1/2/3/4 sesiones de press respectivamente.

Corrección de la primera serie del 2 de noviembre: 90×5 + 60×8 + 1×13 = **943**, peso máximo
**90**, 1RM **105**. Tras eliminar esa sesión quedan tres puntos y récords **75/87,5/855**.
El volumen de aviso es 75×5 + 65×8 = **895**; al añadir 10×1 pasa a **905**.

## Pruebas y comandos

Ejecutados con `PATH=/Users/vanne/.nvm/versions/node/v22.23.5/bin:$PATH` para integración/E2E:

| Comando | Resultado |
|---|---|
| `npm run test:e2e -- e2e/tests/progreso.spec.ts e2e/tests/historial.spec.ts` | 11/11 verdes (9 progreso, 2 historial), 14,9 s |
| `npm run test --workspace backend -- --runTestsByPath test/integracion/progreso.e2e-spec.ts test/integracion/historial.e2e-spec.ts` | 11/11 verdes (6 progreso, 5 historial) |
| `npm run test:domain` | 48/48 verdes, incluidos límites Epley 1/2/12/13, agregación y recálculo |
| `npm run test:frontend` | 220/220 verdes |
| `npm run typecheck` | Verde en los tres workspaces y E2E |
| `npm run lint` | Verde, sin advertencias |
| `git diff --check` | Verde |

Los avisos cubren primera sesión, primera métrica válida, empate, peso/1RM inmediato, volumen al
terminar y al finalizar globalmente, reabrir sin cambios y superar el volumen notificado.
V8 conserva orden, filtros, edición, confirmación/cancelación, persistencia y aislamiento REST.
SC-007: 119 ms para abrir el detalle desde historial (límite 15 s). El runner devuelve código 0;
el mensaje de cierre del servidor aparece al apagarlo al terminar Playwright y no falla la suite.

## Accesibilidad automática y revisión manual realizada

- axe sin violaciones en progreso con datos, sesión de peso cero, registro con aviso y las
  pantallas de historial ya cubiertas por V8. Progreso usa etiquetas WCAG 2 A/AA y 2.1 AA.
- Pruebas de teclado: Tab de Ejercicio a Periodo; Escape y devolución del foco en confirmación
  de historial. El aviso de récord mantiene el foco en Añadir serie y usa `aria-live="polite"`.
- Selectores de progreso de al menos 44×44 px. Revisión de estilos: contorno visible lima de
  2 px y controles con área mínima de 44 px.
- Inspección manual de la captura móvil `test-results/us3-progreso-movil.png`: etiquetas,
  cifras y fechas legibles; líneas sólida/discontinua y volumen en panel independiente;
  tabla con los mismos valores y unidades. Revisión del árbol accesible: H1, región de récords,
  nombre del gráfico que remite a la tabla, caption y encabezados de filas/columnas.
- Revisión del código: gráfico y tabla reciben los mismos puntos calculados; no dependen solo
  del color. La captura es una evidencia local regenerada por Playwright, no un archivo versionado.

**Pendiente obligatorio:** recorrido con un lector real (por ejemplo VoiceOver): seleccionar
ejercicio/periodo, leer cabeceras y valores de tabla y fechas de récords, registrar una serie y
escuchar el anuncio una sola vez sin pérdida de foco, y confirmar/cancelar eliminación. No se
ha ejecutado ni escuchado un lector real en esta sesión; el árbol accesible no demuestra esa
experiencia. Por ello no se declara la revisión manual completa ni cumplimiento global de WCAG.

## Regresión de la suite E2E completa

- `npm run test:e2e`: **33/33 pruebas aprobadas**, salida 0 (51,9 s).
- Infraestructura comprueba la pantalla de inicio de sesión al abrir la aplicación sin sesión.
- La prueba sin conexión espera a que la serie inicial se sincronice antes de cortar la red.
- La prueba de respuesta local espera a que el navegador publique la medición. Resultado: **28,1 ms**, bajo el límite de 100 ms.
- `npm run lint`, `npm run typecheck:e2e` y `git diff --check`: correctos.
- Sigue pendiente el recorrido manual con lector de pantalla.
