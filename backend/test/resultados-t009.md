# Verificación de T009 — Validación y errores HTTP

Fecha: 2026-11-13. Alcance exclusivo: T009; sin commit.

## Prerrequisitos y alcance

T006 y T008 marcadas completas. Prerrequisitos de Spec Kit resueltos con `SPECIFY_FEATURE_DIRECTORY` absoluto. Checklist `requirements.md`: 16/16 completas, cero pendientes. Se revisaron constitución 1.1.0, plan y contrato de errores, y se siguió la skill local `speckit-implement`. No existe `.specify/extensions.yml`, por lo que no hay hooks de implementación que ejecutar.

## Archivos

- `backend/src/comun/zod-validation.pipe.ts`: pipe parametrizado con el esquema Zod compartido. Devuelve el resultado parseado (incluye transformaciones) o lanza 400 VALIDACION con mensaje por campo; rutas anidadas separadas por punto y errores de raíz en `_raiz`. Usa mensajes españoles fijos sin reflejar valores rechazados. Los futuros controladores deberán asociar explícitamente su esquema a Body/Query/Param mediante este pipe; no se anticipan rutas de historias.
- `backend/src/comun/http-exception.filter.ts`: filtro global con `{ codigo, mensaje, campos, actual }`; normaliza errores HTTP nativos, conserva los códigos de conflicto contractuales y su recurso vigente, y oculta detalles de excepciones inesperadas/500. ERROR_INTERNO es el código genérico local para 500, no especificado por el contrato; no se modifica el contrato aprobado. No registra stacks ni excepciones.
- `backend/src/comun/http-logger.ts`: middleware previo al parser; al terminar la respuesta registra exclusivamente método, plantilla de ruta, estado y duración en milisegundos. No lee body, query, params, URL completa, cabeceras ni respuestas. Peticiones sin ruta (incluido JSON malformado) usan SIN_RUTA.
- `backend/src/main.ts`: integra middleware y filtro mediante configureApi, utilizado por bootstrap y pruebas. Conserva logger de Nest desactivado y mensajes de arranque/fallo estáticos.
- `backend/package.json`: pretest/prebuild/pretypecheck/predev compilan domain antes de consumir sus exports. La primera comprobación detectó dist antiguo vacío de T005; estos hooks evitan depender de builds manuales o antiguos. Sin nuevas dependencias ni cambios al lockfile.
- `backend/test/integracion/comun.e2e-spec.ts`: nueve casos HTTP con controlador exclusivo de pruebas, sin PostgreSQL ni rutas de producto.
- `specs/001-registro-entrenamientos/tasks.md`: únicamente T009 pasa a completa; este informe contiene la evidencia.

## Evidencia rojo → verde

1. Pruebas escritas antes de implementar comportamiento, con pipe provisional sin validación. El intento dentro del sandbox falló por listen EPERM; ese fallo no cuenta como rojo funcional.
2. Ejecución autorizada con Supertest en puerto efímero: **9/9 casos rojos**. Entrada inválida devolvía 201 en vez de 400, el nombre no se transformaba, los errores seguían con formato nativo y faltaba el registro HTTP.
3. Tras implementar, se detectó que domain/dist aún era el export vacío de T005 (3 fallos HTTP y error de tipos). Se compiló domain y se añadieron hooks para automatizar ese prerrequisito.
4. Suite final backend: **25/25 pruebas verdes, 4/4 suites** (9 casos T009 y 16 existentes). Ejecución fuera del sandbox autorizada para puertos efímeros y PostgreSQL local de pruebas.

Comandos con Node 22 disponible en caché npm (el Node predeterminado del equipo sigue siendo 24):

```sh
npm run test:backend
npm run test:domain
npm run lint
npm run typecheck
npm run build --workspace backend
git diff --check
```

Resultados: dominio **19/19, 4/4 archivos**; lint sin errores/advertencias; tipos de los tres workspaces y build backend verdes; diff sin errores de espacios.

## Casos y revisión de privacidad

- 400 VALIDACION por repeticiones y peso anidado inválidos; mensajes por campo, actual null.
- Parseo compartido: trim de nombre y descarte de clave desconocida.
- Normalización 401, 404, 410, 429; no devuelve el mensaje interno de HttpException.
- 409 CONFLICTO_VERSION conserva actual y mensaje contractual.
- Ruta inexistente y JSON malformado devuelven formato uniforme y no reflejan tokens.
- Error inesperado devuelve 500 genérico sin mensaje ni stack interno.
- Logs capturados en éxito, error, URL desconocida y JSON inválido. En éxito/error se exige exactamente metodo/ruta/estado/duracionMs. Se verifica ausencia de token, email, contraseña, cookies/cabeceras y peso sintéticos; el parámetro dinámico aparece como `:status`.
- Revisión estática de console/Logger en backend/src: solo middleware de metadatos y mensajes de arranque/fallo fijos; logger de Nest desactivado en bootstrap. No se vuelcan cuerpos, respuestas ni excepciones.

No se implementan autenticación, limitación de intentos, historias ni TLS (T010A); se mantiene sin listener web de producto. La autorización/propiedad y la selección del recurso seguro en actual corresponden a los futuros servicios, no a este filtro. `.vscode/` era preexistente y no se modificó. Queda pendiente revisión del usuario antes del commit.
