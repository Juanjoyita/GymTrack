# Rendimiento

Fecha de ejecución (UTC): 2026-11-17T18:32:55.052Z.
Entorno: Windows, Node v22.23.3, Google Chrome 157.0.8103.79; viewport 360×800, CPU 4×, descarga/subida 10/5 Mbps, latencia 100 ms y caché vacía.

## Primera carga interactiva Lighthouse

| Ejecución | ms | Umbral <3000 ms |
|---:|---:|:---:|
| 1 | 2004.08 | PASS |
| 2 | 2582.25 | PASS |
| 3 | 2181.13 | PASS |
| 4 | 2378.05 | PASS |
| 5 | 2132.45 | PASS |

Resultado: 5/5 bajo 3000 ms (requerido: al menos 4/5) — **PASS**.

## Respuesta visual y consultas API

| Medición | Resultado | Umbral | Estado |
|---|---:|---:|:---:|
| Respuesta visual local | 15.80 ms | <100 ms | PASS |
| Historial (500 entrenamientos) | 68.20 ms | <2000 ms | PASS |
| Progreso (500 entrenamientos) | 76.00 ms | <2000 ms | PASS |

Resultado global: **PASS**.
Evidencia detallada: `test-results/perf/summary.json`, cinco informes Lighthouse y mediciones E2E.
