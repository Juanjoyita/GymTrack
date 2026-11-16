# Verificación de T040 — Gráfico, tabla equivalente y récords

Fecha: 2026-11-16. Solo T040 (I3). Depende de T039 (PR #25). No incluye los avisos durante el registro (T041) ni la invalidación tras editar el historial (T042).

## Alcance

tasks.md pide:
- los mismos datos en Recharts y en la tabla;
- filtro temporal;
- una sesión con aviso de tendencia insuficiente;
- estados sin datos;
- distinción adicional al color.

Requisitos: FR-019 a FR-021 y FR-023, US3 y el contrato «Progreso — P3».

Decisiones aprobadas por el responsable:
- coma decimal solo al mostrar los valores;
- ejercicio predeterminado: el usado más recientemente que tenga sesiones finalizadas, con un selector «Ejercicio».

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/api/progreso.ts` | Cliente de `GET /progreso/:id?periodo=` y `GET /progreso/:id/records`, con los tipos del contrato |
| `frontend/src/paginas/progreso/datos.ts` | `puntosProgreso`: transformación única que alimenta el gráfico y la tabla. No redondea, solo convierte kg a lb. Incluye los formatos españoles |
| `frontend/src/paginas/progreso/PaginaProgreso.tsx` | Filtros (Ejercicio y Periodo), récords, aviso de una sola sesión, periodo sin sesiones, estado vacío con «Ir a Entrenar» y carga diferida del gráfico |
| `frontend/src/paginas/progreso/GraficoProgreso.tsx` | Panel de líneas con peso máximo y 1RM (misma escala) y panel de barras de volumen. Sin doble eje. Figura con `role="img"` y nombre accesible |
| `frontend/src/paginas/progreso/TablaProgreso.tsx` | Tabla «Datos por sesión» con `caption`, cabeceras con la unidad y una cabecera de fila por fecha |
| `frontend/src/paginas/progreso/TarjetasRecords.tsx` | Peso máximo, 1RM y mejor volumen con su fecha, o «Sin datos» |
| `frontend/src/app/rutas.tsx`, `frontend/src/textos/es.ts` | La ruta `/progreso` y los textos |
| `frontend/test/progreso.test.tsx` | 10 pruebas con los valores del fixture manual de T036 |
| `frontend/test/shell.test.tsx` (T010, I3) | Progreso deja de comprobarse como marcador «Próximamente» |

## Diseño del gráfico (skill `dataviz`)

**Paleta.** Validada con `validate_palette.js` en modo oscuro sobre la superficie `#0f172a`: todas las comprobaciones pasan (ΔE con daltonismo ≥ 26).

| Serie | Color |
|---|---|
| Peso máximo | `#65a30d` |
| 1RM | `#3987e5` |
| Volumen | `#d95926` |

**Distinción adicional al color:**
- el 1RM usa línea discontinua;
- hay leyenda con muestra de línea;
- el volumen tiene su propio panel con título;
- la tabla equivalente contiene todos los valores.

**Marcas e interacción:**
- líneas de 2 px y marcadores de 10 px con anillo de superficie;
- líneas rectas entre sesiones;
- barras con los extremos redondeados;
- ayuda al pasar el cursor, que complementa la tabla y no la sustituye.

**Rendimiento.** El gráfico se carga de forma diferida. El bundle principal ocupa 132 kB gzip y Recharts va en un fragmento aparte de 112 kB, que el service worker también precachea.

## Test-first

| Momento | Resultado |
|---|---|
| Antes de implementar | Rojo: no existía `paginas/progreso` |
| Hallazgo de la verificación real | La unidad pasa a la cabecera para que «81,67 kg» no se parta a 360 px; 2 pruebas en rojo antes del cambio |
| Final | **152/152 verdes** en el frontend |

## Navegador real (build de producción por HTTPS, API y PostgreSQL reales)

Las sesiones se sembraron con el fixture de T036.

| Comprobación | Resultado |
|---|---|
| Ejercicio predeterminado | El más reciente con datos (Dominadas), con el aviso de una sola sesión y «Sin 1RM» |
| Press de banca: periodos Todo, 3 meses, 1 mes y 1 año | Filas, barras y puntos coinciden (4, 2, 1 y 3). La ayuda de la última barra coincide con la última fila (868) |
| Récords | 75 kg y 87,5 kg (10 sept 2026), 868 kg (2 nov 2026) |
| Cuenta sin entrenamientos | Estado vacío con «Ir a Entrenar» |
| axe WCAG 2.1 A/AA (una sesión, Press, escritorio y vacío) | **0 violaciones** |
| Desplazamiento horizontal a 360 px | Ninguno |

**Hallazgo corregido.** «Sin datos» y «Sin 1RM» tenían un contraste insuficiente (`slate-500`, 3,7:1). Ahora usan `slate-400`.

Las cuentas `t040.demo.*@example.invalid` se borraron de la base de desarrollo.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 152/152 |
| Dominio | 48/48 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## Avisos

- **T036/T043 (I4).** El E2E `progreso.spec` busca los valores con punto («81.67») y con `String(n)` en el texto de la tabla. La interfaz usa coma decimal, que es la decisión aprobada. Habrá que ajustar el E2E conservando su cobertura, previa consulta. Tampoco elige el ejercicio en `/progreso`: depende del predeterminado.
- **T042.** Falta la invalidación de `['progreso']` tras editar el historial.
