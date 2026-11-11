<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Motivo: establecer el stack obligatorio del proyecto y precisar los objetivos
  de rendimiento, pruebas y alcance para un MVP académico.
Principios conservados (sin adiciones, reemplazos ni eliminaciones):
  - I. Integridad y propiedad de los datos del usuario
  - II. Simplicidad y MVP primero
  - III. Registro rápido, mobile-first
  - IV. Test-first (NO NEGOCIABLE)
  - V. Privacidad y seguridad
  - VI. Accesibilidad
Secciones modificadas:
  - I. Integridad: se aclara la implementación sencilla de exportación y
    eliminación de cuenta para el MVP académico.
  - II. Simplicidad: se explicita el alcance principal y las funcionalidades
    excluidas.
  - IV. Test-first: se evita exigir herramientas o infraestructura complejas.
  - Redacción: se corrige la gramática de MUST/SHOULD sin alterar obligaciones.
  - Restricciones del producto y técnicas: se fija el stack y se definen
    condiciones reproducibles para medir rendimiento.
  - Gobernanza: se actualizan versión y fecha de enmienda.
Secciones añadidas o eliminadas: ninguna
Plantillas dependientes: no modificadas (leen la constitución en tiempo de ejecución)
  - .specify/templates/plan-template.md: su "Constitution Check" debe validarse contra I–VI
TODOs diferidos: ninguno nuevo.
-->

# Constitución de Seguimiento de Entrenamientos

Aplicación web para que las personas organicen y registren sus entrenamientos de gimnasio, y los
consulten para ver su progreso y su rendimiento a lo largo del tiempo.

## Core Principles

### I. Integridad y propiedad de los datos del usuario

El historial de entrenamientos es el activo principal del producto y pertenece al usuario.

- Las operaciones MUST NOT perder ni alterar en silencio un entrenamiento registrado. El usuario
  MUST iniciar explícitamente toda edición o eliminación.
- Las eliminaciones de entrenamientos MUST pedir confirmación o permitir deshacer.
- Las magnitudes (peso, repeticiones, duración, distancia) MUST guardarse con su unidad o en una
  unidad canónica única. Los cambios de unidad de visualización (kg/lb) MUST NOT modificar los datos
  guardados.
- Las fechas MUST guardarse con zona horaria o en UTC, para que el historial no se desordene al
  viajar ni con los cambios de horario.
- El usuario MUST disponer de una opción para exportar todos sus datos en un formato abierto (CSV o
  JSON) y de otra para eliminar su cuenta junto con todos sus datos. La implementación MUST ser
  sencilla y adecuada para un MVP académico, sin servicios o flujos avanzados innecesarios.
- Los cambios de esquema MUST incluir una migración que conserve los datos existentes.

**Razón**: si un usuario pierde su historial o deja de confiar en él, el producto ya no sirve para
evaluar su progreso.

### II. Simplicidad y MVP primero

- El MVP MUST centrarse en registrar ejercicios, series, repeticiones y pesos, y consultar los
  entrenamientos y el progreso. La inteligencia artificial, las funciones sociales, los pagos, las
  suscripciones, las integraciones con wearables, la gamificación y los planes generados MUST quedar
  fuera del alcance.
- Las especificaciones MUST organizarse en historias de usuario priorizadas (P1, P2…) que se puedan
  entregar de forma independiente. La P1 MUST aportar valor por sí sola.
- La solución MUST ser la más simple que cumpla la especificación (YAGNI). Toda dependencia,
  capa o servicio adicional MUST justificarse en la tabla "Complexity Tracking" del plan.

**Razón**: un núcleo pequeño y fiable entrega valor antes y se mantiene mejor.

### III. Registro rápido, mobile-first

La aplicación se usa en el gimnasio, entre series, con una mano y con poco tiempo.

- El diseño MUST partir del móvil (desde 360 px de ancho) y adaptarse después a pantallas mayores.
- Registrar una serie (ejercicio, peso, repeticiones) dentro de un entrenamiento en curso MUST
  requerir como máximo 3 interacciones cuando el ejercicio ya está seleccionado.
- La aplicación SHOULD prellenar valores con la última sesión del mismo ejercicio.
- La aplicación MUST conservar localmente los datos que se están introduciendo si falla la conexión
  o se recarga la página, hasta que se confirme su sincronización.
- Los controles táctiles MUST medir al menos 44×44 px.

**Razón**: si registrar un entrenamiento es más lento que apuntarlo en papel, el usuario abandona la
aplicación y deja de tener datos con los que medir su progreso.

### IV. Test-first (NO NEGOCIABLE)

- El equipo MUST escribir los tests de aceptación de cada historia de usuario antes de implementar y
  MUST comprobar que fallan antes de implementar (Rojo → Verde → Refactor).
- La lógica de dominio (cálculo de volumen, récords personales, conversión de unidades, agregados de
  progreso) MUST tener tests unitarios, incluidos los casos límite.
- Los flujos críticos (registrar entrenamiento, consultar historial, ver progreso, exportar datos)
  MUST tener al menos un test de extremo a extremo.
- El equipo MUST NOT integrar cambios con tests en rojo.

Las pruebas MUST usar herramientas habituales del stack y MUST NOT requerir herramientas,
servicios externos o infraestructura de pruebas compleja, salvo que el plan justifique su necesidad.

**Razón**: los cálculos de progreso solo sirven si son correctos, y los tests son la forma de
comprobar que cumplen la especificación.

### V. Privacidad y seguridad

- Cada usuario MUST acceder únicamente a sus propios datos. La autorización MUST comprobarse en el
  servidor en cada operación, nunca solo en el cliente.
- La aplicación MUST almacenar las contraseñas con un algoritmo de hash adaptativo (Argon2id o
  bcrypt). Toda comunicación MUST realizarse por HTTPS.
- La aplicación MUST recoger solo los datos personales necesarios para la funcionalidad. Los datos
  de salud o corporales (peso, medidas) se tratan como sensibles.
- Los datos personales y los secretos MUST NOT aparecer en logs, analíticas ni en el repositorio.
- La aplicación MUST validar las entradas del usuario en el servidor.

**Razón**: el historial de actividad física y de medidas corporales es información personal
sensible.

### VI. Accesibilidad

- La interfaz MUST cumplir WCAG 2.1 nivel AA: contraste suficiente, navegación completa por teclado,
  foco visible y etiquetas accesibles en todos los controles.
- La información de los gráficos de progreso MUST estar también disponible como texto o tabla.
- El color MUST NOT ser el único medio para transmitir información.
- Las historias de usuario con interfaz MUST incluir una verificación de accesibilidad
  (automática y manual) en sus criterios de aceptación.

**Razón**: el producto está pensado para cualquier persona que entrene, sin importar cómo use el
dispositivo.

## Restricciones del producto y técnicas

- **Plataforma**: aplicación web responsive que funcione en las dos últimas versiones de los
  navegadores principales, móviles y de escritorio. Las apps nativas quedan fuera del alcance
  inicial.
- **Rendimiento**: los objetivos MUST medirse en pruebas reproducibles con Chrome estable, viewport
  de 360×800 px, emulación de CPU móvil de gama media con ralentización 4× y red 4G simulada (10 Mbps
  de descarga, 5 Mbps de subida y 100 ms de latencia). Con la caché vacía, la primera carga MUST ser
  interactiva antes de 3 s en al menos 4 de 5 ejecuciones. En el mismo entorno, la acción de registrar
  un dato MUST mostrar respuesta visual local antes de 100 ms. Estos objetivos describen el escenario
  de prueba y no garantizan el mismo rendimiento en cualquier dispositivo o conexión.
- **Stack**: el proyecto MUST usar React con TypeScript y Tailwind CSS en el frontend, NestJS con
  TypeScript en el backend, TypeORM como ORM y PostgreSQL como base de datos. Docker Compose MUST
  utilizarse para ejecutar PostgreSQL en desarrollo y pruebas. La comunicación entre frontend y
  backend MUST realizarse mediante una API REST.
- **Idioma**: la interfaz inicial está en español. Los textos SHOULD centralizarse para poder
  traducirlos más adelante.

## Flujo de desarrollo y puertas de calidad

- Cada funcionalidad sigue el ciclo de Spec Kit: `/speckit-specify` → `/speckit-clarify` (si hay
  ambigüedades) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.
- Cada funcionalidad se desarrolla en su propia rama de git (`NNN-nombre-corto`).
- **Puerta del plan**: el "Constitution Check" del plan MUST verificar los principios I–VI. Las
  excepciones MUST justificarse en "Complexity Tracking".
- **Puerta de integración**: tests en verde, sin errores de lint ni de tipos, revisión de
  accesibilidad superada y criterios de aceptación de la especificación verificados.
- Las especificaciones describen qué y por qué, sin detalles de implementación. El cómo pertenece al
  plan.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica o guía del proyecto.
- **Enmiendas**: se proponen con `/speckit-constitution`, documentando el cambio y su motivo en el
  Sync Impact Report. Si afectan a funcionalidades en curso, la enmienda MUST incluir un plan de
  adaptación.
- **Versionado** (SemVer):
  - MAJOR: se elimina o redefine un principio de forma incompatible.
  - MINOR: se añade un principio o sección, o se amplía de forma material.
  - PATCH: aclaraciones y cambios de redacción.
- **Cumplimiento**: cada plan, cada `/speckit-analyze` y cada revisión de código MUST verificar el
  cumplimiento. Toda desviación MUST estar justificada y documentada.

**Version**: 1.1.0 | **Ratified**: 2026-10-19 | **Last Amended**: 2026-11-11
