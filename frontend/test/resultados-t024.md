# Verificación de T024 — Acceso móvil y sesión

Fecha: 2026-11-14. Solo T024 (I3). Sin selector de ejercicios (T025), cola (T026), service worker (T026A) ni páginas de entrenamiento (T027/T028).

## Alcance

T016–T023 integradas (a0cf5dd); backend 143/143. Fuentes revisadas: FR-001 a FR-003 y FR-027, US1 escenarios 1–3, contrato «Autenticación», R-03, R-10 y R-16, quickstart V1. Las rutas y los textos accesibles siguen los E2E de T012 y T015: `/login`, `/registro`, «Correo electrónico», «Contraseña», «Iniciar sesión», «Crear cuenta», título «Entrenar» y «Cerrar sesión» en Cuenta.

## Decisiones aprobadas por el responsable

1. **Contraseña de 8 a 128 caracteres.** Es la regla de `data-model.md`. El esquema de T008 exigía 12; se corrigió en `packages/domain/src/validacion/auth.ts` con una prueba nueva (`packages/domain/test/auth.test.ts`). El backend, que usa ese esquema, queda alineado.
2. **Alias del dominio en `frontend/vite.config.ts` (T010A).** El dominio se compila en CommonJS para el backend, y el build de producción no reconocía sus exportaciones; es la primera vez que el frontend lo importa en tiempo de ejecución. El frontend usa ahora la fuente ESM: 113 kB gzip, frente a 199 kB con la alternativa `commonjsOptions`.

## Implementación

- **API (`api/auth.ts`):** `obtenerSesion` (`GET /auth/yo`, con 401 interpretado como «sin sesión»), `iniciarSesion`, `registrarse` y `cerrarSesion`, sobre el cliente con cookies de T010.
- **Sesión (`app/sesion.tsx`):**
  - La consulta `['sesion']` de TanStack Query es la única fuente de verdad.
  - Al iniciar sesión, registrarse, cerrar sesión o caducar la sesión se vacían las consultas y mutaciones del usuario anterior y se ejecutan las tareas registradas con `registrarLimpiezaDeSesion`. **Ese es el punto de integración de la cola de T026.**
  - No se guarda nada en `localStorage` ni en `sessionStorage`.
- **Caducidad (`app/Proveedores.tsx`):** cualquier 401 de una petición privada marca la sesión como caducada. Las mutaciones de acceso llevan `meta.acceso` para que un 401 por credenciales incorrectas no se confunda con una caducidad.
- **Rutas (`app/RutaProtegida.tsx`, `app/rutas.tsx`):**
  - `RutaPrivada` envía a `/login` recordando la página pedida (`state.desde`).
  - `RutaPublica` devuelve a esa página tras iniciar sesión.
  - Mientras se comprueba la sesión se muestra una pantalla con `role="status"`. Sin conexión aparece un aviso con «Reintentar».
- **Pantallas (`paginas/auth/`):**
  - `PantallaAcceso` es la composición común.
  - `PaginaLogin` y `PaginaRegistro` validan con los esquemas del dominio y muestran mensajes propios.
  - Los errores del servidor se traducen así: 400 por campo, 409 `EMAIL_EN_USO` en el correo, 401 en el login con un aviso idéntico para cualquier cuenta y error de red con su propio aviso.
  - `CerrarSesion` es la tarjeta de la sección Cuenta.
- **Componentes de T010:**
  - `Campo` añade la propiedad `ayuda`, que se oculta mientras hay un error.
  - `Boton` añade la propiedad `cargando` (deshabilitado, `aria-busy` y spinner con `motion-safe`).
  - Iconos nuevos: alerta, salir y cargando.
  - `PaginaSeccion` acepta contenido adicional.
  - `Layout` mueve el foco al título en toda navegación salvo la primera carga del documento, también al entrar tras iniciar sesión.

## Diseño

Se aplicó la skill `frontend-design` con su proceso de plan, revisión, construcción y autocrítica con capturas.

Tras la revisión del responsable («más app deportiva»), toda la app pasa a un tema oscuro:

- **Fondo y superficies:** fondo `slate-950` y superficies `slate-900` con borde `white/10`.
- **Lima como color de acción:** botón principal (lima con texto negro), sección activa y contorno de foco.
- **Tipografía:** títulos en negrita máxima e itálica, sin fuentes externas, para no afectar a la carga ni al uso sin conexión.
- **Pantallas de acceso:** el elemento distintivo es una serie de ejemplo («Sentadilla · 100 kg × 5 · Serie 3 de 4», decorativa con `aria-hidden`), que sustituye a la barra olímpica. En móvil se muestra compacta y el botón de envío queda dentro de la pantalla a 360×800. En escritorio, dos columnas.
- **Componentes de T010 adaptados al tema:**
  - `Campo` (relleno oscuro, error en rojo claro).
  - `Boton` (principal lima, secundaria con contorno).
  - Foco lima en `estilos.ts`.
  - `Layout`, `PaginaSeccion` y `NoEncontrada`.
  - Fondo base en `styles.css`, para evitar destellos blancos al cargar.

Segunda iteración, con las skills `design-critique` y `frontend-design`:

- **Tipografía de titulares y cifras:** Barlow Condensed (SIL OFL 1.1, licencia en `frontend/src/assets/fuentes/OFL.txt`). Está autoalojada, sin servicios externos, para que funcione sin conexión. Se usan dos cortes (800 itálica y 700 normal), unos 44 kB. El texto corrido sigue con la fuente del sistema.
- **Interior sin tarjetas apiladas:** el título va directo sobre el fondo y el lima queda solo para acción y estado activo. La cabecera es más delgada y no lleva lema.
- **Una única animación al abrir el acceso:** la serie de ejemplo entra, la tercera barra se llena y aparece «Guardada». Solo con `motion-safe`; con movimiento reducido no hay animación (verificado: `animation-name: none`).

Tercera iteración, a petición del responsable («más ingenioso»): la serie de ejemplo se sustituye por un **disco olímpico de goma** con el aro de marca «20 KG · GYMTRACK» en lima. Es decorativo (`aria-hidden`) y asoma recortado en la esquina en móvil o tras la línea divisoria en escritorio. Al cargar entra rodando una sola vez, con `motion-safe`. Se comprobó geométricamente que el disco no se superpone a la frase ni al lema.

La autocrítica con capturas corrigió:
- La regla de longitud duplicada bajo la contraseña.
- Un aviso de login vago.
- La división de la frase en escritorio.
- La alineación en tableta.
- La tarjeta, que al principio no se veía en móvil.
- El roce de las barras de progreso con la etiqueta «Guardada» a 360 px.

## Pruebas

| Suite | Antes de implementar | Después |
|---|---|---|
| `packages/domain/test/auth.test.ts` | 2 rojos (8 caracteres rechazados; email sin recortar) | 6/6 |
| `frontend/test/auth.test.tsx` (18 casos) | Rojo: no existía `src/app/sesion` | 18/18 |
| Refinamientos (aviso de login propio, ayuda oculta con error) | 3 rojos | Verdes |
| `frontend/test/shell.test.tsx` (T010) | Adaptada: cada caso arranca con sesión simulada (`/auth/yo` → 200) y espera a que se resuelva; mismas aserciones | 22/22 |

Casos de `auth.test.tsx`:
- Redirección sin sesión y vuelta a la página pedida, con el foco en su título.
- Pantalla de comprobación de sesión.
- Etiquetas, `autocomplete` y área táctil.
- Validación en el cliente con el esquema compartido (8 y 128 caracteres, email) y foco en el primer campo inválido.
- Contrato `POST /auth/login` y `/auth/registro`, con la zona horaria del dispositivo.
- Aviso idéntico para credenciales incorrectas o cuenta desconocida.
- Estado de carga sin envíos duplicados y aviso sin conexión.
- Errores 400 por campo y 409 `EMAIL_EN_USO`.
- Cierre de sesión con vaciado de caché y ejecución de la limpieza registrada.
- Caducidad de la sesión.
- Ausencia de contraseñas y tokens en el almacenamiento.

Resultados finales:

| Verificación | Resultado |
|---|---|
| Frontend | 47 verdes; 7 rojos esperados (interfaz de T014, que cierra T025), todos por «Añadir ejercicio» no encontrado |
| Dominio | 35/35 |
| Backend | 143/143 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` (global) | Salida 0 |
| Build de producción | 362 kB JS, 113 kB gzip |
| `git diff --check` | Correcto |

## Navegador real (Chromium, API y PostgreSQL reales)

Verificación con Playwright y axe-core contra el frontend en el puerto 5175 y la API real en el 3000:

| Comprobación | Resultado |
|---|---|
| axe WCAG 2.1 A/AA en login, registro (con y sin errores), login con error y Cuenta | 0 violaciones |
| Desplazamiento horizontal a 360, 768 y 1280 px | Ninguno |
| Controles interactivos | Todos de al menos 44×44 px |
| Registro real | Lleva a «Entrenar» con el foco en el título |
| Cierre de sesión real | `GET /auth/yo` responde 401, la cookie `gt_sesion` desaparece y `/historial` redirige a `/login` |
| Login real tras pedir `/historial` | Vuelve a `/historial`; `localStorage` y `sessionStorage` vacíos |

Las cuentas de demostración `t024.demo.*@example.invalid` se borraron de la base de desarrollo.

## Pendiente

- **E2E de T012 y T015 (Playwright, puerto 5173 y certificado de confianza):** no se ejecutaron. El puerto 5173 lo usa otro proyecto local y falta el certificado mkcert de confianza. Quedan para cuando el responsable prepare el entorno.
- **Sesión sin conexión:** si `/auth/yo` falla por falta de red, se muestra el aviso con «Reintentar». La carga sin conexión del shell y la sesión conocida sin red corresponden a T026 y T026A.
