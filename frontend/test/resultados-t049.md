# Verificación de T049 — Cuenta y recuperación de contraseña

Fecha: 2026-11-16. Solo T049 (I3). Depende de T048 (PR #30, `f2b845d`).

## Alcance

tasks.md pide:
- preferencias, exportación, eliminación y recuperación;
- pesos convertidos con el dominio compartido;
- descarga en ambos formatos;
- errores claros de enlace;
- confirmación del borrado;
- limpieza local y de la caché al eliminar la cuenta, sin reintentar datos borrados.

Requisitos: FR-001 y FR-024 a FR-026, research R-17 y R-18, y el contrato «Autenticación y cuenta». La interfaz sigue el E2E de T044 (`e2e/tests/cuenta.spec.ts`, I4).

Decisiones aprobadas por el responsable:
- solo el selector de unidad, sin zona horaria (se envía únicamente `{ unidadPeso }`);
- cambio mínimo en Historial (I4) para mostrar y editar en la unidad del usuario.

## Archivos

| Archivo | Contenido |
|---|---|
| `frontend/src/api/cuenta.ts` (nuevo) | `actualizarPreferencias`, `exportarDatos` y `eliminarCuenta` |
| `frontend/src/api/auth.ts` (T024, I3) | `solicitarRecuperacion` y `restablecerContrasena` |
| `frontend/src/api/cliente.ts` (T010, I3) | `descargar`: ficheros no JSON con los mismos errores que `solicitar` y el nombre de `Content-Disposition` |
| `frontend/src/app/sesion.tsx` (T024, I3) | `useActualizarPreferencias`, `useRestablecerContrasena` (olvida la sesión local) y `olvidarCuenta` (sesión, caché y claves `gymtrack:*:<id>` del usuario) |
| `frontend/src/sincronizacion/cola.ts` (T026, I3) | `borrar()`: vacía y **cierra** la cola, que ya no puede volver a escribirse ni enviar nada |
| `frontend/src/paginas/cuenta/` (nuevo) | `PaginaCuenta`, `Preferencias`, `Exportacion` y `EliminarCuenta` |
| `frontend/src/paginas/auth/` | `PaginaRecuperar` y `PaginaRestablecer` (nuevos); enlace «¿Olvidaste tu contraseña?» y aviso en `PaginaLogin` |
| `frontend/src/app/rutas.tsx` | `/recuperar` y `/restablecer` (con o sin sesión) y `/cuenta` |
| `frontend/src/componentes/Iconos.tsx`, `frontend/src/textos/es.ts` | Icono de descarga y textos |
| `frontend/src/paginas/historial/PaginaDetalleHistorial.tsx` y `PaginaHistorial.tsx` (**I4, autorizado**) | Mostrar los pesos y el volumen en la unidad del usuario con `kgALb`, y editar enviando `pesoEntrada` en esa unidad |
| `frontend/test/cuenta.test.tsx`, `frontend/test/recuperacion.test.tsx` (nuevos) | 25 pruebas |
| `frontend/test/utils/api-entrenamiento.ts` (I3) | Preferencias, lista de historial, exportación y `DELETE /cuenta` en la API en memoria |
| `frontend/test/shell.test.tsx` (T010, I3) | Cuenta deja de ser un marcador «Próximamente» |

## Comportamiento

**Preferencias:**
- selector «Unidad de peso» con «Kilogramos (kg)» y «Libras (lb)»;
- ejemplo calculado con el dominio: «100 kg = 220,46 lb»;
- estados de guardando, guardado (`status`) y error (`alert`).

La sesión y la sesión recordada se actualizan sin borrar la caché. Entrenar, Historial y Progreso muestran la unidad elegida y los pesos guardados no cambian.

**Exportación:** botones «Exportar JSON» y «Exportar CSV».
- Usa `fetch` con la cookie, crea un enlace temporal con el nombre que da el servidor y lo libera después.
- Con un 500 o sin red no descarga nada y lo explica.

**Recuperar:** el mismo mensaje neutro para cualquier email.
- El `429` muestra un aviso que no revela si la cuenta existe.
- El email no se guarda.

**Restablecer:**
- el token sale de la URL al abrir la página y solo vive en memoria;
- la contraseña se valida con el esquema compartido;
- si sale bien, se olvida la sesión local (el servidor las cierra todas) y se va a «Iniciar sesión» con un aviso;
- con un `410`, o sin token, aparece el error «El enlace no es válido, ya se usó o ha caducado. Solicita uno nuevo.» y el enlace «Solicitar un enlace nuevo».

**Eliminar la cuenta:** diálogo modal con texto explicativo, aviso de cambios sin sincronizar, contraseña obligatoria, «Eliminar definitivamente» y «Cancelar». El foco va a la contraseña y vuelve al botón al cerrar.
- Con un 401 aparece el error junto al campo y no se borra nada.
- Con un fallo de red o del servidor, aviso y nada borrado.
- **Solo tras el 204:** se cierra la cola, se olvidan la sesión y la caché (incluidas las mutaciones con la contraseña) y se borran las claves locales del usuario. Las de otros usuarios del navegador se conservan.

## Test-first

| Etapa | Rojo → verde |
|---|---|
| 1. Preferencias | 6 rojos → verdes. Una espera de 3 s en la prueba de edición en lb, que en paralelo superaba 1 s |
| 2. Exportación | 4 rojos → verdes |
| 3. Recuperación | 9 rojos → verdes. Hizo falta recompilar el `dist` local del dominio, en `.gitignore`, que no tenía los esquemas de T046 |
| 4. Eliminación | 5 rojos → verdes. Se renombró la «X» del diálogo a «Cerrar» para no duplicar «Cancelar» (modo estricto del E2E) |
| Hallazgo del E2E de T044 | `/recuperar` redirigía a Entrenar con la sesión iniciada. 1 rojo → verde |
| Final | **244/244 verdes** en el frontend, estables en 2 ejecuciones |

## Navegador real (build de producción por HTTPS, API, PostgreSQL y Mailpit reales, 360 px)

| Paso | Resultado |
|---|---|
| Cuenta | Selector de 286 × 48 px |
| kg → lb y recargar | Se mantiene lb. Historial muestra «132,28 lb × 8», Progreso «Peso máximo (lb)»; en BD `peso_kg` sigue en 60 |
| Exportar JSON y CSV | Descargas `gymtrack-2026-11-17.json` y `.csv` con los datos propios y sin hashes ni tokens |
| Recuperar con email registrado y con uno desconocido | El mismo mensaje. Mailpit: 1 correo para el registrado, 0 para el desconocido |
| Restablecer con el enlace del correo | URL sin token. «Contraseña cambiada…». La sesión anterior queda en 401 |
| Reusar el enlace | «El enlace no es válido, ya se usó o ha caducado. Solicita uno nuevo.» |
| Eliminar con la contraseña incorrecta | Error en el campo; usuario y datos locales intactos |
| Eliminar con la contraseña correcta | «Iniciar sesión». En BD: 0 usuarios y 0 entrenamientos. `localStorage` vacío. `/auth/yo` en 401 |
| axe WCAG 2.1 A/AA (Cuenta, recuperar, restablecer, enlace usado y diálogo) | **0 violaciones**; sin desplazamiento horizontal |

Las cuentas `t049.*@example.invalid` se borraron de la base de desarrollo.

## Seguridad

- **Sin `console`.** Ni contraseñas, ni tokens, ni el email de recuperación en `localStorage` o `sessionStorage`.
- **Token de recuperación:** solo en memoria y fuera de la URL.
- **Caché de mutaciones:** se vacía al eliminar la cuenta y al restablecer la contraseña.
- **Eliminación:** el `401` de `DELETE /cuenta` se trata como contraseña incorrecta (`META_ACCESO`), no como sesión caducada.

## Verificaciones

| Verificación | Resultado |
|---|---|
| Frontend | 244/244 |
| Dominio | 66/66 |
| `npm run typecheck` | Salida 0 |
| `npm run lint` | Salida 0 |
| Build | Correcto |
| `git diff --check` | Correcto |

## E2E (Chrome, base de pruebas, Mailpit; puerto 5173 comprobado libre)

| Suite | Resultado |
|---|---|
| `cuenta.spec` (T044, I4) | **6/6**: kg → lb → kg con las series intactas; JSON y CSV completos, propios y sin secretos; cancelar y confirmar la eliminación (sin afectar a la otra cuenta); recuperación indistinguible y enlace de un solo uso; enlace caducado; etiquetas, foco, tamaño táctil y axe |
| `historial.spec` y `auth.spec` (regresión por los cambios en Historial y en el login) | **8/8** |

**Hallazgo corregido.** La primera ejecución de `cuenta.spec` dio 5/6. La prueba de accesibilidad abre `/recuperar` con la sesión iniciada, y `RutaPublica` la redirigía a Entrenar. Ahora `/recuperar`, como `/restablecer`, funciona con o sin sesión. Hay una prueba de regresión en `recuperacion.test.tsx`. Era un error de T049; la prueba del Integrante 4 no se modificó.

«Un servidor E2E terminó inesperadamente» aparece al cerrar los servidores E2E (script de otro integrante) y no afecta a los resultados. Mailpit se inició solo para esta verificación y se detuvo al terminar.
