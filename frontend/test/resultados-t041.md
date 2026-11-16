# Verificación de T041 — Avisos de récord durante el entrenamiento

Fecha: 2026-11-16. Solo T041 (I3). Depende de T040 (`53745b7`). No incluye la invalidación de progreso tras editar el historial (T042).

## Alcance

tasks.md pide:
- peso máximo y 1RM tras cada serie;
- volumen solo al terminar el ejercicio o al finalizar la sesión;
- que reabrir no repita el aviso salvo si se supera el máximo ya notificado, guardado según el contrato;
- una región `aria-live` polite sin mover el foco.

Requisitos: FR-021, FR-022, R-11 y el contrato (`PATCH …/ejercicios/:erId` con `terminado` y `volumenNotificadoKg`, y `GET /progreso/:id/records?excluirEntrenamientoId=`).

Decisiones aprobadas por el responsable:
- sin avisos en el registro a posteriori;
- sin anuncio al editar una serie, aunque las etiquetas se recalculan;
- sin récords cargados no hay aviso.

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/paginas/entrenamiento/records.ts` | Reglas puras: `recordsDeSeries`, `volumenSesion` (todas las apariciones), `volumenNotificado` (máximo de las apariciones), `avisaVolumen` y `recordsDeSesion` |
| `frontend/src/paginas/entrenamiento/operaciones.ts` | `opTerminarEjercicio` y `opReabrirEjercicio` (PATCH con la versión del ejercicio, encadenada por la cola). Reductor y versión vigente ante un conflicto |
| `frontend/src/paginas/entrenamiento/ListaEjercicios.tsx` | Récords previos por ejercicio (en caché durante la sesión), etiquetas derivadas de los datos, anuncio al registrar y comprobación de volumen al terminar |
| `frontend/src/paginas/entrenamiento/TarjetaEjercicio.tsx` | Etiqueta de récord (trofeo y texto), botón único «Terminar ejercicio» / «Reabrir ejercicio» y estado terminado |
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` | Única región `aria-live="polite"` (oculta) y comprobación de volumen al finalizar |
| `frontend/src/paginas/entrenamiento/ResumenFinal.tsx` | Lista «Récords de esta sesión» |
| `frontend/src/paginas/entrenamiento/AvisoConflictos.tsx` (T028, I3) | Texto del conflicto al terminar o reabrir |
| `frontend/src/componentes/Iconos.tsx`, `frontend/src/textos/es.ts` | `IconoTrofeo` y textos |
| `frontend/test/records-entrenamiento.test.ts` | 21 pruebas: reglas con `escenariosAvisos` del fixture T036 y operaciones |
| `frontend/test/avisos-record.test.tsx` | 16 pruebas de interfaz |
| `frontend/test/utils/api-entrenamiento.ts` (T027/T028, I3) | API en memoria con `GET /progreso/:id/records` y `PATCH` del ejercicio |
| `frontend/test/entrenamiento.test.tsx` (T027, I3) | 2 pruebas de regresión del foco tras añadir, guardar o cancelar una serie |

## Comportamiento

- **Registrar una serie** (sin interacciones nuevas):
  - si supera el peso máximo o el 1RM anterior se anuncia, por ejemplo «Nuevo récord de peso máximo en Press de banca: 76 kg. Nuevo récord de 1RM estimado: 88,67 kg.», y la serie lleva la etiqueta «Récord de peso y 1RM»;
  - una serie sin récord vacía el anuncio, que solo contiene el último evento.
- **«Terminar ejercicio»:**
  - suma el volumen de todas las apariciones del ejercicio y avisa si supera el récord y lo ya notificado;
  - `volumenNotificadoKg` viaja en el mismo `PATCH`;
  - el foco se queda en el botón, que pasa a «Reabrir ejercicio»;
  - un ejercicio terminado oculta el formulario y los botones de editar y eliminar.
- **Finalizar:** se comprueba el volumen de los ejercicios sin terminar, se anuncia y el resumen lista los récords de la sesión.
- **Sin aviso:** al igualar, en la primera sesión, con una métrica sin récord previo (`null`), sin récords cargados y en el registro a posteriori.

## Test-first

| Etapa | Rojo → verde |
|---|---|
| 1. Reglas puras | 12 rojos (no existía el módulo) → verdes |
| 2. Terminar y reabrir | 4 rojos + 1 de conflicto → verdes |
| 3. Peso y 1RM en la interfaz | 7 rojos → verdes |
| 4. Volumen al terminar y reabrir | 4 rojos → verdes |
| 5. Volumen al finalizar y resumen | 7 rojos → verdes |
| Corrección del foco (T027) | 2 rojos → verdes |
| Final | **191/191 verdes** en el frontend, estables en 2 ejecuciones |

## Navegador real (build de producción por HTTPS, API y PostgreSQL reales, 360 px)

Récords previos sembrados con las sesiones de Press de banca del fixture T036 (75 kg, 87,5 kg y 868 kg).

| Paso | Resultado |
|---|---|
| 75 × 5 (iguala) | Sin aviso |
| 76 × 5 | «Nuevo récord de peso máximo …: 76 kg. Nuevo récord de 1RM estimado: 88,67 kg.» y etiqueta en la serie |
| 65 × 8 | El anuncio se vacía |
| Terminar ejercicio (1275 kg) | Aviso de volumen; foco en «Reabrir ejercicio» |
| Reabrir y terminar sin cambios | Sin aviso |
| PostgreSQL | `terminado_en` con valor, `volumen_notificado_kg` = 1275, versión 4 |
| Reabrir, 10 × 1 y finalizar | «Nuevo récord de volumen …: 1285 kg.» y resumen con peso máximo, 1RM y volumen |
| axe WCAG 2.1 A/AA (serie récord, terminado y resumen) | **0 violaciones** |
| Desplazamiento horizontal | Ninguno |

**Hallazgo corregido.** A 360 px la etiqueta se comprimía junto a los botones de la serie. Ahora va en su propia línea, sin partirse, y el texto combinado es «Récord de peso y 1RM».

Las cuentas `t041.demo.*@example.invalid` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 191/191 |
| Dominio | 48/48 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Corrección del foco (heredado de T027)

Tras «Añadir serie», «Guardar cambios» o «Cancelar», el formulario se vuelve a montar y el foco caía en `body`. Ahora el formulario nuevo enfoca su botón «Añadir serie», solo cuando viene de esas acciones (al eliminar una serie no se mueve el foco).

- Con el teclado, Enter repite la serie prellenada: no hay interacciones nuevas.
- La prueba de T041 exige además que el anuncio no saque el foco de «Añadir serie».

## E2E de T036 (`progreso.spec`, Chrome, API y PostgreSQL reales de prueba, 360 px)

| Prueba | Resultado |
|---|---|
| Sin avisos en la primera sesión | ✓ |
| Aviso inmediato de peso máximo y 1RM | ✓ |
| Sin aviso al igualar | ✓ |
| Volumen diferido hasta terminar, sin repetir al reabrir y con aviso al superar lo notificado | ✓ |
| Volumen al finalizar sin terminar el ejercicio | ✓ |
| Primer 1RM como referencia y volumen al finalizar | ✓ |
| Gráfico y tabla por periodo (T040) | ✘ Espera la fecha ISO «2026-11-02» y la tabla muestra «2 nov 2026» (formato español aprobado). Los valores mostrados son correctos |

**Resultado: 6/7.** Las 6 de T041 pasan. El fallo es la discrepancia de formato ya conocida entre T040 y el E2E del Integrante 4; la prueba no se modificó.

## Observaciones

- **T042.** Falta invalidar `['progreso']` tras editar el historial. Los récords previos del entrenamiento en curso usan la misma raíz de clave.
- **Formato de la tabla de progreso (T040 frente al E2E de T036, I4).** El E2E espera fechas ISO y decimales con punto; la interfaz usa el formato español aprobado. Habrá que ajustar el E2E en T043 conservando su cobertura, previa consulta con I4.
