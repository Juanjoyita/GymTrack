# Contrato de la API REST

**Feature**: `001-registro-entrenamientos` | **Fecha**: 2026-11-11 | **Plan**: [../plan.md](../plan.md)

Contrato entre `frontend/` y `backend/`. Los esquemas de entrada se definen una sola vez con Zod en
`packages/domain` (research R-10) y este documento es su referencia funcional. Cualquier cambio de
contrato se acuerda primero aquí, en un pull request, antes de implementarlo.

## Convenciones

- **Base**: `/api`. Solo JSON (`Content-Type: application/json`), salvo la exportación CSV.
- **Autenticación**: cookie `httpOnly` `gt_sesion` (R-03). Todas las rutas la exigen salvo las
  marcadas como 🔓. Sin sesión válida → `401`.
- **Propiedad**: el usuario se toma siempre de la sesión. Un recurso de otro usuario responde `404`
  (R-04).
- **Identificadores**: `uuid`. En los recursos que se crean durante un entrenamiento, el `id` lo
  envía el cliente; repetir el mismo `POST` devuelve `200` con el recurso existente en lugar de
  `201` (idempotencia, R-08).
- **Pesos**: la API siempre recibe y devuelve **kg** (`pesoKg`), con hasta 4 decimales. La
  conversión a lb y el redondeo a 2 decimales para mostrar los hace el frontend con
  `packages/domain` (R-06). Al escribir, el cliente envía además el valor tal como lo tecleó
  (`pesoEntrada`: `{ valor, unidad }`) para que el servidor valide los 2 decimales en la unidad
  original (FR-008).
- **Fechas**: ISO 8601 con zona (`2026-11-11T18:30:00.000Z`).
- **Bloqueo optimista**: los `PATCH` y `DELETE` de recursos con `version` exigen `version` en el
  cuerpo (en `DELETE`, como parámetro `?version=`). Si no coincide → `409 CONFLICTO_VERSION` con el
  recurso actual (R-09, FR-031).

### Formato de error

```json
{
  "codigo": "VALIDACION",
  "mensaje": "Revisa los campos marcados.",
  "campos": { "repeticiones": "Debe ser un número entero entre 1 y 100." },
  "actual": null
}
```

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Entrada inválida. `campos` indica el mensaje por campo (FR-027). |
| 401 | `NO_AUTENTICADO` | Sin sesión, sesión caducada o credenciales incorrectas. |
| 404 | `NO_ENCONTRADO` | No existe o no pertenece al usuario. |
| 409 | `CONFLICTO_VERSION` | `version` desactualizada. `actual` contiene el recurso vigente. |
| 409 | `ENTRENAMIENTO_EN_CURSO` | Ya hay un entrenamiento en curso (FR-013). `actual` lo contiene. |
| 409 | `EJERCICIO_DUPLICADO` | Nombre de ejercicio ya existente. `actual` contiene el ejercicio existente. |
| 409 | `EJERCICIO_EN_USO` | Ejercicio propio con series o incluido en rutinas. `actual: { "entrenamientos": 7, "rutinas": ["Pecho y tríceps"] }`. |
| 409 | `EMAIL_EN_USO` | Registro con un email ya registrado. |
| 410 | `ENLACE_INVALIDO` | Enlace de recuperación usado o caducado. |
| 429 | `DEMASIADAS_PETICIONES` | Límite de peticiones en autenticación (R-21). |

---

## Autenticación y cuenta

### 🔓 `POST /auth/registro` — P1 (FR-001)

```json
{ "email": "ana@example.com", "contrasena": "********", "zonaHoraria": "America/Bogota" }
```

`201` → `Usuario` y establece la cookie de sesión. `409 EMAIL_EN_USO`, `400 VALIDACION`.

### 🔓 `POST /auth/login` — P1

```json
{ "email": "ana@example.com", "contrasena": "********" }
```

`200` → `Usuario` y establece la cookie. `401` con el mismo mensaje tanto si el email no existe
como si la contraseña es incorrecta.

### `POST /auth/logout` — P1

`204` y borra la cookie.

### `GET /auth/yo` — P1

`200` → `Usuario`.

```json
{ "id": "uuid", "email": "ana@example.com", "unidadPeso": "kg", "zonaHoraria": "America/Bogota" }
```

### 🔓 `POST /auth/recuperar` — P4 (FR-001)

```json
{ "email": "ana@example.com" }
```

**Siempre** `202` con `{ "mensaje": "Si el email está registrado, recibirás un enlace en unos minutos." }`.
Solo si el email existe se envía un enlace `…/restablecer?token=<token>` válido 1 hora.

### 🔓 `POST /auth/restablecer` — P4

```json
{ "token": "<token>", "contrasenaNueva": "********" }
```

`204`: cambia la contraseña, marca el token como usado y cierra todas las sesiones.
`410 ENLACE_INVALIDO` si está usado o caducado.

### `PATCH /cuenta/preferencias` — P4 (FR-024)

```json
{ "unidadPeso": "lb", "zonaHoraria": "Europe/Madrid" }
```

`200` → `Usuario`. Nunca modifica pesos guardados.

### `GET /exportacion?formato=json|csv` — P4 (FR-025)

`200` con `Content-Disposition: attachment; filename="gymtrack-AAAA-MM-DD.json|csv"`. El contenido
está descrito en research R-17. No incluye `hashContrasena` ni tokens.

### `DELETE /cuenta` — P4 (FR-026)

```json
{ "contrasena": "********" }
```

`204`: elimina la cuenta y todos sus datos y borra la cookie. `401` si la contraseña no es correcta.

---

## Ejercicios — P1 (FR-004 a FR-006)

### `GET /ejercicios?q=press&limite=20`

Catálogo y ejercicios propios. Sin `q`, ordenados primero por los usados recientemente y después
alfabéticamente. Con `q`, filtrados sin distinguir mayúsculas ni tildes.

```json
[{ "id": "uuid", "nombre": "Press de banca", "grupoMuscular": "pecho", "propio": false, "ultimoUso": "2026-11-09T19:02:00Z" }]
```

### `POST /ejercicios`

```json
{ "nombre": "Press en máquina Hammer", "grupoMuscular": "pecho" }
```

`201` → `Ejercicio`. `409 EJERCICIO_DUPLICADO` con el existente en `actual`.

### `PATCH /ejercicios/:id` · `DELETE /ejercicios/:id`

Solo ejercicios propios. `PATCH` admite `nombre` y `grupoMuscular`. `DELETE` → `204` o
`409 EJERCICIO_EN_USO`.

### `GET /ejercicios/:id/ultima-sesion` (FR-009, US1 escenario 7)

`200` → las series de la última sesión finalizada con ese ejercicio, o `null`.

```json
{ "entrenamientoId": "uuid", "fecha": "2026-11-09T18:40:00Z", "series": [{ "orden": 1, "repeticiones": 8, "pesoKg": 60 }] }
```

---

## Entrenamientos — P1/P2 (FR-007 a FR-018)

### Objeto `Entrenamiento` (detalle)

```json
{
  "id": "uuid",
  "estado": "en_curso",
  "inicio": "2026-11-11T18:30:00Z",
  "fin": null,
  "zonaHoraria": "America/Bogota",
  "nota": null,
  "rutinaOrigenId": null,
  "inactivo": false,
  "version": 3,
  "ejercicios": [
    {
      "id": "uuid", "ejercicioId": "uuid", "nombre": "Press de banca", "posicion": 1, "nota": null, "terminadoEn": null, "volumenNotificadoKg": null, "version": 1,
      "series": [{ "id": "uuid", "orden": 1, "repeticiones": 8, "pesoKg": 60, "registradaEn": "2026-11-11T18:35:00Z", "version": 1 }]
    }
  ],
  "resumen": { "ejercicios": 1, "series": 1, "volumenKg": 480, "duracionMin": null }
}
```

### `POST /entrenamientos` — P1

Iniciar un entrenamiento (o registrarlo a posteriori, FR-014).

```json
{ "id": "uuid", "inicio": "2026-11-11T18:30:00Z", "zonaHoraria": "America/Bogota", "rutinaId": null }
```

- Sin `fin` → se crea `en_curso`. `409 ENTRENAMIENTO_EN_CURSO` si ya hay uno.
- Con `fin` (en el pasado y `>= inicio`) → se crea `finalizado` (registro a posteriori).
- Con `rutinaId` (P5, FR-029) → se crea con los ejercicios de la rutina en su orden.

`201` → `Entrenamiento`.

### `GET /entrenamientos/en-curso` — P1

`200` → `Entrenamiento` (con `inactivo: true` si lleva más de 12 h sin actividad, R-12) o `204` si
no hay ninguno.

### `POST /entrenamientos/:id/finalizar` — P1

```json
{ "fin": "2026-11-11T19:45:00Z", "version": 3 }
```

`fin` es opcional: si se omite, es la hora actual; tras inactividad, el cliente envía la hora de la
última serie. `200` → `Entrenamiento` finalizado, o `200` con `{ "descartado": true }` si no tenía
series (se elimina).

### `PATCH /entrenamientos/:id` — P1/P2

```json
{ "nota": "Buen día", "inicio": "…", "fin": "…", "version": 4 }
```

### `DELETE /entrenamientos/:id?version=4` — P1/P2

Descartar uno en curso o eliminar uno pasado (la interfaz pide confirmación antes, FR-018). `204`.

### `GET /entrenamientos?ejercicioId=&desde=2026-10-01&hasta=2026-11-11&cursor=&limite=20` — P2

Historial finalizado ordenado por `inicio` descendente (FR-015, FR-017). `desde`/`hasta` son fechas
locales del usuario. Paginación por cursor.

```json
{
  "elementos": [{ "id": "uuid", "inicio": "…", "fin": "…", "zonaHoraria": "…", "resumen": { "ejercicios": 4, "series": 15, "volumenKg": 8240, "duracionMin": 72 } }],
  "siguienteCursor": "opaco-o-null"
}
```

### `GET /entrenamientos/:id` — P2

`200` → `Entrenamiento` con todos sus ejercicios y series en orden (FR-016).

### Ejercicios realizados

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /entrenamientos/:id/ejercicios` | `{ "id", "ejercicioId", "posicion" }` | `201` (o `200` si ya existía) |
| `PATCH /entrenamientos/:id/ejercicios/:erId` | `{ "posicion"?, "nota"?, "terminado"?, "volumenNotificadoKg"?, "version" }` | `200` |
| `DELETE /entrenamientos/:id/ejercicios/:erId?version=` | — | `204` (borra también sus series) |

`terminado: true` corresponde al botón "Terminar ejercicio" y guarda `terminadoEn` (FR-022); el
cliente comprueba entonces el récord de volumen y, si avisa, envía en la misma petición
`volumenNotificadoKg` con el volumen notificado. `terminado: false` reabre el ejercicio. Al volver a
terminarlo, solo se avisa si el volumen supera el récord anterior y el mayor `volumenNotificadoKg`
de ese ejercicio en la sesión (R-11).

### Series

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /entrenamientos/:id/ejercicios/:erId/series` | `{ "id", "orden", "repeticiones", "pesoEntrada": { "valor": 132.5, "unidad": "lb" }, "registradaEn" }` | `201` (o `200` si ya existía) → `Serie` con `pesoKg` |
| `PATCH …/series/:serieId` | `{ "repeticiones"?, "pesoEntrada"?, "orden"?, "version" }` | `200` → `Serie` |
| `DELETE …/series/:serieId?version=` | — | `204` |

Reglas de validación (FR-008): `repeticiones` entero de 1 a 100; `pesoEntrada.valor` ≥ 0, con 2
decimales como máximo, y ≤ 500 kg una vez convertido. Crear una serie actualiza
`ultima_actividad_en` del entrenamiento. Las series se pueden añadir, editar y eliminar tanto en
entrenamientos en curso como finalizados (FR-010).

---

## Progreso — P3 (FR-019 a FR-023)

### `GET /progreso/:ejercicioId?periodo=1m|3m|1a|todo`

```json
{
  "ejercicioId": "uuid",
  "periodo": "3m",
  "sesiones": [
    { "entrenamientoId": "uuid", "fecha": "2026-10-02", "pesoMaxKg": 60, "volumenKg": 1440, "unoRmKg": 72.0 }
  ],
  "suficientesParaTendencia": true
}
```

`suficientesParaTendencia` es `false` con una sola sesión (US3 escenario 9). Los mismos datos
alimentan el gráfico y la tabla.

### `GET /progreso/:ejercicioId/records?excluirEntrenamientoId=uuid`

```json
{
  "sesionesAnteriores": 5,
  "pesoMax":  { "valorKg": 80,   "fecha": "2026-11-02", "entrenamientoId": "uuid" },
  "unoRm":    { "valorKg": 93.3, "fecha": "2026-11-02", "entrenamientoId": "uuid" },
  "volumenSesion": { "valorKg": 2400, "fecha": "2026-10-20", "entrenamientoId": "uuid" }
}
```

Cada récord es `null` si todavía no hay datos (por ejemplo, `unoRm` es `null` si todas las series
tienen peso 0 o más de 12 repeticiones). Ante un empate, `fecha` y `entrenamientoId` son los de la
primera vez que se alcanzó el valor. `excluirEntrenamientoId` deja fuera el entrenamiento en curso,
de modo que la respuesta refleja solo sesiones anteriores. El frontend usa esta respuesta para
avisar de nuevos récords durante el entrenamiento: sin aviso si `sesionesAnteriores` es 0 o si el
récord de esa métrica es `null`, y solo cuando un valor lo supera (FR-022, R-11).

En `GET /progreso/:ejercicioId`, `unoRmKg` es `null` en las sesiones sin series válidas para el 1RM.

---

## Rutinas — P5 (FR-028 a FR-030)

### Objeto `Rutina`

```json
{ "id": "uuid", "nombre": "Pecho y tríceps", "diaSemana": 1, "version": 2,
  "ejercicios": [{ "posicion": 1, "ejercicioId": "uuid", "nombre": "Press de banca" }] }
```

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /rutinas` | — | `200` → `Rutina[]`, ordenadas por `diaSemana` y `nombre` |
| `POST /rutinas` | `{ "nombre", "diaSemana", "ejercicioIds": ["uuid", …] }` (≥ 1) | `201` → `Rutina` |
| `GET /rutinas/:id` | — | `200` → `Rutina` |
| `PATCH /rutinas/:id` | `{ "nombre"?, "diaSemana"?, "ejercicioIds"?, "version" }` | `200` → `Rutina` |
| `DELETE /rutinas/:id?version=` | — | `204` (la interfaz pide confirmación; los entrenamientos no cambian) |

Para iniciar un entrenamiento desde una rutina se usa `POST /entrenamientos` con `rutinaId`.
