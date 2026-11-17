# Verificación de T055 — Interfaz de rutinas

Fecha: 2026-11-17. Solo T055 (I3). Depende de T054 (PR #33, `9374805`).

## Alcance

tasks.md pide:
- crear y editar nombre, día y ejercicios;
- eliminar con confirmación;
- iniciar el flujo P1 sin modificar la plantilla al cambiar la sesión.

Requisitos: FR-028 a FR-030 y el contrato «Rutinas — P5» (`POST /entrenamientos` con `rutinaId`). La interfaz sigue el E2E de T051 (`e2e/tests/rutinas.spec.ts`, I4).

Decisiones aprobadas por el responsable:
1. iniciar desde una rutina requiere conexión y no pasa por la cola;
2. «Subir», «Bajar» y «Quitar» para ordenar;
3. atajo con las rutinas de hoy en el estado vacío de Entrenar.

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/api/rutinas.ts` (nuevo) | Cliente de rutinas: listar, obtener, crear, actualizar (lista completa y versión) y eliminar (`?version=`) |
| `frontend/src/api/entrenamientos.ts` (T025, I3) | `iniciarDesdeRutina`: `POST /entrenamientos` con `rutinaId`, fuera de la cola |
| `frontend/src/paginas/rutinas/` (nuevo) | `PaginaRutinas`, `TarjetaRutina`, `EditorRutina` (crear y editar, con 409), `EjerciciosRutina` (casillas, buscador y orden), `EliminarRutina`, `RutinasDeHoy`, `iniciarDesdeRutina.ts` y `dias.ts` |
| `frontend/src/paginas/entrenamiento/PaginaEntrenar.tsx` (I3) | `<RutinasDeHoy />` en el estado vacío, sin otros cambios |
| `frontend/src/app/rutas.tsx` | `/rutinas`, `/rutinas/nueva` y `/rutinas/:id` |
| `frontend/src/componentes/Iconos.tsx`, `frontend/src/textos/es.ts` | Iconos de subir y bajar, y textos |
| `frontend/test/rutinas.test.tsx` (nuevo) | 27 pruebas |
| `frontend/test/utils/api-entrenamiento.ts` (I3) | Rutinas con versiones, 409 y 404, inicio con `rutinaId` y un tercer ejercicio en el catálogo |
| `frontend/test/shell.test.tsx` (T010, I3) | Ya no quedan secciones «Próximamente» |

## Comportamiento

**Lista:**
- agrupada por día (1 = lunes, ISO), con la etiqueta «Hoy» y los ejercicios en orden;
- en cada tarjeta, «Iniciar» como acción principal, más «Editar» y «Eliminar»;
- estados de carga, vacío, error con «Reintentar» y sin red;
- un único «Crear rutina», que pasa a ser secundario cuando ya hay rutinas.

**Editor:**
- nombre (máximo 80), día (hoy por defecto) y el catálogo como casillas agrupadas por músculo, con buscador;
- marcar añade al final y desmarcar quita;
- «Subir», «Bajar» y «Quitar» se deshabilitan en los extremos, mantienen el foco en el mismo ejercicio y anuncian la posición;
- validación con `esquemaRutina`;
- errores de servidor, sin red y 404 por ejercicio no disponible;
- con un 409 se carga la versión vigente y se explica (nada se sobrescribe).

**Eliminar:**
- diálogo con el foco en «Cancelar»;
- la rutina solo desaparece tras el 204;
- con un 409 se recarga la lista sin eliminar;
- ante otro error sigue visible.

**Iniciar:**
- `POST /entrenamientos` con `rutinaId`; abre Entrenar con la sesión del servidor;
- sin red: «Necesitas conexión para iniciar desde una rutina.»;
- con un entrenamiento en curso: aviso e «Ir a Entrenar»;
- después, las series siguen funcionando sin red mediante la cola.

**Atajo en Entrenar:**
- solo sin entrenamiento en curso;
- las rutinas de hoy con «Iniciar», o «Ver rutinas» si no hay ninguna;
- sin red no muestra errores y se conservan «Iniciar entrenamiento» y el registro a posteriori.

## Test-first

| Etapa | Rojo → verde |
|---|---|
| 1. Lista | 4 → verdes |
| 2. Crear y ordenar | 7 → verdes. Hizo falta recompilar el `dist` local del dominio, en `.gitignore`, para tener `esquemaRutina` |
| 3. Editar y 409 | 3 → verdes |
| 4. Eliminar | 4 → verdes |
| 5. Iniciar e independencia | 5 → verdes |
| 6. Atajo en Entrenar | 3 → verdes (la cuarta ya pasaba) |
| Final | **270/270 verdes** en el frontend, estables en 2 ejecuciones |

## Navegador real (build de producción por HTTPS, API y PostgreSQL reales, 360 px)

| Paso | Resultado |
|---|---|
| Entrenar sin rutinas | «Ver rutinas» |
| Crear: marcar 3 y subir el tercero | Foco en «Subir …». En BD, el orden es el esperado |
| Editar: quitar uno y añadir otro | En BD, la lista nueva en orden |
| Iniciar desde la lista | La sesión tiene los ejercicios de la plantilla en orden. Tras registrar una serie, la plantilla no cambia |
| Eliminar la rutina | Foco en «Cancelar». Rutina eliminada y sesión intacta |
| Finalizar y crear una rutina de hoy | El atajo «Rutinas de hoy» inicia la sesión con sus ejercicios |
| axe WCAG 2.1 A/AA (vacía, editor, lista, diálogo y atajo) | **0 violaciones**; sin desplazamiento horizontal |
| Teclado | Tab muestra el foco visible |

Las cuentas `t055.demo.*@example.invalid` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 270/270 |
| Dominio | 82/82 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Pendiente

- **E2E de T051:** con el aviso previo del responsable (puerto 5173).
- **Posible mejora:** en el móvil el catálogo completo (unos 50 ejercicios) hace largo el editor. El E2E necesita ver todas las casillas y el buscador ayuda a filtrar.
