# Verificación de T010A y T011

Fecha: 2026-11-13. Solo HTTPS e integración de base; sin commit.

## Contexto y alcance

T010 completa; checklist requirements 16/16, sin pendientes. Se revisaron constitución 1.1.0, plan, quickstart y skill local speckit-implement. Prerrequisitos resueltos con SPECIFY_FEATURE_DIRECTORY absoluto. No existe extensions.yml ni hooks de implementación. Se marcan únicamente T010A y T011.

AppModule revisado: permanece exclusivamente TypeORM, sin módulos de historias. Se conserva synchronize:false, migrationsRun:false y logging:false. No se añade ningún endpoint al contrato: la API sin historias responde 404 NO_ENCONTRADO. Cookies Secure se comprobarán al implementar autenticación en T023/T029; Mailpit en T043A y rendimiento en T028A.

## Archivos

| Archivo | Cambio |
|---|---|
| `scripts/tls-local.sh` | Genera certificado mkcert para localhost/127.0.0.1/::1 y confía en la CA. macOS usa llavero del usuario; Linux mkcert -install. Guarda archivos fuera del repositorio y clave con permisos 600. |
| `.env.example` | Directorio y rutas configurables de certificado, clave y CA pública. |
| `.gitignore`, `.dockerignore` | Excluyen certificados y claves aunque se creen accidentalmente dentro del árbol. |
| `backend/src/comun/tls.ts` | Lee certificado/clave, mínimo TLS 1.2 y fallo explícito si faltan. Mismas opciones desde código fuente o dist. |
| `backend/src/main.ts` | Listener HTTPS localhost:3000 y arranque con conexión PostgreSQL; sin fallback HTTP. |
| `frontend/vite.config.ts` | Vite/preview HTTPS localhost:5173, puerto estricto; proxy /api a API HTTPS con CA explícita y secure:true. Build no requiere secretos TLS. |
| `backend/test/utils/https.ts` | Supertest con CA explícita y validación TLS habilitada. |
| `backend/test/integracion/{comun,conexion}.e2e-spec.ts` | Apps de prueba HTTPS, mismas pruebas de validación/logs/conexión a PostgreSQL. |
| `e2e/playwright.config.ts` | Chrome estable, móvil 360×800, base HTTPS, ignoreHTTPSErrors:false; inicia y cierra npm run dev con NODE_ENV=test, sin reutilizar servidores. |
| `e2e/tests/infraestructura.spec.ts` | Navegación real al shell, contexto seguro, API directa y proxy con 404 contractual, rechazo de HTTP, dos usuarios deterministas y captura móvil. |
| `e2e/tsconfig.json` | Incluye arnés/configuración E2E en chequeo de tipos; corrige narrowing PostgreSQL de source.options.schema. |
| `scripts/e2e.mjs` | Lee .env con Node 22 y propaga CA pública mediante NODE_EXTRA_CA_CERTS al proceso Playwright; fuerza NODE_ENV=test. |
| `scripts/dev.mjs` | Cierre de los grupos de procesos frontend/backend para evitar descendientes huérfanos. |
| `package.json` | tls:local, npm test con todos los arneses existentes, typecheck incluyendo E2E y compilación de domain antes del build global. |
| `specs/001-registro-entrenamientos/quickstart.md` | Configuración local, trust, arneses, puertos y HTTPS del entorno de entrega. |
| `specs/001-registro-entrenamientos/tasks.md` | T010A y T011 completas. |
| `backend/test/resultados-t010a-t011.md` | Este informe. |

No se añadieron dependencias npm ni se modificó package-lock.json. `.vscode/` era preexistente y no se modificó.

## Certificados y confianza comprobados

- Se instaló mkcert 1.4.4 con Homebrew, con autorización para instalación fuera del sandbox.
- El primer mkcert -install intentó confianza global y falló porque sudo requiere terminal/contraseña administrativa. No se contó ese intento como configuración exitosa.
- El script definitivo instala confianza en el llavero login del usuario en macOS; terminó correctamente tras la autorización nativa. No necesita modificar el almacén global ni contraseñas en scripts.
- Certificado, clave de localhost y copia pública de CA: `~/.local/share/gymtrack/tls/`. La CA privada permanece en CAROOT de mkcert; no se copia al proyecto. Clave de localhost comprobada con permisos `-rw-------`.
- `git ls-files '*.pem' '*.key' '*.p12'`: ningún certificado/clave versionado. `git check-ignore` confirma exclusiones. No se imprimieron contenidos de claves.
- Chrome navegó sin excepciones de confianza. Playwright y su espera webServer usan ignoreHTTPSErrors:false; proxy secure:true; Supertest .ca(...). No se usan rejectUnauthorized:false, NODE_TLS_REJECT_UNAUTHORIZED=0 ni curl -k.
- Arranque normal de `npm run dev` comprobado y cerrado con SIGINT al terminar. `curl -I https://localhost:5173/ https://localhost:3000/api https://localhost:5173/api`, sin CA manual ni -k, terminó con código 0 usando confianza del sistema/usuario: frontend 200, API 404 y proxy 404. Los 404 son correctos porque las historias aún no tienen rutas.

## Comandos y resultados

Verificación ejecutada con Node 22 disponible en caché npm y .env local existente; no se sobrescribieron sus credenciales.

| Comando | Resultado |
|---|---|
| `npm run tls:local` | Certificado generado y CA confiable en llavero del usuario, salida 0. |
| `docker compose up -d --wait --wait-timeout 60` | PostgreSQL healthy. |
| `npm test` | Dominio 19/19, backend 25/25, frontend 29/29, E2E 1/1; salida 0. |
| `npm run test:backend` (tras migrar Supertest a HTTPS) | 25/25, cuatro suites; HTTPS y PostgreSQL de pruebas en verde. |
| `npm run test:e2e` (final, incluye rechazo HTTP) | 1/1, Chrome estable, HTTPS directo/proxy, 360×800 y fixtures de dos usuarios. |
| `npm run lint` | Verde, sin errores/advertencias. |
| `npm run typecheck` | Verde en tres workspaces y E2E. |
| `npm run build` | Verde en tres workspaces. |
| `npm run` | Scripts raíz enumerados, incluido tls:local y arneses. |
| `bash -n scripts/tls-local.sh` | Sintaxis correcta. |
| `git diff --check` | Verde. |

Los arneses con puertos, PostgreSQL y navegador se ejecutaron con permisos fuera del sandbox. E2E fuerza gymtrack_test y usa un esquema aislado t006_infraestructura_<pid>; la limpieza mantiene sus comprobaciones de base/esquema. Captura generada en `test-results/e2e/` (ignorada por Git), archivo infraestructura-360x800.png y adjunto del test. El caso confirma contexto seguro y rechaza http://localhost en ambos puertos.

El primer chequeo ampliado de tipos descubrió que DataSourceOptions no garantiza schema fuera de PostgreSQL; se añadió narrowing explícito. No hubo implementación de historias ni pruebas de aceptación nuevas de producto, por lo que estas tareas de infraestructura no adelantan el ciclo rojo/verde de US1.

## Reproducir y entrega

Con Node 22, mkcert, Docker y Chrome estable instalados, .env configurado y puertos 3000/5173 libres:

```sh
npm install
npm run tls:local
docker compose up -d --wait --wait-timeout 60
npm run db:migrate
npm run dev
# Cerrar dev antes de E2E, que arranca sus propios servidores de pruebas.
npm test
npm run lint
npm run typecheck
npm run build
```

Se documentó en quickstart la entrega con frontend/dist servido por HTTPS y /api a backend HTTPS, certificado con cadena completa y clave mediante rutas del entorno fuera de Git, sin usar CA personal mkcert en producción. No se realizó despliegue remoto.

Referencias técnicas consultadas: [mkcert oficial](https://github.com/FiloSottile/mkcert), [almacén macOS de mkcert](https://github.com/FiloSottile/mkcert/blob/master/truststore_darwin.go) y [webServer de Playwright](https://playwright.dev/docs/test-webserver).

Sin commit; pendiente revisión del usuario.
