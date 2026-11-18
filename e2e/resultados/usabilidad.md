# T061 — Usabilidad y seguimiento mensual

Fecha: **2026-11-17, America/Bogota**. Revisión base: `e9db793`, rama
`001-t061-usabilidad`, con los cambios locales previos de T059 conservados.

**Estado: protocolo preparado y comprobación técnica auxiliar aprobada; T061 pendiente.**
El usuario acotó esta ejecución a «Solo prepara y verifica el protocolo por ahora».
No se han realizado sesiones humanas ni iniciado una cohorte mensual. No se marca T061,
no se ejecuta T061B/T062 y no se hace commit ni push. El ensayo automático no se presenta
como una prueba con usuarios.

## Criterios, muestra y resultados disponibles

Referencias: [spec, criterios SC-001–009](../../specs/001-registro-entrenamientos/spec.md#success-criteria-mandatory),
[plan](../../specs/001-registro-entrenamientos/plan.md),
[constitución](../../.specify/memory/constitution.md) y
[T061](../../specs/001-registro-entrenamientos/tasks.md).
Checklist de requisitos: **16/16** completada, sin modificarla. T060 está marcada;
no existe `.specify/extensions.yml`, por lo que no hay hooks de extensiones que ejecutar.

- **Muestra humana observada: n=0.** Personas reclutadas: 0; sesiones iniciadas/completadas: 0.
- Muestra objetivo propuesta para la primera ronda: **10 personas**, nuevas en GymTrack,
  que entrenen fuerza y usen móvil. Es una elección del protocolo, no un tamaño exigido por la spec
  ni una muestra ya reclutada. Permite expresar el umbral del 90 % como al menos 9/10 éxitos.
  No demuestra representatividad de toda la población.
- Participantes automatizados: **ninguno**; Playwright es un arnés, no un usuario de la muestra.
  Se ejecutaron **16 casos técnicos**, no 16 personas ni 16 intentos de usabilidad.
- Cohorte mensual: no iniciada; elegibles y observados al mes: **no determinados**.
  No se calculan porcentajes con denominador cero ni se presentan resultados hipotéticos como reales.

| Criterio | Umbral de la spec | Resultado humano de esta ejecución |
|---|---|---|
| SC-001 | Serie con ejercicio seleccionado: **<5 s y ≤3 interacciones** | **No observado**, n=0; sin tiempo ni tasa humana. |
| SC-002 | Persona nueva: cuenta → entrenamiento → primera serie, **<120 s, sin ayuda** | **No observado**, n=0. |
| SC-003 | **≥90 %** completa entrenamiento de **4 ejercicios** en móvil, primer intento y sin errores | **No observado**, 0 sesiones; tasa no calculable. La condición sin ayuda de T061 se registra también. |
| SC-007 | Encontrar última sesión de un ejercicio y ver su peso en **<15 s** | **No observado**, n=0. |
| SC-009 | **≥80 %** de quienes registran en su primera semana alcanza **≥4 entrenamientos en su primer mes** | **Pendiente de un mes real**; no hay cohorte ni seguimiento iniciado. |

## Comprobación técnica ejecutada

Entorno: macOS 26.5.2, Node **22.23.5**, Chrome **157.0.8103.79**, viewport **360×800**,
zona `America/Bogota`, un worker y sin reintentos. Es Chrome de escritorio con viewport móvil;
**no es un dispositivo móvil físico ni una persona**. Frontend compilado de producción y API
HTTPS, CA confiable, `ignoreHTTPSErrors: false`; PostgreSQL 16 y Mailpit locales de Compose.
Los fixtures usan exclusivamente `gymtrack_test`, crean cuentas sintéticas y las limpian al terminar.
No se modifica código de producto, tests existentes ni los informes de historias anteriores.

Comando desde la raíz (Node 22 en PATH; puertos 3000/5173 libres):

```bash
mkdir -p test-results/t061
npm run test:e2e -- auth.spec.ts registro.spec.ts historial.spec.ts > test-results/t061/recorrido-tecnico.log 2>&1
```

| Suite existente | Resultado |
|---|---|
| `e2e/tests/auth.spec.ts` | **6/6 PASS**: registro, login, recarga, logout, otra sesión y rechazo sin autenticación. |
| `e2e/tests/registro.spec.ts` | **8/8 PASS**: registro de series, prellenado, validación, resumen/persistencia exacta, teclado/axe, vacío/inactividad y fechas. |
| `e2e/tests/historial.spec.ts` | **2/2 PASS**: consulta/filtros/detalle, corrección/eliminación, estado vacío y axe. |
| Total | **16/16 PASS**, salida **0**, 12,4 s de Playwright; builds backend/frontend incluidos. |

Mediciones auxiliares observadas en el log:

- La prueba de registro pasó sus aserciones de **<5 s y ≤3 acciones programadas** por serie.
  `fill` cuenta como una acción de edición de campo en ese arnés; no mide todos los gestos de un móvil.
- Flujo V2 de **dos ejercicios**, desde después del registro hasta el resumen: **761 ms**.
  **No mide SC-002**: excluye crear cuenta, lo conduce un script y no observa una persona sin ayuda.
  **Tampoco mide SC-003**: contiene dos ejercicios, no cuatro, y no tiene muestra humana.
- Historial → detalle más reciente: **131 ms**. Confirma una ruta técnica, **no SC-007 humano**:
  el script conoce el enlace y la respuesta de antemano.
- El cierre del runner imprimió `Un servidor E2E terminó inesperadamente.` durante la parada de
  sus servidores. Playwright confirmó 16 aprobadas y el proceso principal salió 0; se conserva
  el mensaje en el log, sin ocultarlo ni contarlo como una sesión humana fallida.

El log queda en `test-results/t061/recorrido-tecnico.log` (ignorado por Git).
La revisión del protocolo comprobó los cuatro nombres del catálogo inicial, entradas válidas,
umbrales estrictos, límites de cronometraje, denominadores, separación del ensayo técnico y
registro anónimo. Esto no sustituye ejecutar las tareas con participantes.

Verificación documental: **5 enlaces locales existentes**, bloque Bash con sintaxis válida y
**4 ejercicios presentes en el catálogo**. Informe y log revisados contra los secretos configurados,
patrones JWT y claves privadas, sin coincidencias. `git diff --check`: **PASS**.
Resumen local ignorado: `test-results/t061/protocolo.json`.

## Preparación de la ronda humana

1. El responsable acuerda diez participantes voluntarios y registra solo códigos P01…P10,
   experiencia previa con GymTrack (debe ser ninguna para SC-002) y modalidad/dispositivo.
   No registrar nombres, emails, contraseñas, vídeos, datos corporales o historiales personales en Git.
   Una persona que observa/modera no cuenta como participante.
2. Fijar antes de empezar la revisión de código, entorno, navegador/versión, dispositivo/OS,
   conexión, zona horaria, tareas y reglas de medición. Usar una cuenta sintética distinta por persona
   y datos ficticios; no hacer ejercicio físico ni pedir pesos personales para este ensayo.
3. Para SC-003, usar **móvil físico** y consignar su modelo/OS y navegador. Si solo se dispone de
   emulación, registrar ese ensayo como exploratorio y mantener pendiente la evidencia en móvil.
   El entorno local actual escucha solo en localhost: un teléfono no puede acceder al localhost
   del portátil. Antes de convocar sesiones en móvil, disponer de una instancia de pruebas HTTPS
   autorizada y accesible al dispositivo, con `/api` en el mismo origen y certificado confiable.
   Esa instancia móvil **no se ha preparado ni verificado en esta ejecución**. No exponer BD/Mailpit
   ni desactivar TLS para resolverlo. El arranque local está descrito en el [README](../../README.md).
4. Usar perfil limpio, sin autocompletar ni sesiones recordadas. Abrir la pantalla de login;
   proporcionar en privado credenciales sintéticas para crear la cuenta, sin mostrar el recorrido.
   Cronómetro externo del observador: sin nueva analítica, scripts de captura ni telemetría del producto.
5. Explicar consentimiento y posibilidad de abandonar. Leer solo las tarjetas de tarea, sin señalar
   controles, hacer demostraciones ni sugerir rutas. Si pide ayuda, registrar la petición y la ayuda
   antes de intervenir; conservar ese intento y su resultado. No practicar antes del primer intento.
6. Preparar por separado la cuenta sintética del bloque de historial indicado abajo, fuera de la vista
   del participante. Verificar previamente sus fechas, orden y datos; no usar un historial real.

## Guion y reglas de observación

### A — Alta y primera serie (SC-002)

Tarjeta que ve la persona:

> Es tu primera vez en GymTrack. Crea tu cuenta con los datos de prueba que te damos. Empieza un
> entrenamiento y registra una serie de Press de banca de 60 kg y 8 repeticiones.

Inicio: al decir «puedes comenzar», con login visible y la tarjeta ya leída. Fin: primera serie
correcta visible en el entrenamiento en curso. Incluir descubrir el alta, crear cuenta, iniciar
entrenamiento, elegir ejercicio e introducir/confirmar datos. Registrar segundos exactos, finalización,
errores, peticiones de ayuda e intervenciones. **PASS individual** solo si termina en **<120 s**
y sin ayuda; a 120 s no cumple. Si continúa después, guardar su tiempo real y marcar el umbral fallido,
sin transformar ese segundo intento en éxito inicial.

### B — Completar cuatro ejercicios (SC-003) y medir una serie (SC-001)

Continuación de la misma sesión, sin reiniciar, practicar ni borrar errores del bloque A:

> Completa este entrenamiento con estos cuatro ejercicios y finalízalo. Cada ejercicio debe tener
> una serie con los datos de esta tarjeta: Press de banca 60 kg × 8; Sentadilla 80 kg × 6;
> Remo con barra 40 kg × 10; Curl con barra 20 kg × 12. La serie del primer ejercicio ya registrada
> forma parte del entrenamiento. Decide tú cómo hacerlo.

El primer intento de SC-003 comprende A+B: cualquier error o ayuda necesaria durante A también
se conserva para valorar B. La persona recibe B después de A; nadie le enseña a añadir ejercicios.
El observador comprueba al finalizar exactamente cuatro ejercicios distintos, cada uno con una serie
correcta y entrenamiento finalizado/persistido. No hacer repeticiones del ensayo para mejorar la tasa.
Los cuatro nombres existen en el catálogo global y los pesos/repeticiones son válidos.
No hay un límite de duración total para SC-003 en la spec; registrar el tiempo, sin inventar un umbral.

Para SC-001, usar la primera serie de Curl con barra del bloque B, con el ejercicio ya seleccionado:
cronómetro desde que la tarjeta del ejercicio y sus campos estén listos para introducir datos hasta
que la serie correcta aparezca visible. No incluir selección del ejercicio ni esperar la sincronización
para la respuesta visual. Registrar también confirmación posterior de persistencia sin mezclar ambos tiempos.
Medir los gestos reales: activar y editar continuamente un campo cuenta como una interacción;
activar y editar el otro, otra; confirmar, otra. No contar cada carácter como una interacción ni
contar dos veces el cambio de foco ya incluido en activar el campo. Contar aparte cualquier gesto
adicional necesario, incluido cerrar el teclado o desplazarse. Anotar la secuencia para auditar el conteo, no asumir que `fill` equivale
al comportamiento humano. **PASS individual**: **<5 s y ≤3 interacciones**; exactamente 5 s no cumple.

**Éxito individual SC-003**: cuatro ejercicios completos en móvil, primer intento, sin errores y
sin ayuda. Error incluye ejercicio/peso/repeticiones incorrectos, duplicado, omisión, validación rechazada
por entrada incorrecta o corrección necesaria; conservarlo aunque se resuelva. Registrar dudas y
recuperaciones por separado. Abandono o tarea no terminada es fallo, no desaparición del denominador.
Una incidencia técnica ajena al uso se registra aparte con su motivo; no se elimina silenciosamente ni
se reutiliza como «usuario nuevo» a quien ya aprendió el recorrido. Publicar intentos, incidencias,
exclusiones justificadas y muestra válida, sin seleccionar solo los casos completados.

### C — Encontrar última sesión y peso (SC-007)

Preparación del moderador, fuera de la vista de la persona: crear una cuenta sintética de historial,
poner unidad kg y zona America/Bogota; mediante «Registrar un entrenamiento pasado», finalizar
estas tres sesiones con una serie cada una, de 18:00 a 19:00 local, en días anteriores al ensayo:

| Día local relativo a la sesión de prueba | Ejercicio | Dato ficticio |
|---|---|---|
| D−3 | Press de banca | 40 kg × 8 |
| D−2 | Sentadilla | 80 kg × 6 |
| D−1 | Press de banca | 55 kg × 10 |

Verificar orden, datos y que no quede entrenamiento en curso. Para cada participante abrir un perfil
limpio y acceder a esa cuenta sin mostrar su historial. Comenzar en Entrenar, sin abrir el selector
ni el prellenado del ejercicio. Esta preparación no forma parte del tiempo de búsqueda ni enseña rutas.

Tarjeta:

> Encuentra tu última sesión de Press de banca y dime qué peso usaste.

Inicio: señal «puedes comenzar», tarjeta leída y Entrenar visible. Fin: identifica la sesión de D−1
y puede ver y comunicar **55 kg**. Ver un enlace o una sesión incorrecta no detiene el cronómetro.
Registrar tiempo, sesión correcta, peso correcto y ayuda. **PASS individual**: respuesta correcta
visible en **<15 s**; a 15 s no cumple. Reportar ayuda y resultado asistido aparte, sin presentar un
recorrido guiado como descubrimiento autónomo. No mostrar la tabla de respuestas al participante.

## Hoja de captura y cálculo

Plantilla vacía: las filas se añaden únicamente después de observar una sesión real.
No se han creado filas P01…P10 rellenadas ni tiempos de ejemplo que puedan confundirse con resultados.

| Código | Revisión / fecha / entorno / móvil o emulación | SC-001 s / acciones | SC-002 s / ayuda | SC-003 4 ejercicios / errores / ayuda / primer intento | SC-007 s / sesión y peso correctos / ayuda | Resultado por criterio / incidencias |
|---|---|---|---|---|---|---|

Registrar los fallos con códigos y descripción de la barrera, sin identificadores de cuenta ni datos
personales. Para cada criterio, informar n iniciado, n con observación válida, éxitos, fallos,
incompletos/incidencias y razones de exclusión; no imputar tiempos faltantes como cero.
SC-001/002/007 requieren sus observaciones humanas: informar valores individuales, rango y proporción
que cumple, sin inventar porcentajes de aprobación colectivos que la spec no fija para ellos.
SC-003 = `100 × participantes con éxito / participantes válidos que iniciaron A+B`;
reportar el numerador/denominador real. Con 10 participantes válidos, se necesitan **al menos 9** éxitos
para alcanzar el 90 %. Con otros tamaños usar `ceil(0,9 × n)`, no redondear la tasa hacia arriba.
Si n=0, el resultado es **no evaluable**. No generalizar estadísticamente una ronda exploratoria.

## Plan de observación mensual — SC-009

**Pendiente; no iniciado.** No hay fecha de alta de cohorte, primera semana ni mes observado que
puedan declararse cumplidos. No se usa reloj simulado, fixtures, tareas de Playwright o entrenamientos
creados en bloque como evidencia de retención humana. El ensayo sintético A+B no aporta entrenamientos
al indicador mensual.

Antes de comenzar, el responsable debe acordar voluntariamente una cohorte de uso real, entorno
estable, revisión y fecha de inicio individual. No inferir hábitos de los participantes del ensayo
sintético. Los registros de uso real siguen siendo privados: solo el agregado anónimo se publica.

Definición operativa que se debe fijar antes de recoger datos (no cambiarla al conocer los resultados):

1. Inicio individual = creación de la cuenta para uso real al incorporarse a la cohorte, con
   zona horaria registrada; primera semana = los siete días desde ese inicio. No reutilizar la
   cuenta del ensayo sintético ni reiniciar el reloj de una cuenta preexistente. Primer mes = hasta el aniversario del mes calendario siguiente
   (último día del mes si no existe ese día), manteniendo hora/zona. Registrar ambos límites antes
   de empezar y usar intervalos `[inicio, fin)`. Esperar un **mes calendario real** de cada persona.
2. Denominador: personas de la cohorte que finalizan al menos un entrenamiento real, con series,
   en su primera semana. No incluir cuentas técnicas ni cuentas de demostración; contar usuarios,
   no sesiones. Congelar la elegibilidad al terminar la semana de cada persona.
3. Numerador: de esas mismas personas, quienes finalizan **cuatro o más entrenamientos reales
   distintos** dentro de su primer mes, incluidos los de la primera semana. No contar duplicados,
   sesiones vacías o en curso. No restringir el numerador a quienes respondan una encuesta final.
4. SC-009 = `100 × numerador / denominador`; umbral **≥80 %**, equivalente a
   `ceil(0,8 × denominador)` personas. Si el denominador es cero, **no evaluable**.
5. Revisar semana 1 y al cumplir el mes; revisiones intermedias semanales solo para detectar
   problemas de seguimiento. No solicitar entrenamientos extra para inflar el indicador. Si falta
   un mes de observación o hay datos desconocidos, informar pendientes y no declarar cumplimiento.
   Retiros de consentimiento y pérdida de observación se documentan sin excluir selectivamente fallos.
6. Recolección mínima, manual y acordada: cada participante consulta su historial privado al cierre
   y aporta solo los recuentos de semana/mes o los muestra al observador. Registrar si la fuente
   es autoinforme o verificación visual consentida, y sus límites; no presentarlo como telemetría
   independiente. No pedir exportaciones,
   capturas de entrenamientos, medidas corporales ni credenciales. No añadir analítica, trackers,
   eventos, correos automáticos, tareas programadas o cambios de esquema al producto.
7. Guardar fuera de Git cualquier coordinación o dato individual de seguimiento, con acceso limitado;
   publicar en este informe solo fechas agregadas, tamaño de cohorte/elegibles/observados,
   numerador/denominador, pérdidas y resultado. Facilitar retiro y eliminar los datos temporales
   tras cerrar la revisión. No contactar participantes automáticamente en esta tarea.

| Estado de la cohorte | Inicio / fin real | Elegibles semana 1 | Observados al mes | ≥4 entrenamientos | Tasa / resultado |
|---|---|---|---|---|---|
| No iniciada | No definidos | No determinados | No determinados | No determinado | No evaluable; pendiente |

## Pendientes y criterio de cierre

- Organizar participantes, confirmar el entorno HTTPS para móvil físico, ejecutar A/B/C y registrar
  observaciones humanas. Muestra actual n=0: SC-001/002/003/007 siguen sin verificar por usabilidad.
- Iniciar y observar la cohorte real de SC-009; mantenerlo pendiente hasta disponer del mes completo.
  T061 exige el **plan** mensual, ya documentado, no inventar un mes de observación para marcar SC-009.
- Mantener **T061 sin marcar** mientras falte la ronda humana. T059 conserva sus pendientes;
  no se certifican accesibilidad global, lectura de pantalla ni otros navegadores con este ensayo.
- Después de recibir resultados, registrar tanto éxitos como fallos; si algún criterio no se cumple,
  dejarlo explícito y no aprobarlo solo porque las pruebas técnicas estén verdes.
- Archivos de esta ejecución: únicamente este informe versionable y el log técnico local ignorado.
  `tasks.md`, README, código de producto y evidencia previa permanecen sin cambios por T061.
