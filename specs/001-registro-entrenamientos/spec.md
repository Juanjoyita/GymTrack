# Feature Specification: Registro y seguimiento de entrenamientos

**Feature Branch**: `001-registro-entrenamientos`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Aplicación web de seguimiento de entrenamientos de gimnasio destinada a
personas que desean organizar y registrar su actividad física. Su propósito central es facilitar el
registro y la consulta de sus entrenamientos para evaluar su progreso y mantener un seguimiento de su
rendimiento a lo largo del tiempo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar un entrenamiento en el gimnasio (Priority: P1)

Una persona llega al gimnasio, abre la aplicación en el móvil e inicia un entrenamiento. Elige un
ejercicio (por ejemplo, "Press de banca") y va anotando cada serie que hace (peso y repeticiones)
justo después de terminarla. Añade más ejercicios a medida que avanza la sesión. Al acabar, finaliza
el entrenamiento y queda guardado con su fecha, su duración y todas las series.

**Why this priority**: sin registro no hay datos. Es el núcleo del producto y por sí solo ya sustituye
a la libreta de papel.

**Independent Test**: se prueba creando una cuenta, iniciando un entrenamiento, registrando varias
series de dos ejercicios y finalizándolo. Después se comprueba que el entrenamiento guardado contiene
exactamente esos datos.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado sin entrenamiento en curso, **When** inicia un entrenamiento,
   **Then** se crea una sesión en curso con la fecha y la hora de inicio.
2. **Given** un entrenamiento en curso con un ejercicio seleccionado, **When** el usuario introduce
   un peso y unas repeticiones y confirma, **Then** la serie se añade a ese ejercicio con un máximo
   de 3 interacciones.
3. **Given** un ejercicio que el usuario ya hizo en una sesión anterior, **When** lo añade al
   entrenamiento actual, **Then** los campos de la primera serie aparecen prellenados con los valores
   de la última vez y se muestra lo que hizo en esa sesión.
4. **Given** un ejercicio que no está en el catálogo, **When** el usuario escribe un nombre nuevo,
   **Then** puede crearlo como ejercicio propio y usarlo de inmediato.
5. **Given** una serie registrada por error, **When** el usuario la edita o la elimina, **Then** el
   cambio se refleja al momento y la eliminación se puede deshacer.
6. **Given** un entrenamiento en curso, **When** el usuario lo finaliza, **Then** queda guardado con
   la hora de fin, su duración y un resumen (ejercicios, series y volumen total).
7. **Given** un entrenamiento en curso, **When** se pierde la conexión o se recarga la página,
   **Then** no se pierde ninguna serie ya introducida y el entrenamiento se puede seguir registrando.

---

### User Story 2 - Consultar el historial de entrenamientos (Priority: P2)

El usuario quiere ver qué hizo en sesiones anteriores: abre su historial, ve sus entrenamientos
ordenados del más reciente al más antiguo y entra en uno para ver el detalle de ejercicios y series.
También puede corregir o eliminar un entrenamiento pasado.

**Why this priority**: consultar es la segunda mitad del propósito del producto, y además es lo que
hace falta para planificar la próxima sesión.

**Independent Test**: con varios entrenamientos ya registrados, se comprueba que el historial los
lista en orden con su resumen, que el detalle coincide con lo registrado y que la edición y la
eliminación funcionan.

**Acceptance Scenarios**:

1. **Given** un usuario con entrenamientos registrados, **When** abre el historial, **Then** ve la
   lista ordenada por fecha descendente, con la fecha, la duración, el número de ejercicios y el
   volumen total de cada uno.
2. **Given** el historial, **When** el usuario selecciona un entrenamiento, **Then** ve todos sus
   ejercicios y series en el orden en que se registraron.
3. **Given** el historial, **When** el usuario filtra por un ejercicio o por un rango de fechas,
   **Then** solo ve los entrenamientos que cumplen el filtro.
4. **Given** un entrenamiento pasado, **When** el usuario edita una serie, **Then** el cambio se
   guarda y los resúmenes y el progreso se recalculan.
5. **Given** un entrenamiento pasado, **When** el usuario lo elimina, **Then** se le pide
   confirmación y, una vez confirmado, desaparece del historial y del progreso.
6. **Given** un usuario sin entrenamientos, **When** abre el historial, **Then** ve un mensaje
   que le invita a registrar su primer entrenamiento.

---

### User Story 3 - Ver el progreso por ejercicio (Priority: P3)

El usuario quiere saber si está mejorando. Selecciona un ejercicio y ve cómo han evolucionado su
peso máximo, su volumen y su 1RM estimado a lo largo del tiempo, junto con sus récords personales.
Cuando bate un récord durante un entrenamiento, la aplicación se lo indica.

**Why this priority**: es el valor diferencial (evaluar el progreso), pero depende de que antes haya
datos registrados (P1) y consultables (P2).

**Independent Test**: con un conjunto de entrenamientos conocido para un ejercicio, se comprueba que
las métricas, la evolución y los récords mostrados coinciden con los valores calculados a mano.

**Acceptance Scenarios**:

1. **Given** un ejercicio con al menos dos sesiones registradas, **When** el usuario abre su
   progreso, **Then** ve la evolución por sesión de: peso máximo levantado, volumen total
   (peso × repeticiones) y 1RM estimado.
2. **Given** la vista de progreso, **When** el usuario elige un periodo (último mes, últimos 3 meses,
   último año, todo), **Then** la evolución se limita a ese periodo.
3. **Given** la vista de progreso, **When** el usuario la consulta con un lector de pantalla o elige
   ver la tabla, **Then** tiene los mismos datos en formato de tabla.
4. **Given** un ejercicio, **When** el usuario consulta sus récords personales, **Then** ve el mayor
   peso, el mejor 1RM estimado y el mayor volumen en una sesión, cada uno con su fecha.
5. **Given** un entrenamiento en curso, **When** el usuario registra una serie que supera uno de sus
   récords personales para ese ejercicio, **Then** se le avisa en ese momento de que es un nuevo
   récord.
6. **Given** un ejercicio con una sola sesión, **When** el usuario abre su progreso, **Then** ve los
   datos de esa sesión y un aviso de que hacen falta más sesiones para ver una tendencia.

---

### User Story 4 - Gestionar la cuenta y los datos personales (Priority: P4)

El usuario crea su cuenta, inicia sesión desde cualquier dispositivo, elige su unidad de peso
preferida (kg o lb), puede descargar todos sus datos y, si quiere, eliminar su cuenta con todo su
contenido.

**Why this priority**: crear la cuenta e iniciar sesión es un requisito previo para P1. La
exportación, las preferencias y la eliminación de la cuenta completan la propiedad de los datos
(Principio I), pero no bloquean el valor inicial.

**Independent Test**: se registra un usuario, se cambia la unidad, se exportan los datos y se
comprueba el archivo; después se elimina la cuenta y se comprueba que ya no se puede acceder a ella
ni a sus datos.

**Acceptance Scenarios**:

1. **Given** un visitante, **When** se registra con email y contraseña, **Then** se crea su cuenta
   y accede a la aplicación.
2. **Given** un usuario registrado, **When** inicia sesión en otro dispositivo, **Then** ve el mismo
   historial.
3. **Given** un usuario con datos en kg, **When** cambia su preferencia a lb, **Then** todos los
   pesos se muestran convertidos y los valores guardados no cambian (al volver a kg se ven los
   valores originales).
4. **Given** un usuario con entrenamientos, **When** solicita exportar sus datos, **Then** descarga
   un archivo en formato abierto con todos sus entrenamientos, ejercicios y series.
5. **Given** un usuario, **When** solicita eliminar su cuenta y lo confirma, **Then** su cuenta y
   todos sus datos se eliminan de forma permanente.
6. **Given** un usuario que olvidó su contraseña, **When** solicita restablecerla, **Then** recibe
   un enlace de un solo uso, con caducidad, para crear una nueva.

---

### Edge Cases

- **Valores fuera de rango**: un peso negativo, unas repeticiones en 0 o valores absurdos (por
  ejemplo, 5000 kg) se rechazan con un mensaje claro. Se acepta un peso de 0 (ejercicios con el peso
  corporal).
- **Ejercicios con el peso corporal o con lastre**: se puede registrar una serie sin peso (solo
  repeticiones) o con peso añadido.
- **Entrenamiento olvidado en curso**: si un entrenamiento lleva más de 12 horas sin actividad, al
  volver se le pregunta al usuario si quiere finalizarlo (con la hora de la última serie como hora
  de fin) o descartarlo.
- **Entrenamiento sin series**: un entrenamiento que se finaliza sin ninguna serie no se guarda en el
  historial y se avisa al usuario.
- **Dos dispositivos a la vez**: si el mismo entrenamiento se edita desde dos dispositivos, no se
  pierde ninguna serie. Las series de ambos se conservan.
- **Sin conexión prolongada**: las series registradas sin conexión se sincronizan cuando vuelve la
  conexión, y el usuario ve claramente qué datos están pendientes de sincronizar.
- **Nombres de ejercicio duplicados**: no se puede crear un ejercicio propio con el mismo nombre que
  otro existente (sin distinguir mayúsculas ni tildes). Se sugiere usar el existente.
- **Eliminar un ejercicio propio que ya se usó**: se avisa de cuántos entrenamientos lo contienen y
  no se permite eliminarlo mientras tenga series. Sí se puede renombrar.
- **Fechas y zonas horarias**: un entrenamiento cerca de medianoche o registrado en otra zona horaria
  aparece en el día local en el que se hizo.
- **Historial muy grande**: con cientos de entrenamientos, el historial y el progreso siguen
  respondiendo con rapidez.

## Requirements *(mandatory)*

### Functional Requirements

**Cuenta y acceso**

- **FR-001**: El sistema MUST permitir crear una cuenta con email y contraseña, iniciar sesión,
  cerrar sesión y restablecer la contraseña mediante un enlace enviado al email.
- **FR-002**: El sistema MUST garantizar que cada usuario solo puede ver y modificar sus propios
  datos.
- **FR-003**: Los datos de un usuario MUST estar disponibles en cualquier dispositivo en el que inicie
  sesión.

**Catálogo de ejercicios**

- **FR-004**: El sistema MUST ofrecer un catálogo inicial de ejercicios de gimnasio habituales, cada
  uno con su nombre y el grupo muscular principal.
- **FR-005**: Los usuarios MUST poder crear, renombrar y eliminar ejercicios propios, que solo verán
  ellos.
- **FR-006**: El selector de ejercicios MUST permitir buscar por nombre (sin distinguir mayúsculas
  ni tildes) y MUST mostrar primero los ejercicios usados recientemente.

**Registro de entrenamientos**

- **FR-007**: Los usuarios MUST poder iniciar un entrenamiento, añadirle ejercicios en cualquier orden
  y finalizarlo. El sistema registra la fecha, la hora de inicio y la hora de fin.
- **FR-008**: Para cada ejercicio de un entrenamiento, los usuarios MUST poder registrar series con
  repeticiones (entero ≥ 1) y peso (≥ 0, con decimales).
- **FR-009**: El sistema MUST prellenar la nueva serie con los valores de la serie anterior del mismo
  ejercicio en la sesión actual o, si no hay, con la primera serie de la última sesión en la que se
  hizo ese ejercicio.
- **FR-010**: Los usuarios MUST poder editar y eliminar series y ejercicios de un entrenamiento, tanto
  en curso como finalizado. Las eliminaciones MUST pedir confirmación o permitir deshacer.
- **FR-011**: Los usuarios MUST poder añadir una nota de texto opcional a un entrenamiento y a cada
  ejercicio dentro de él.
- **FR-012**: Toda serie introducida MUST conservarse aunque se pierda la conexión, se cierre la
  pestaña o se recargue la página, y MUST sincronizarse cuando vuelva la conexión, indicando al
  usuario qué está pendiente.
- **FR-013**: Solo MUST poder haber un entrenamiento en curso a la vez por usuario.
- **FR-014**: Los usuarios MUST poder registrar a posteriori un entrenamiento de una fecha pasada.

**Historial**

- **FR-015**: El sistema MUST mostrar el historial de entrenamientos ordenado por fecha descendente,
  con un resumen de cada uno: fecha, duración, número de ejercicios, número de series y volumen total.
- **FR-016**: Los usuarios MUST poder ver el detalle completo de cualquier entrenamiento pasado.
- **FR-017**: Los usuarios MUST poder filtrar el historial por ejercicio y por rango de fechas.
- **FR-018**: Los usuarios MUST poder eliminar un entrenamiento pasado, previa confirmación.

**Progreso**

- **FR-019**: Para cada ejercicio, el sistema MUST mostrar la evolución por sesión del peso máximo, el
  volumen total y el 1RM estimado, en forma de gráfico y de tabla equivalente.
- **FR-020**: El 1RM estimado MUST calcularse con la fórmula de Epley, peso × (1 + repeticiones / 30),
  tomando la mejor serie de la sesión. Para series de 1 repetición, el 1RM estimado es el propio peso.
  Las series de más de 12 repeticiones no se usan para el 1RM.
- **FR-021**: El sistema MUST mantener, para cada ejercicio, los récords personales (mayor peso, mejor
  1RM estimado y mayor volumen en una sesión) con la fecha en que se lograron, y MUST recalcularlos
  cuando se editan o eliminan datos.
- **FR-022**: El sistema MUST avisar durante el entrenamiento cuando una serie establece un nuevo
  récord personal.
- **FR-023**: Los usuarios MUST poder limitar la vista de progreso a un periodo: último mes, 3 meses,
  1 año o todo.

**Datos y preferencias**

- **FR-024**: Los usuarios MUST poder elegir kg o lb como unidad de visualización. Cambiar la unidad
  MUST NOT alterar los valores guardados.
- **FR-025**: Los usuarios MUST poder exportar todos sus datos (entrenamientos, ejercicios propios y
  series) en CSV y en JSON.
- **FR-026**: Los usuarios MUST poder eliminar su cuenta. Tras confirmarlo, su cuenta y todos sus
  datos se eliminan de forma permanente.
- **FR-027**: El sistema MUST validar todas las entradas y mostrar mensajes de error claros junto al
  campo afectado.

### Key Entities *(include if feature involves data)*

- **Usuario**: la persona que entrena. Tiene un email, una credencial de acceso, una unidad de peso
  preferida y su zona horaria. Es dueña de todos sus entrenamientos y de sus ejercicios propios.
- **Ejercicio**: un movimiento que se puede registrar (por ejemplo, "Sentadilla"). Tiene un nombre y
  un grupo muscular principal. Puede ser del catálogo (compartido por todos) o propio (de un solo
  usuario).
- **Entrenamiento (sesión)**: una visita al gimnasio. Pertenece a un usuario y tiene fecha, hora de
  inicio, hora de fin, un estado (en curso o finalizado) y una nota opcional. Contiene una lista
  ordenada de ejercicios realizados.
- **Ejercicio realizado**: un ejercicio dentro de un entrenamiento concreto, con su posición en la
  sesión y una nota opcional. Contiene una lista ordenada de series.
- **Serie**: una ejecución con unas repeticiones y un peso (guardado en una unidad canónica). Tiene
  un orden dentro del ejercicio realizado y el momento en que se registró.
- **Récord personal**: el mejor valor de un usuario en un ejercicio para una métrica (peso máximo,
  1RM estimado o volumen por sesión), con su fecha y el entrenamiento en que se logró. Se deriva de
  las series.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con el ejercicio ya seleccionado, un usuario registra una serie en menos de 5 segundos
  y con un máximo de 3 interacciones.
- **SC-002**: Un usuario nuevo crea su cuenta, inicia su primer entrenamiento y registra su primera
  serie en menos de 2 minutos, sin ayuda.
- **SC-003**: El 90 % de los usuarios de las pruebas de usabilidad completan un entrenamiento de 4
  ejercicios en el móvil al primer intento y sin errores.
- **SC-004**: El 0 % de las series confirmadas se pierden, incluidas las pruebas con pérdida de
  conexión, recarga de página y cierre del navegador durante un entrenamiento.
- **SC-005**: Con 500 entrenamientos registrados, el historial y la vista de progreso de un
  ejercicio muestran sus datos en menos de 2 segundos.
- **SC-006**: Los récords personales y el 1RM estimado coinciden al 100 % con el cálculo manual en un
  conjunto de casos de prueba de referencia.
- **SC-007**: Un usuario encuentra su última sesión de un ejercicio concreto y ve qué peso usó en
  menos de 15 segundos.
- **SC-008**: Todas las pantallas superan una auditoría de WCAG 2.1 AA sin incidencias críticas.
- **SC-009**: El 80 % de los usuarios que registran un entrenamiento en su primera semana registran
  al menos 4 entrenamientos en su primer mes (indicador de que el registro les resulta útil).

## Assumptions

- **Usuario objetivo**: personas que entrenan en el gimnasio, sobre todo con pesas, que llevan el
  móvil durante la sesión. No hay roles de entrenador ni de administrador en esta versión.
- **Tipo de ejercicio**: esta versión se centra en ejercicios de fuerza (peso × repeticiones). Los
  ejercicios de cardio o por tiempo (cinta, plancha) quedan fuera del alcance inicial.
- **Fuera del alcance**: rutinas o plantillas predefinidas, planes de entrenamiento, temporizador de
  descanso, seguimiento del peso corporal y las medidas, funciones sociales, integración con
  wearables y aplicaciones nativas.
- **Autenticación**: email y contraseña con restablecimiento por email. El acceso con Google u otros
  proveedores queda para más adelante.
- **Catálogo inicial**: unos 50 ejercicios habituales con nombre en español y su grupo muscular. El
  contenido exacto se definirá en el plan.
- **Unidad por defecto**: kg. El usuario puede cambiarla a lb en cualquier momento.
- **Conectividad**: normalmente hay conexión en el gimnasio, pero puede ser intermitente. Por eso el
  registro tolera cortes (FR-012). La aplicación no necesita funcionar sin conexión desde el primer
  uso (iniciar sesión requiere conexión).
- **Retención de datos**: los datos se conservan mientras la cuenta exista y se eliminan de forma
  permanente cuando el usuario borra su cuenta.
- **Idioma**: la interfaz está en español, según la constitución.
