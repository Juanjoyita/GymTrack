# Data Model: Registro y seguimiento de entrenamientos

**Feature**: `001-registro-entrenamientos` | **Fecha**: 2026-11-11 | **Plan**: [plan.md](./plan.md)

Modelo lógico para PostgreSQL 16 con TypeORM. Los nombres de tablas y columnas van en español y en
`snake_case`. Todas las claves primarias son `uuid` generadas en el cliente o en el servidor
(research R-08). Todas las marcas de tiempo son `timestamptz` en UTC (R-07). Cada cambio de esquema
se hace con una migración de TypeORM que conserva los datos existentes (Principio I).

## Diagrama de relaciones

```text
usuario 1───* ejercicio (propios; los del catálogo tienen usuario_id NULL)
usuario 1───* entrenamiento 1───* ejercicio_realizado 1───* serie
usuario 1───* rutina 1───* rutina_ejercicio *───1 ejercicio
usuario 1───* token_recuperacion
ejercicio 1───* ejercicio_realizado
rutina 0..1───* entrenamiento        (solo informativo: rutina_origen_id, ON DELETE SET NULL)
```

Todas las relaciones que cuelgan de `usuario` usan `ON DELETE CASCADE` (FR-026, R-18).
Las referencias a `ejercicio` desde `ejercicio_realizado` y `rutina_ejercicio` usan
`ON DELETE NO ACTION` (no `RESTRICT`): impiden borrar un ejercicio en uso, pero PostgreSQL las
comprueba al final de la sentencia, así que eliminar la cuenta completa en cascada no falla.

---

## usuario

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `email` | varchar(254) | Único (en minúsculas). Formato de email válido. |
| `hash_contrasena` | varchar(255) | Argon2id (R-03). Nunca se devuelve por la API ni se exporta. |
| `version_token` | integer | Por defecto 0. Se incrementa al restablecer la contraseña (invalida sesiones). |
| `unidad_peso` | enum `kg` \| `lb` | Por defecto `kg` (FR-024). |
| `zona_horaria` | varchar(64) | Zona IANA válida, por ejemplo `America/Bogota` (R-07). |
| `creado_en` | timestamptz | |

- **Contraseña** (validación de entrada, no se guarda en claro): de 8 a 128 caracteres.
- Datos personales mínimos (Principio V): no se piden nombre, fecha de nacimiento ni medidas.

## token_recuperacion

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK → usuario | `ON DELETE CASCADE` |
| `hash_token` | char(64) | SHA-256 del token enviado por email. Único. |
| `expira_en` | timestamptz | `creado_en + 1 hora` (FR-001). |
| `usado_en` | timestamptz NULL | Se rellena al usarlo; un token usado se rechaza. |
| `creado_en` | timestamptz | |

- Un token es válido solo si `usado_en IS NULL AND expira_en > now()`.
- Al solicitar uno nuevo, los anteriores sin usar de ese usuario se invalidan.

## ejercicio

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK → usuario NULL | `NULL` = ejercicio del catálogo; con valor = ejercicio propio (FR-005). |
| `nombre` | varchar(80) | De 1 a 80 caracteres tras recortar espacios. |
| `nombre_normalizado` | varchar(80) | Minúsculas, sin tildes, espacios compactados (R-14). |
| `grupo_muscular` | enum | `pecho`, `espalda`, `hombros`, `biceps`, `triceps`, `antebrazos`, `cuadriceps`, `isquiotibiales`, `gluteos`, `gemelos`, `abdomen`. |
| `creado_en` | timestamptz | |

- **Unicidad**: índice único `(COALESCE(usuario_id, '00000000-0000-0000-0000-000000000000'), nombre_normalizado)`.
  Además, el servicio rechaza un ejercicio propio cuyo nombre normalizado coincida con uno del
  catálogo y sugiere el existente (caso límite de duplicados).
- **Eliminación**: solo los ejercicios propios. Si tiene series registradas, se rechaza
  (`409 EJERCICIO_EN_USO`) indicando en cuántos entrenamientos aparece; renombrarlo sí se permite.
  Si forma parte de alguna rutina, también se rechaza (`409 EJERCICIO_EN_USO`) indicando en qué
  rutinas está, para que ninguna rutina se quede sin ejercicios (FR-028).
- Los ejercicios del catálogo no se pueden modificar ni eliminar desde la API.

## entrenamiento

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | Generado en el cliente (idempotencia, R-08). |
| `usuario_id` | uuid FK → usuario | `ON DELETE CASCADE` |
| `estado` | enum `en_curso` \| `finalizado` | Ver transiciones. |
| `inicio` | timestamptz | Obligatorio. |
| `fin` | timestamptz NULL | Obligatorio si `finalizado`; `fin >= inicio`. |
| `zona_horaria` | varchar(64) | Zona IANA del dispositivo al iniciarlo; define el "día local" (R-07). |
| `ultima_actividad_en` | timestamptz | Se actualiza con cada serie creada (detección de inactividad > 12 h, R-12). |
| `nota` | varchar(1000) NULL | FR-011 |
| `rutina_origen_id` | uuid FK → rutina NULL | `ON DELETE SET NULL`. Solo informativo; no vincula cambios (FR-030). |
| `version` | integer | Bloqueo optimista (R-09). |
| `creado_en` | timestamptz | |

- **Un solo entrenamiento en curso por usuario** (FR-013): índice único parcial
  `(usuario_id) WHERE estado = 'en_curso'`.
- **Registro a posteriori** (FR-014): se crea directamente como `finalizado` con `inicio` y `fin`
  en el pasado (`fin <= now()`).
- **Índices**: `(usuario_id, inicio DESC)` para el historial (FR-015, SC-005).

### Transiciones de estado

```text
           iniciar (o iniciar desde rutina)
 (nada) ─────────────────────────────────▶ en_curso
                                              │
              finalizar con ≥ 1 serie         │  finalizar con 0 series ─▶ se elimina
     ┌────────────────────────────────────────┤  descartar ───────────────▶ se elimina
     ▼                                        │
 finalizado ◀─────────────────────────────────┘
     │   (inactivo > 12 h: el usuario elige finalizar con fin = hora de la última serie, o descartar)
     ▼
  editar series / ejercicios / nota (FR-010) · eliminar con confirmación (FR-018)

 registrar a posteriori (FR-014) ─▶ finalizado
```

## ejercicio_realizado

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | Generado en el cliente. |
| `entrenamiento_id` | uuid FK → entrenamiento | `ON DELETE CASCADE` |
| `ejercicio_id` | uuid FK → ejercicio | `ON DELETE NO ACTION` (un ejercicio con series no se elimina). |
| `posicion` | integer | ≥ 1. Orden dentro del entrenamiento. |
| `nota` | varchar(1000) NULL | FR-011 |
| `terminado_en` | timestamptz NULL | Momento en que el usuario pulsó "Terminar ejercicio" (FR-022). `NULL` = no terminado o reabierto. |
| `volumen_notificado_kg` | numeric(12,4) NULL | Último volumen de la sesión por el que se avisó de récord. Evita repetir el aviso al reabrir y volver a terminar (R-11). |
| `version` | integer | Bloqueo optimista. |
| `creado_en` | timestamptz | |

- Un mismo ejercicio puede aparecer más de una vez en un entrenamiento (por ejemplo, al principio y
  al final); cada aparición es un `ejercicio_realizado` distinto.
- **Índice**: `(ejercicio_id)` para el progreso y los récords por ejercicio.

## serie

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | Generado en el cliente (crear es idempotente, R-08). |
| `ejercicio_realizado_id` | uuid FK → ejercicio_realizado | `ON DELETE CASCADE` |
| `orden` | integer | ≥ 1. Orden dentro del ejercicio realizado. |
| `repeticiones` | smallint | Entero de 1 a 100 (FR-008). |
| `peso_kg` | numeric(8,4) | De 0 a 500 en kg (R-06). 0 = peso corporal. |
| `registrada_en` | timestamptz | Momento en que se registró (puede ser anterior a su sincronización). |
| `version` | integer | Bloqueo optimista (FR-031). |

- **Validación del peso de entrada** (FR-008, en `packages/domain`): el valor introducido tiene como
  máximo 2 decimales en su unidad (`kg` o `lb`), es ≥ 0 y, convertido a kg, es ≤ 500.
- No hay límite de series por ejercicio.

## rutina

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK → usuario | `ON DELETE CASCADE` |
| `nombre` | varchar(80) | De 1 a 80 caracteres tras recortar espacios. |
| `dia_semana` | smallint | 1 = lunes … 7 = domingo (ISO 8601). Un único día por rutina (FR-028). |
| `version` | integer | Bloqueo optimista. |
| `creado_en` | timestamptz | |

- Puede haber varias rutinas el mismo día.

## rutina_ejercicio

| Columna | Tipo | Reglas |
|---|---|---|
| `rutina_id` | uuid FK → rutina | PK compuesta con `posicion`. `ON DELETE CASCADE`. |
| `posicion` | integer | ≥ 1 |
| `ejercicio_id` | uuid FK → ejercicio | `ON DELETE NO ACTION` (ver eliminación de ejercicios) |

- Una rutina tiene **al menos un** ejercicio (FR-028). Al editarla, la lista completa se reemplaza
  en una transacción.
- **Iniciar desde una rutina** (FR-029): se crea un `entrenamiento` en curso y un
  `ejercicio_realizado` por cada `rutina_ejercicio`, en el mismo orden y sin series. Desde ese
  momento son independientes (FR-030).

---

## Valores derivados (no se guardan)

Se calculan con funciones puras de `packages/domain` según las reglas de research R-11 (FR-020 a
FR-022).

| Valor | Definición |
|---|---|
| Volumen (de carga externa) de una serie | `peso_kg × repeticiones`; con peso 0 es 0 |
| Volumen de un ejercicio en una sesión / de un entrenamiento | Suma del volumen de sus series |
| Peso máximo de una sesión (por ejercicio) | `MAX(peso_kg)` de las series de ese ejercicio en la sesión |
| 1RM estimado de una serie | `peso_kg = 0` o `repeticiones > 12` → no se calcula; `repeticiones = 1` → `peso_kg`; `2..12` → `peso_kg × (1 + repeticiones / 30)` |
| 1RM estimado de una sesión | Máximo 1RM de sus series válidas; `null` si no tiene ninguna (FR-020) |
| Récords personales por ejercicio | Mayor peso, mejor 1RM estimado y mayor volumen de una sesión, cada uno con su fecha y entrenamiento. Solo cambian si un valor los supera; ante un empate se conserva la primera vez que se alcanzó (FR-021) |
| Sesiones anteriores de un ejercicio | Entrenamientos finalizados, distintos del actual, con al menos una serie de ese ejercicio. Si no hay ninguna, no se avisa de récords (FR-022) |
| Duración de un entrenamiento | `fin − inicio` |
| Día local | `inicio` convertido a `entrenamiento.zona_horaria` |
| Entrenamiento inactivo | `estado = en_curso AND now() − ultima_actividad_en > 12 h` |

## Estado local del cliente (no es una tabla)

Persistido en `localStorage` del navegador (R-08):

- **Entrenamiento en curso**: copia del entrenamiento, sus ejercicios realizados y sus series, con la
  `version` conocida de cada uno.
- **Cola de operaciones pendientes**: lista ordenada de `{ id_operacion, metodo, ruta, cuerpo,
  version_esperada, creada_en }`. Se vacía al confirmarse cada operación; los conflictos (`409` o
  `404` sobre un recurso conocido) pasan a una lista de conflictos que el usuario resuelve.
- **Preferencias de interfaz**: la unidad de peso se lee del servidor; en local solo se guarda en
  caché.

No se guardan contraseñas ni tokens en `localStorage` (el token va en una cookie `httpOnly`, R-03).

---

## Catálogo inicial

50 ejercicios (R-20), cargados por una migración de datos idempotente.

| Grupo muscular | Ejercicios |
|---|---|
| Pecho (6) | Press de banca, Press de banca inclinado, Press de banca declinado, Press con mancuernas, Aperturas con mancuernas, Cruce de poleas |
| Espalda (7) | Dominadas, Jalón al pecho, Remo con barra, Remo con mancuerna, Remo en polea baja, Peso muerto, Pullover en polea |
| Hombros (5) | Press militar, Press de hombros con mancuernas, Elevaciones laterales, Elevaciones frontales, Pájaros (deltoides posterior) |
| Bíceps (4) | Curl con barra, Curl con mancuernas, Curl martillo, Curl en banco Scott |
| Tríceps (5) | Fondos en paralelas, Press francés, Extensión de tríceps en polea, Extensión de tríceps sobre la cabeza, Press de banca con agarre cerrado |
| Antebrazos (2) | Curl de muñeca, Curl de muñeca inverso |
| Cuádriceps (6) | Sentadilla, Sentadilla frontal, Prensa de piernas, Extensión de cuádriceps, Zancadas, Sentadilla búlgara |
| Isquiotibiales (4) | Peso muerto rumano, Curl femoral tumbado, Curl femoral sentado, Buenos días |
| Glúteos (4) | Hip thrust, Puente de glúteos, Patada de glúteo en polea, Abducción de cadera en máquina |
| Gemelos (2) | Elevación de talones de pie, Elevación de talones sentado |
| Abdomen (5) | Crunch abdominal, Elevación de piernas colgado, Crunch en polea, Rueda abdominal, Russian twist |
