import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash, argon2id, verify } from 'argon2';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { get as getHttps } from 'node:https';
import { get as getHttp } from 'node:http';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { inspect } from 'node:util';
import { parse } from 'dotenv';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';
import { sembrarCuenta, sha256, type CuentaFixture } from '../utils/cuenta-fixtures';
import { esperarCorreo, listarCorreos, eliminarCorreo, leerPanel } from '../utils/correo';

jest.setTimeout(60000);
const root = resolve(__dirname, '../../..');
const evidencia = resolve(root, 'test-results/t060');
const ca = readFileSync(resolve(root, process.env.TLS_CA_PATH || resolve(process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls'), 'ca.pem')));
const valoresSecretos = new Set<string>();
const emails = new Set<string>();
const envLocal = existsSync(resolve(root, '.env')) ? parse(readFileSync(resolve(root, '.env'))) : {};
for (const [clave, valor] of Object.entries({ ...envLocal, ...process.env })) {
  if (/PASSWORD|SECRET|TOKEN|API_KEY/i.test(clave) && valor && valor.length >= 8) valoresSecretos.add(valor);
}
const credenciales = [0, 1].map(() => randomBytes(24).toString('base64url'));
credenciales.forEach((p) => valoresSecretos.add(p));
let hashes: string[];
type Cuenta = CuentaFixture & { activa: string; realizadoActivo: string; serieActiva: string; password: string };
type Agent = ReturnType<typeof peticionHttps>;
type Metodo = 'get' | 'post' | 'patch' | 'delete';
interface Operacion { nombre: string; metodo: Metodo; ruta: (propio: Cuenta, ajeno: Cuenta) => string; cuerpo?: (propio: Cuenta, ajeno: Cuenta) => object }
const base = (c: Cuenta) => `/api/entrenamientos/${c.ids.entrenamiento}`;
const realizado = (c: Cuenta) => `${base(c)}/ejercicios/${c.ids.realizado}`;
const serie = (c: Cuenta) => `${realizado(c)}/series/${c.ids.serie}`;
const nuevaSerie = () => ({ id: randomUUID(), orden: 3, repeticiones: 8, pesoEntrada: { valor: 60, unidad: 'kg' }, registradaEn: new Date().toISOString() });

// Cada fila se ejecuta en ambos sentidos con datos existentes, incluidos padres/UUID mezclados.
const matriz: Operacion[] = [
  { nombre: 'P1/P2 GET entrenamiento ajeno', metodo: 'get', ruta: (_, b) => base(b) },
  { nombre: 'P1/P2 PATCH entrenamiento ajeno con versión vieja', metodo: 'patch', ruta: (_, b) => base(b), cuerpo: () => ({ nota: 'T060-rechazada', version: 999 }) },
  { nombre: 'P1/P2 DELETE entrenamiento ajeno', metodo: 'delete', ruta: (_, b) => `${base(b)}?version=1` },
  { nombre: 'P1 finalizar activa ajena', metodo: 'post', ruta: (_, b) => `/api/entrenamientos/${b.activa}/finalizar`, cuerpo: () => ({ version: 1 }) },
  { nombre: 'P1 reutilizar UUID de entrenamiento ajeno', metodo: 'post', ruta: () => '/api/entrenamientos', cuerpo: (_, b) => ({ id: b.ids.entrenamiento, inicio: '2026-11-10T18:00:00Z', fin: '2026-11-10T19:00:00Z', zonaHoraria: 'America/Bogota' }) },
  { nombre: 'P1 PATCH ejercicio privado ajeno', metodo: 'patch', ruta: (_, b) => `/api/ejercicios/${b.ids.ejercicio}`, cuerpo: () => ({ nombre: 'Rechazado T060', grupoMuscular: 'pecho' }) },
  { nombre: 'P1 DELETE ejercicio privado ajeno', metodo: 'delete', ruta: (_, b) => `/api/ejercicios/${b.ids.ejercicio}` },
  { nombre: 'P1 prellenado de ejercicio ajeno', metodo: 'get', ruta: (_, b) => `/api/ejercicios/${b.ids.ejercicio}/ultima-sesion` },
  { nombre: 'P1 crear ejercicio realizado en padre ajeno', metodo: 'post', ruta: (_, b) => `${base(b)}/ejercicios`, cuerpo: (a) => ({ id: randomUUID(), ejercicioId: a.ids.ejercicio, posicion: 2 }) },
  { nombre: 'P1 referenciar ejercicio privado ajeno en padre propio', metodo: 'post', ruta: (a) => `${base(a)}/ejercicios`, cuerpo: (_, b) => ({ id: randomUUID(), ejercicioId: b.ids.ejercicio, posicion: 2 }) },
  { nombre: 'P1 reutilizar UUID de ejercicio realizado ajeno', metodo: 'post', ruta: (a) => `${base(a)}/ejercicios`, cuerpo: (a, b) => ({ id: b.ids.realizado, ejercicioId: a.ids.ejercicio, posicion: 2 }) },
  { nombre: 'P1 PATCH ejercicio realizado ajeno', metodo: 'patch', ruta: (_, b) => realizado(b), cuerpo: () => ({ nota: 'Rechazada', version: 999 }) },
  { nombre: 'P1 DELETE ejercicio realizado ajeno', metodo: 'delete', ruta: (_, b) => `${realizado(b)}?version=1` },
  { nombre: 'P1 PATCH hijo ajeno bajo entrenamiento propio', metodo: 'patch', ruta: (a, b) => `${base(a)}/ejercicios/${b.ids.realizado}`, cuerpo: () => ({ nota: 'Rechazada', version: 1 }) },
  { nombre: 'P1 DELETE hijo ajeno bajo entrenamiento propio', metodo: 'delete', ruta: (a, b) => `${base(a)}/ejercicios/${b.ids.realizado}?version=1` },
  { nombre: 'P1 POST serie en padre ajeno', metodo: 'post', ruta: (_, b) => `${realizado(b)}/series`, cuerpo: nuevaSerie },
  { nombre: 'P1 POST serie bajo padres mezclados', metodo: 'post', ruta: (a, b) => `${base(a)}/ejercicios/${b.ids.realizado}/series`, cuerpo: nuevaSerie },
  { nombre: 'P1 reutilizar UUID de serie ajena', metodo: 'post', ruta: (a) => `${realizado(a)}/series`, cuerpo: (_, b) => ({ ...nuevaSerie(), id: b.ids.serie }) },
  { nombre: 'P1 PATCH serie ajena', metodo: 'patch', ruta: (_, b) => serie(b), cuerpo: () => ({ repeticiones: 10, version: 999 }) },
  { nombre: 'P1 DELETE serie ajena', metodo: 'delete', ruta: (_, b) => `${serie(b)}?version=1` },
  { nombre: 'P1 PATCH serie ajena bajo padres propios', metodo: 'patch', ruta: (a, b) => `${realizado(a)}/series/${b.ids.serie}`, cuerpo: () => ({ repeticiones: 10, version: 1 }) },
  { nombre: 'P1 DELETE serie ajena bajo padres propios', metodo: 'delete', ruta: (a, b) => `${realizado(a)}/series/${b.ids.serie}?version=1` },
  { nombre: 'P3 progreso de ejercicio privado ajeno', metodo: 'get', ruta: (_, b) => `/api/progreso/${b.ids.ejercicio}?periodo=todo` },
  { nombre: 'P3 récords de ejercicio privado ajeno', metodo: 'get', ruta: (_, b) => `/api/progreso/${b.ids.ejercicio}/records` },
  { nombre: 'P5 GET rutina ajena', metodo: 'get', ruta: (_, b) => `/api/rutinas/${b.ids.rutina}` },
  { nombre: 'P5 PATCH rutina ajena', metodo: 'patch', ruta: (_, b) => `/api/rutinas/${b.ids.rutina}`, cuerpo: () => ({ nombre: 'Rechazada', version: 999 }) },
  { nombre: 'P5 DELETE rutina ajena', metodo: 'delete', ruta: (_, b) => `/api/rutinas/${b.ids.rutina}?version=1` },
  { nombre: 'P5 crear rutina con ejercicio ajeno', metodo: 'post', ruta: () => '/api/rutinas', cuerpo: (_, b) => ({ nombre: 'Rechazada', diaSemana: 1, ejercicioIds: [b.ids.ejercicio] }) },
  { nombre: 'P5 actualizar rutina propia con ejercicio ajeno', metodo: 'patch', ruta: (a) => `/api/rutinas/${a.ids.rutina}`, cuerpo: (_, b) => ({ ejercicioIds: [b.ids.ejercicio], version: 1 }) },
  { nombre: 'P5 iniciar desde rutina ajena', metodo: 'post', ruta: () => '/api/entrenamientos', cuerpo: (_, b) => ({ id: randomUUID(), zonaHoraria: 'America/Bogota', rutinaId: b.ids.rutina }) },
];
const protegidas: Operacion[] = [...matriz,
  { nombre: 'P1 sesión actual', metodo: 'get', ruta: () => '/api/auth/yo' },
  { nombre: 'P1 logout', metodo: 'post', ruta: () => '/api/auth/logout' },
  { nombre: 'P1 catálogo', metodo: 'get', ruta: () => '/api/ejercicios' },
  { nombre: 'P1 crear ejercicio', metodo: 'post', ruta: () => '/api/ejercicios', cuerpo: () => ({ nombre: 'T060 sin sesión', grupoMuscular: 'pecho' }) },
  { nombre: 'P1 activa', metodo: 'get', ruta: () => '/api/entrenamientos/en-curso' },
  { nombre: 'P2 listado', metodo: 'get', ruta: () => '/api/entrenamientos' },
  { nombre: 'P5 listado', metodo: 'get', ruta: () => '/api/rutinas' },
  { nombre: 'P4 preferencias', metodo: 'patch', ruta: () => '/api/cuenta/preferencias', cuerpo: () => ({ unidadPeso: 'lb' }) },
  { nombre: 'P4 JSON', metodo: 'get', ruta: () => '/api/exportacion?formato=json' },
  { nombre: 'P4 CSV', metodo: 'get', ruta: () => '/api/exportacion?formato=csv' },
  { nombre: 'P4 eliminar', metodo: 'delete', ruta: () => '/api/cuenta', cuerpo: (a) => ({ contrasena: a.password }) },
];

function errorSeguro(error: unknown): Error {
  let texto = error instanceof Error ? error.message : String(error);
  for (const s of [...valoresSecretos, ...emails].sort((a, b) => b.length - a.length)) texto = texto.split(s).join('[REDACTADO]');
  texto = texto.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT]')
    .replace(/\$argon2id\$[^\s"'<>]+/g, '[HASH]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[CORREO]');
  return new Error(texto);
}
async function seguro<T>(accion: () => Promise<T>): Promise<T> { try { return await accion(); } catch (e) { throw errorSeguro(e); } }
function recordarCookie(raw: string | string[] | undefined) {
  const cookies = typeof raw === 'string' ? [raw] : raw ?? [];
  for (const cookie of cookies) {
    const valor = cookie.match(/^gt_sesion=([^;]+)/)?.[1];
    if (valor) valoresSecretos.add(valor);
  }
  return cookies;
}
function solicitar(agent: Agent, op: Operacion, a: Cuenta, b: Cuenta) {
  const req = agent[op.metodo](op.ruta(a, b));
  return op.cuerpo ? req.send(op.cuerpo(a, b)) : req;
}
async function web(url: string, confiable = true): Promise<{ status: number; body: string }> {
  return new Promise((done, reject) => {
    const req = getHttps(url, { ca: confiable ? ca : [], rejectUnauthorized: true }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (c: string) => { body += c; });
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('HTTPS no respondió a tiempo.')));
    req.on('error', reject);
  });
}
async function rechazaHttp(url: string) {
  const status = await new Promise<number>((done) => {
    const req = getHttp(url, (res) => { res.resume(); done(res.statusCode ?? 0); });
    req.setTimeout(3000, () => req.destroy()); req.on('error', () => done(0));
  });
  expect(status === 0 || status === 400).toBe(true);
}

// Escáner de valores reales y patrones de alta confianza; nunca emite coincidencias en claro.
function revisarTexto(texto: string): string[] {
  const tipos: string[] = [];
  if ([...valoresSecretos].some((s) => texto.includes(s))) tipos.push('valor secreto conocido');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(texto)) tipos.push('clave privada');
  if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(texto)) tipos.push('identificador AWS');
  if (/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/.test(texto)) tipos.push('token GitHub');
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/.test(texto)) tipos.push('JWT literal');
  // Excepción revisada: aviso público del proveedor glob, solo estos campos y huellas.
  // Los secretos/patrones anteriores siempre se comprueban sobre el texto original.
  let textoCorreos = texto;
  try {
    const lock = JSON.parse(texto);
    for (const path of ['node_modules/glob', 'node_modules/typeorm/node_modules/glob']) {
      const entrada = lock.packages?.[path];
      if (typeof entrada?.deprecated === 'string' && [
        '55485ce46ec1f7d3378548cbc9d651e489f775e5b19ce47544e7c1de8782b504',
        'd81cf0371c03b2377fa98e6637e518eda198e83fb8eeaae8c9757f35b99a4a2c',
      ].includes(sha256(entrada.deprecated))) entrada.deprecated = '[aviso público glob revisado]';
    }
    textoCorreos = JSON.stringify(lock);
  } catch { /* No es JSON: inspeccionar todo el texto. */ }
  const correos = textoCorreos.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  if (correos.some((email) => !/@(?:example\.(?:invalid|com|org)|ejemplo\.com)$/i.test(email) && !/^git@(?:github|gitlab)\.com$/i.test(email))) tipos.push('correo fuera de dominios sintéticos');
  return tipos;
}
function git(args: string[], input?: string): Buffer {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('No se pudo inspeccionar Git; no se declara limpio.');
  return r.stdout;
}

// No se añade un endpoint de pruebas ni se sustituye el guard/servicios de aplicación.
describe('T060: seguridad integrada y propiedad P1–P5', () => {
  let app: INestApplication | undefined, source: DataSource;
  let cuentas: Cuenta[] = [];
  let esquema = false;
  let spies: jest.SpyInstance[] = [];
  let preview: ChildProcess | undefined;
  let salidaPreview = '';
  let casosLogs = 0, entradasLogs = 0;
  const anteriorModo = process.env.NODE_ENV, anteriorFrontend = process.env.FRONTEND_URL;
  const cliente = () => { if (!app) throw new Error('App no inicializada.'); return peticionHttps(app); };
  async function iniciar(modo = 'test') {
    if (app) return;
    process.env.NODE_ENV = modo;
    process.env.FRONTEND_URL = 'https://localhost:5173';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app); await app.init();
  }
  async function login(i: number) {
    await iniciar();
    const agent = cliente();
    const r = await agent.post('/api/auth/login').send({ email: cuentas[i].email, contrasena: cuentas[i].password }).expect(200);
    recordarCookie(r.headers['set-cookie']);
    return agent;
  }
  async function snapshot() {
    const datos: Record<string, object[]> = {};
    for (const tabla of ['usuario', 'ejercicio', 'rutina', 'rutina_ejercicio', 'entrenamiento', 'ejercicio_realizado', 'serie', 'token_recuperacion']) {
      datos[tabla] = await source.query(`SELECT * FROM ${tabla} ORDER BY 1,2`);
    }
    return JSON.stringify(datos);
  }
  async function pararPreview() {
    const child = preview; preview = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((done) => { child.once('exit', () => done()); child.kill('SIGTERM'); });
    }
  }
  async function iniciarPreview(modo = 'production') {
    if (!existsSync(resolve(root, 'frontend/dist/index.html'))) throw new Error('Compila el frontend antes de T060.');
    const args = [resolve(root, 'node_modules/vite/bin/vite.js'), ...(modo === 'development' ? [] : ['preview']), '--host', 'localhost', '--port', '5173', '--strictPort', '--mode', modo];
    preview = spawn(process.execPath, args, { cwd: resolve(root, 'frontend'), env: { ...process.env, NODE_ENV: modo }, stdio: ['ignore', 'pipe', 'pipe'] });
    preview.stdout?.on('data', (c: Buffer) => { salidaPreview += c.toString(); });
    preview.stderr?.on('data', (c: Buffer) => { salidaPreview += c.toString(); });
    const limite = Date.now() + 15000;
    while (Date.now() < limite) {
      if (preview.exitCode !== null) throw new Error('El servidor frontend terminó antes de estar disponible.');
      try { if ((await web('https://localhost:5173/login')).status === 200) return; } catch { /* Arranque pendiente. */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('El frontend HTTPS no quedó disponible.');
  }

  beforeAll(async () => { mkdirSync(evidencia, { recursive: true }); hashes = await Promise.all(credenciales.map((p) => hash(p, { type: argon2id }))); });
  beforeEach(async () => seguro(async () => {
    spies = (['info', 'warn', 'error', 'debug', 'log'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
    process.env.NODE_ENV = 'test'; salidaPreview = ''; cuentas = [];
    source = await fuenteDatosIntegracion().initialize();
    await prepararEsquemaIntegracion(source); esquema = true; await source.runMigrations();
    for (let i = 0; i < 2; i++) {
      const c = await sembrarCuenta(source);
      const cuenta: Cuenta = { ...c, hashContrasena: hashes[i], password: credenciales[i], activa: randomUUID(), realizadoActivo: randomUUID(), serieActiva: randomUUID() };
      cuentas.push(cuenta); emails.add(cuenta.email);
      [cuenta.token, sha256(cuenta.token), cuenta.hashContrasena].forEach((s) => valoresSecretos.add(s));
      await source.query('UPDATE usuario SET hash_contrasena=$1 WHERE id=$2', [hashes[i], c.ids.usuario]);
      await source.query(`INSERT INTO entrenamiento (id,usuario_id,inicio,zona_horaria,ultima_actividad_en) VALUES ($1,$2,now()-interval '5 minutes','America/Bogota',now())`, [cuenta.activa, c.ids.usuario]);
      await source.query('INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion) VALUES ($1,$2,$3,1)', [cuenta.realizadoActivo, cuenta.activa, c.ids.ejercicio]);
      await source.query(`INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en) VALUES ($1,$2,1,8,60,now())`, [cuenta.serieActiva, cuenta.realizadoActivo]);
    }
    const [db] = await source.query('SELECT current_database() AS nombre'); expect(db.nombre).toBe('gymtrack_test');
  }));
  afterEach(async () => {
    try {
      await pararPreview();
      const salida = spies.flatMap((s) => s.mock.calls).map((args: unknown[]) => args.map((a: unknown) => typeof a === 'string' ? a : inspect(a)).join(' ')).join('\n') + salidaPreview;
      const datosPersonales = cuentas.flatMap((c) => [c.email, ...Object.values(c.ids), c.activa, c.realizadoActivo, c.serieActiva]);
      expect([...valoresSecretos, ...datosPersonales].some((s) => salida.includes(s))).toBe(false);
      for (const [entry] of spies[0]?.mock.calls ?? []) {
        const meta = JSON.parse(String(entry));
        expect(Object.keys(meta).sort()).toEqual(['duracionMs', 'estado', 'metodo', 'ruta']);
        expect(typeof meta.ruta === 'string' && !/[?@]/.test(meta.ruta)).toBe(true);
        expect(['GET', 'POST', 'PATCH', 'DELETE'].includes(meta.metodo)).toBe(true);
        expect(Number.isFinite(meta.duracionMs) && meta.duracionMs >= 0).toBe(true);
        expect(Number.isInteger(meta.estado) && meta.estado >= 100 && meta.estado <= 599).toBe(true);
      }
      casosLogs++; entradasLogs += spies.flatMap((s) => s.mock.calls).length;
      process.env.NODE_ENV = 'test';
      for (const c of cuentas) for (const correo of await listarCorreos(c.email)) await eliminarCorreo(correo.ID);
    } finally {
      process.env.NODE_ENV = 'test';
      if (esquema && source?.isInitialized) await limpiarEsquemaIntegracion(source);
      esquema = false;
      await app?.close(); app = undefined;
      if (source?.isInitialized) await source.destroy();
      spies.forEach((s) => s.mockRestore()); spies = [];
      if (anteriorModo === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = anteriorModo;
      if (anteriorFrontend === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = anteriorFrontend;
    }
  });

  afterAll(() => {
    writeFileSync(resolve(evidencia, 'logs.json'), JSON.stringify({ casosComprobados: casosLogs, entradasComprobadas: entradasLogs,
      canales: ['info', 'warn', 'error', 'debug', 'log', 'stdout/stderr frontend'],
      contieneSecretosODatosPersonales: false, metadatosPermitidos: ['duracionMs', 'estado', 'metodo', 'ruta estática'] }, null, 2));
  });

  it.each(matriz)('$nombre: A↔B da 404 y conserva todas las filas', async (op) => seguro(async () => {
    const antes = await snapshot();
    for (const i of [0, 1]) {
      const r = await solicitar(await login(i), op, cuentas[i], cuentas[1 - i]).expect(404);
      expect(r.body.codigo).toBe('NO_ENCONTRADO'); expect(r.body.actual).toBeNull();
      expect(await snapshot() === antes).toBe(true);
    }
  }));
  it.each(protegidas)('sin cookie: $nombre responde 401', async (op) => seguro(async () => {
    await iniciar(); const antes = await snapshot();
    await solicitar(cliente(), op, cuentas[0], cuentas[1]).expect(401);
    expect(await snapshot() === antes).toBe(true);
  }));

  it('lecturas propias P1–P5 y filtros no exponen identificadores ajenos', async () => seguro(async () => {
    for (const i of [0, 1]) {
      const a = cuentas[i], b = cuentas[1 - i], agent = await login(i);
      const yo = await agent.get(`/api/auth/yo?usuarioId=${b.ids.usuario}`).set('X-Usuario-Id', b.ids.usuario).expect(200);
      expect(yo.body.id).toBe(a.ids.usuario);
      for (const path of ['/api/ejercicios', '/api/entrenamientos', '/api/entrenamientos/en-curso', '/api/rutinas', base(a), `/api/rutinas/${a.ids.rutina}`, `/api/ejercicios/${a.ids.ejercicio}/ultima-sesion`, `/api/progreso/${a.ids.ejercicio}`, `/api/progreso/${a.ids.ejercicio}/records`]) {
        const r = await agent.get(path).expect(200);
        const texto = JSON.stringify(r.body);
        expect([b.email, ...Object.values(b.ids), b.activa].some((s) => texto.includes(s))).toBe(false);
      }
      const filtro = await agent.get(`/api/entrenamientos?ejercicioId=${b.ids.ejercicio}`).expect(200);
      expect(filtro.body.elementos).toEqual([]);
      for (const formato of ['json', 'csv']) {
        const r = await agent.get(`/api/exportacion?formato=${formato}&usuarioId=${b.ids.usuario}`).expect(200);
        const texto = formato === 'json' ? JSON.stringify(r.body) : r.text;
        expect([b.email, ...Object.values(b.ids), ...valoresSecretos].some((s) => texto.includes(s))).toBe(false);
        expect(r.headers['cache-control']).toBe('no-store');
      }
    }
  }));

  it('P2/P3 catálogo compartido: historial, prellenado, progreso y récords contienen solo sesiones propias', async () => seguro(async () => {
    const [global] = await source.query('SELECT id FROM ejercicio WHERE usuario_id IS NULL ORDER BY id LIMIT 1');
    for (const i of [0, 1]) {
      await source.query('UPDATE ejercicio_realizado SET ejercicio_id=$1 WHERE id=$2', [global.id, cuentas[i].ids.realizado]);
      await source.query('UPDATE serie SET peso_kg=$1 WHERE id=$2', [i === 0 ? 20 : 150, cuentas[i].ids.serie]);
    }
    for (const i of [0, 1]) {
      const agent = await login(i), peso = i === 0 ? 20 : 150;
      const progreso = await agent.get(`/api/progreso/${global.id}?periodo=todo`).expect(200);
      expect(progreso.body.sesiones.length).toBe(1);
      expect(progreso.body.sesiones[0].entrenamientoId).toBe(cuentas[i].ids.entrenamiento);
      expect(progreso.body.sesiones[0].pesoMaxKg).toBe(peso);
      expect(progreso.body.sesiones[0].volumenKg).toBe(peso * 8);
      const records = await agent.get(`/api/progreso/${global.id}/records?excluirEntrenamientoId=${cuentas[1 - i].ids.entrenamiento}`).expect(200);
      expect(records.body.pesoMax.valorKg).toBe(peso);
      expect(records.body.pesoMax.entrenamientoId).toBe(cuentas[i].ids.entrenamiento);
      for (const ruta of [`/api/ejercicios/${global.id}/ultima-sesion`, `/api/entrenamientos?ejercicioId=${global.id}`]) {
        const r = await agent.get(ruta).expect(200), texto = JSON.stringify(r.body);
        expect(texto.includes(cuentas[i].ids.entrenamiento)).toBe(true);
        expect(texto.includes(cuentas[1 - i].ids.entrenamiento)).toBe(false);
      }
    }
  }));

  it('operaciones propias de escritura P1–P5 funcionan sin modificar a la otra cuenta', async () => seguro(async () => {
    for (const i of [0, 1]) {
      const a = cuentas[i], b = cuentas[1 - i], agent = await login(i);
      const exportadoAntes = await (await login(1 - i)).get('/api/exportacion?formato=json').expect(200);
      const nota = await agent.patch(base(a)).send({ nota: 'T060-propia', version: 1 }).expect(200);
      await agent.patch(realizado(a)).send({ nota: 'T060-ejercicio', version: 1 }).expect(200);
      const er = await agent.post(`${base(a)}/ejercicios`).send({ id: randomUUID(), ejercicioId: a.ids.ejercicio, posicion: 2 }).expect(201);
      const s = await agent.post(`${base(a)}/ejercicios/${er.body.id}/series`).send(nuevaSerie()).expect(201);
      const editada = await agent.patch(`${base(a)}/ejercicios/${er.body.id}/series/${s.body.id}`).send({ repeticiones: 9, version: s.body.version }).expect(200);
      await agent.delete(`${base(a)}/ejercicios/${er.body.id}/series/${s.body.id}?version=${editada.body.version}`).expect(204);
      await agent.delete(`${base(a)}/ejercicios/${er.body.id}?version=${er.body.version}`).expect(204);
      const ejercicio = await agent.post('/api/ejercicios').send({ nombre: `T060 ${randomUUID()}`, grupoMuscular: 'pecho', usuarioId: b.ids.usuario }).expect(201);
      const [dueno] = await source.query('SELECT usuario_id FROM ejercicio WHERE id=$1', [ejercicio.body.id]); expect(dueno.usuario_id).toBe(a.ids.usuario);
      await agent.patch(`/api/ejercicios/${ejercicio.body.id}`).send({ nombre: `T060 editado ${randomUUID()}`, grupoMuscular: 'pecho' }).expect(200);
      await agent.delete(`/api/ejercicios/${ejercicio.body.id}`).expect(204);
      const r = await agent.post('/api/rutinas').send({ nombre: 'T060 propia', diaSemana: 1, ejercicioIds: [a.ids.ejercicio] }).expect(201);
      const editadaRutina = await agent.patch(`/api/rutinas/${r.body.id}`).send({ diaSemana: 2, version: r.body.version }).expect(200);
      await agent.delete(`/api/rutinas/${r.body.id}?version=${editadaRutina.body.version}`).expect(204);
      await agent.post(`/api/entrenamientos/${a.activa}/finalizar`).send({ version: 1 }).expect(200);
      const iniciado = await agent.post('/api/entrenamientos').send({ id: randomUUID(), zonaHoraria: 'America/Bogota', rutinaId: a.ids.rutina }).expect(201);
      expect(iniciado.body.ejercicios[0].ejercicioId).toBe(a.ids.ejercicio);
      await agent.patch('/api/cuenta/preferencias').send({ unidadPeso: 'lb' }).expect(200);
      await agent.delete(`${base(a)}?version=${nota.body.version}`).expect(204);
      const otro = await (await login(1 - i)).get('/api/exportacion?formato=json').expect(200);
      expect(JSON.stringify(otro.body) === JSON.stringify(exportadoAntes.body)).toBe(true);
    }
  }));

  it('P4 no acepta identidad ajena en preferencias ni eliminación; contraseña ajena no borra', async () => seguro(async () => {
    const antes = await snapshot();
    for (const i of [0, 1]) {
      const a = cuentas[i], b = cuentas[1 - i], agent = await login(i);
      await agent.patch('/api/cuenta/preferencias').send({ unidadPeso: 'lb', usuarioId: b.ids.usuario }).expect(400);
      await agent.delete('/api/cuenta').send({ contrasena: a.password, usuarioId: b.ids.usuario }).expect(400);
      await agent.delete('/api/cuenta').send({ contrasena: b.password }).expect(401);
      expect(await snapshot() === antes).toBe(true);
    }
  }));

  it('P4 elimina solo la cuenta autenticada y sus dependientes; conserva catálogo y la otra cuenta', async () => seguro(async () => {
    const agent = await login(0), b = await login(1);
    const antes = await b.get('/api/exportacion?formato=json').expect(200);
    const catalogo = JSON.stringify(await source.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL ORDER BY id'));
    await agent.delete('/api/cuenta').send({ contrasena: cuentas[0].password }).expect(204);
    for (const tabla of ['ejercicio', 'rutina', 'entrenamiento', 'token_recuperacion']) {
      const [fila] = await source.query(`SELECT count(*)::int AS total FROM ${tabla} WHERE usuario_id=$1`, [cuentas[0].ids.usuario]); expect(fila.total).toBe(0);
    }
    const [series] = await source.query('SELECT count(*)::int AS total FROM serie WHERE id=ANY($1::uuid[])', [[cuentas[0].ids.serie, cuentas[0].ids.serieCero, cuentas[0].serieActiva]]);
    expect(series.total).toBe(0);
    await agent.get('/api/auth/yo').expect(401); await b.get('/api/auth/yo').expect(200);
    const despues = await b.get('/api/exportacion?formato=json').expect(200);
    expect(JSON.stringify(despues.body) === JSON.stringify(antes.body)).toBe(true);
    expect(JSON.stringify(await source.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL ORDER BY id')) === catalogo).toBe(true);
  }));

  it('catálogo global compartido es visible pero inmutable', async () => seguro(async () => {
    const [global] = await source.query('SELECT id FROM ejercicio WHERE usuario_id IS NULL ORDER BY id LIMIT 1');
    const antes = await snapshot();
    for (const i of [0, 1]) {
      const agent = await login(i);
      await agent.patch(`/api/ejercicios/${global.id}`).send({ nombre: 'Rechazado', grupoMuscular: 'pecho' }).expect(404);
      await agent.delete(`/api/ejercicios/${global.id}`).expect(404);
    }
    expect(await snapshot() === antes).toBe(true);
  }));

  const invalidos: Operacion[] = [
    { nombre: 'peso >500 kg', metodo: 'post', ruta: (a) => `${realizado(a)}/series`, cuerpo: () => ({ ...nuevaSerie(), pesoEntrada: { valor: 500.01, unidad: 'kg' } }) },
    { nombre: 'peso con tres decimales', metodo: 'post', ruta: (a) => `${realizado(a)}/series`, cuerpo: () => ({ ...nuevaSerie(), pesoEntrada: { valor: 60.125, unidad: 'kg' } }) },
    { nombre: 'repeticiones fraccionarias', metodo: 'post', ruta: (a) => `${realizado(a)}/series`, cuerpo: () => ({ ...nuevaSerie(), repeticiones: 8.5 }) },
    { nombre: 'UUID no válido', metodo: 'get', ruta: () => "/api/entrenamientos/no-es-uuid" },
    { nombre: 'filtro fecha inyectado', metodo: 'get', ruta: () => '/api/entrenamientos?desde=2026-11-10%27%20OR%201=1' },
    { nombre: 'periodo no permitido', metodo: 'get', ruta: (a) => `/api/progreso/${a.ids.ejercicio}?periodo=siempre` },
    { nombre: 'preferencia no admitida', metodo: 'patch', ruta: () => '/api/cuenta/preferencias', cuerpo: () => ({ unidadPeso: 'oz' }) },
    { nombre: 'zona IANA inexistente', metodo: 'patch', ruta: () => '/api/cuenta/preferencias', cuerpo: () => ({ zonaHoraria: 'No/Existe' }) },
    { nombre: 'exportación no admitida', metodo: 'get', ruta: () => '/api/exportacion?formato=xml' },
    { nombre: 'rutina sin ejercicios', metodo: 'post', ruta: () => '/api/rutinas', cuerpo: () => ({ nombre: 'Inválida', diaSemana: 1, ejercicioIds: [] }) },
    { nombre: 'día de rutina inválido', metodo: 'post', ruta: () => '/api/rutinas', cuerpo: (a) => ({ nombre: 'Inválida', diaSemana: 8, ejercicioIds: [a.ids.ejercicio] }) },
    { nombre: 'nota excesiva', metodo: 'patch', ruta: (a) => base(a), cuerpo: () => ({ nota: 'x'.repeat(1001), version: 1 }) },
  ];
  it.each(invalidos)('valida en servidor: $nombre, sin mutaciones', async (op) => seguro(async () => {
    const agent = await login(0), antes = await snapshot();
    const r = await solicitar(agent, op, cuentas[0], cuentas[1]).expect(400);
    expect(r.body.codigo).toBe('VALIDACION'); expect(await snapshot() === antes).toBe(true);
  }));

  it('cookie manipulada, bearer sin cookie y JSON malformado no eluden autenticación/validación', async () => seguro(async () => {
    await iniciar(); const antes = await snapshot();
    await cliente().get('/api/auth/yo').set('Cookie', 'gt_sesion=no-es-jwt').expect(401);
    await cliente().get('/api/auth/yo').set('Authorization', 'Bearer token-canario-T060').expect(401);
    await cliente().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
    await cliente().post('/api/auth/login').type('form').send({ email: cuentas[0].email, contrasena: cuentas[0].password }).expect(400);
    expect(await snapshot() === antes).toBe(true);
  }));

  it.each(['login', 'registro', 'recuperar'])('limita %s a diez intentos por minuto', async (ruta) => seguro(async () => {
    await iniciar();
    for (let i = 0; i < 10; i++) await cliente().post(`/api/auth/${ruta}`).send({}).expect(400);
    const r = await cliente().post(`/api/auth/${ruta}`).send({}).expect(429);
    expect(r.body.codigo).toBe('DEMASIADAS_PETICIONES');
  }));

  it.each(['development', 'test', 'production'])('HTTPS y cookie segura de API en NODE_ENV=%s', async (modo) => seguro(async () => {
    await iniciar(modo);
    const agent = await login(0);
    const r = await agent.post('/api/auth/login').send({ email: cuentas[0].email, contrasena: cuentas[0].password }).expect(200);
    const cookies = recordarCookie(r.headers['set-cookie']);
    expect(cookies.some((c) => /^gt_sesion=/.test(c) && /; Secure/i.test(c) && /; HttpOnly/i.test(c) && /; SameSite=Strict/i.test(c))).toBe(true);
    await app!.listen(0, 'localhost');
    const direccion = app!.getHttpServer().address();
    if (!direccion || typeof direccion === 'string') throw new Error('No hay puerto de escucha.');
    const url = `https://localhost:${direccion.port}/api/auth/yo`;
    expect((await web(url)).status).toBe(401);
    let rechazada = false; try { await web(url, false); } catch { rechazada = true; } expect(rechazada).toBe(true);
    await rechazaHttp(url.replace('https:', 'http:'));
    expect(opcionesTls().minVersion).toBe('TLSv1.2');
    expect(() => opcionesTls({ ...process.env, TLS_CERT_PATH: '/t060-no-existe.pem' })).toThrow('Certificados HTTPS no disponibles');
  }));

  it('frontend development/test/production y Mailpit sirven HTTPS validado y rechazan HTTP', async () => seguro(async () => {
    for (const modo of ['development', 'test', 'production']) {
      await iniciarPreview(modo);
      expect((await web('https://localhost:5173/login')).status).toBe(200);
      await rechazaHttp('http://localhost:5173/login');
      await pararPreview();
    }
    expect(await leerPanel()).toMatch(/Mailpit/i);
    await rechazaHttp('http://localhost:8025/');
  }));

  it('navegador real: credenciales/tokens ausentes de web storage, caché e IndexedDB durante acceso, offline, cambio de usuario y recuperación', async () => seguro(async () => {
    let browser: Browser | undefined;
    const consola: string[] = [];
    let etapa = 'preparación';
    const solicitudes: { etapa: string; metodo: string; ruta: string; estado: number }[] = [];
    async function revisar(page: Page) {
      const resultado = await page.evaluate(async (secretos) => {
        const almacenamiento = { local: { ...localStorage }, sesion: { ...sessionStorage } };
        const texto = JSON.stringify(almacenamiento);
        const clavesProhibidas = (obj: unknown): boolean => {
          if (!obj || typeof obj !== 'object') return false;
          return Object.entries(obj).some(([k, v]) => /^(?:password|contrasena|contrasenaNueva|token|accessToken|refreshToken|authorization|gt_sesion)$/i.test(k) || clavesProhibidas(v));
        };
        let credenciales = false;
        for (const value of Object.values(almacenamiento.local)) { try { credenciales ||= clavesProhibidas(JSON.parse(value)); } catch { /* Texto no JSON. */ } }
        for (const value of Object.values(almacenamiento.sesion)) { try { credenciales ||= clavesProhibidas(JSON.parse(value)); } catch { /* Texto no JSON. */ } }
        const respuestas: string[] = [];
        let apiEnCache = false;
        for (const nombre of await caches.keys()) {
          const cache = await caches.open(nombre);
          for (const request of await cache.keys()) {
            apiEnCache ||= new URL(request.url).pathname.startsWith('/api');
            const response = await cache.match(request);
            respuestas.push(request.url, response ? await response.text() : '');
          }
        }
        const bases = await indexedDB.databases();
        return { vacio: Object.keys(almacenamiento.local).length === 0,
          expone: secretos.some((s) => texto.includes(s) || respuestas.some((v) => v.includes(s))),
          credenciales, jwt: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(texto),
          apiEnCache, bases: bases.length };
      }, [...valoresSecretos]);
      expect(resultado.expone || resultado.credenciales || resultado.jwt || resultado.apiEnCache).toBe(false);
      expect(resultado.bases).toBe(0);
      return resultado;
    }
    async function entrar(page: Page, i: number) {
      etapa = `login ${i === 0 ? 'A' : 'B'}`;
      await page.goto('https://localhost:5173/login');
      await page.getByLabel(/correo electrónico|email/i).fill(cuentas[i].email);
      await page.getByLabel(/^contraseña$/i).fill(cuentas[i].password);
      await revisar(page);
      const respuesta = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
      await page.getByRole('button', { name: /^iniciar sesión$/i }).click();
      expect((await respuesta).status()).toBe(200);
      await page.waitForURL((url) => url.pathname !== '/login');
      // Tras logout la ruta protegida recordada puede ser /cuenta.
      // Volver explícitamente al flujo cuyo almacenamiento se audita.
      await page.goto('https://localhost:5173/');
      await page.getByRole('heading', { name: /^entrenar$/i }).waitFor();
    }
    async function salir(page: Page) {
      await page.goto('https://localhost:5173/cuenta');
      await page.getByRole('button', { name: /^cerrar sesión$/i }).click();
      await page.getByRole('heading', { name: /^iniciar sesión$/i }).waitFor();
    }
    try {
      const antiguaA = await login(0), sesionB = await login(1);
      await app!.listen(3000, 'localhost'); await iniciarPreview();
      browser = await chromium.launch({ channel: 'chrome', timeout: 30000 });
      const context = await browser.newContext({ baseURL: 'https://localhost:5173', ignoreHTTPSErrors: false, viewport: { width: 360, height: 800 } });
      const page = await context.newPage(); page.setDefaultTimeout(7000);
      page.on('console', (m) => consola.push(m.text()));
      page.on('response', (r) => {
        const ruta = new URL(r.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
        if (ruta.startsWith('/api')) solicitudes.push({ etapa, metodo: r.request().method(), ruta, estado: r.status() });
      });
      await entrar(page, 0);
      const cookie = (await context.cookies()).find((c) => c.name === 'gt_sesion');
      expect(Boolean(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Strict')).toBe(true);
      if (cookie) valoresSecretos.add(cookie.value);
      expect(await page.evaluate(() => document.cookie.includes('gt_sesion='))).toBe(false);
      expect((await revisar(page)).vacio).toBe(false);
      await page.reload(); await page.getByRole('heading', { name: /^entrenar$/i }).waitFor(); await revisar(page);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 10000 });
      etapa = 'cola offline A';
      await context.setOffline(true);
      await page.getByLabel(/repeticiones/i).last().fill('9'); await page.getByLabel(/peso/i).last().fill('70.5');
      await page.getByRole('button', { name: /añadir serie/i }).last().click(); await revisar(page);
      const sincronizada = page.waitForResponse((r) => r.request().method() === 'POST' && /\/series$/.test(new URL(r.url()).pathname) && r.status() === 201);
      await context.setOffline(false); await sincronizada; await revisar(page);
      await salir(page); await revisar(page); await entrar(page, 1); await revisar(page); await salir(page);
      etapa = 'recuperación A';
      await page.goto('https://localhost:5173/recuperar');
      await page.getByLabel(/correo electrónico|email/i).fill(cuentas[0].email);
      await page.getByRole('button', { name: /enviar enlace/i }).click();
      const correo = await esperarCorreo(cuentas[0].email);
      const enlace = correo.Text.match(/https:\/\/[^\s<>]+\/restablecer\?token=[^\s<>]+/)?.[0];
      expect(Boolean(enlace)).toBe(true);
      const token = new URL(enlace!).searchParams.get('token')!; valoresSecretos.add(token); valoresSecretos.add(sha256(token));
      await page.goto(enlace!);
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('token'));
      await revisar(page);
      const password = randomBytes(24).toString('base64url'); valoresSecretos.add(password);
      await page.getByLabel(/^nueva contraseña$/i).fill(password); await revisar(page);
      await page.getByRole('button', { name: /guardar contraseña|restablecer contraseña/i }).click();
      await page.getByRole('heading', { name: /^iniciar sesión$/i }).waitFor(); await revisar(page);
      await antiguaA.get('/api/auth/yo').expect(401); await sesionB.get('/api/auth/yo').expect(200);
      const [usuario] = await source.query('SELECT hash_contrasena FROM usuario WHERE id=$1', [cuentas[0].ids.usuario]);
      expect(await verify(usuario.hash_contrasena, password)).toBe(true);
      expect([...valoresSecretos, ...emails].some((s) => consola.join('\n').includes(s))).toBe(false);
      writeFileSync(resolve(evidencia, 'navegador.json'), JSON.stringify({ navegador: 'Chrome', version: browser.version(), viewport: '360x800', httpsValidado: true,
        localStorageNoVacio: true, contrasenasTokensEnStorage: false, apiEnCache: false, indexedDB: 0,
        momentos: ['antes de login', 'login', 'recarga', 'cola offline', 'sincronización', 'logout', 'usuario B', 'enlace de recuperación', 'restablecer'] }, null, 2));
    } finally {
      writeFileSync(resolve(evidencia, 'navegador-diagnostico.json'), JSON.stringify({ etapa, solicitudes }, null, 2));
      await browser?.close();
    }
  }), 90000);

  it('repositorio actual e historial alcanzable sin secretos reales conocidos ni patrones de alta confianza', async () => seguro(async () => {
    const hallazgos: { archivo: string; tipos: string[] }[] = [];
    const ficheros = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean);
    for (const fichero of ficheros) {
      if (!existsSync(resolve(root, fichero))) continue;
      const buffer = readFileSync(resolve(root, fichero));
      if (buffer.includes(0)) continue;
      const tipos = revisarTexto(buffer.toString());
      if (tipos.length) hallazgos.push({ archivo: fichero, tipos });
    }
    const objetos = git(['rev-list', '--objects', '--all']).toString().trim().split('\n').map((s) => s.split(' ')[0]).filter(Boolean);
    const clases = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], objetos.join('\n') + '\n').toString().trim().split('\n');
    const blobs = clases.filter((s) => s.endsWith(' blob')).map((s) => s.split(' ')[0]);
    let revisados = 0;
    for (let i = 0; i < blobs.length; i += 32) {
      const buffer = git(['cat-file', '--batch'], blobs.slice(i, i + 32).join('\n') + '\n');
      let pos = 0;
      while (pos < buffer.length) {
        const fin = buffer.indexOf(10, pos); if (fin < 0) throw new Error('Respuesta Git incompleta.');
        const [id, tipo, length] = buffer.subarray(pos, fin).toString().split(' ');
        const size = Number(length); if (!Number.isInteger(size)) throw new Error('Tamaño de objeto Git inválido.');
        const data = buffer.subarray(fin + 1, fin + 1 + size); pos = fin + 1 + size + 1;
        if (tipo === 'blob' && !data.includes(0)) {
          revisados++; const tipos = revisarTexto(data.toString());
          if (tipos.length) hallazgos.push({ archivo: `blob:${id}`, tipos });
        }
      }
    }
    const envVersionado = spawnSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, stdio: 'pipe' }).status === 0;
    const envIgnorado = spawnSync('git', ['check-ignore', '-q', '.env'], { cwd: root, stdio: 'pipe' }).status === 0;
    writeFileSync(resolve(evidencia, 'repositorio.json'), JSON.stringify({ archivosActuales: ficheros.length, blobsTextualesHistorial: revisados,
      valoresConocidosComprobados: valoresSecretos.size, excepcionRevisada: 'Dos huellas exactas de avisos públicos glob en campos deprecated del lockfile; solo escaneo de correos', envVersionado, envIgnorado, hallazgos }, null, 2));
    expect(envVersionado).toBe(false); expect(envIgnorado).toBe(true); expect(hallazgos.length).toBe(0);
  }), 120000);
});
