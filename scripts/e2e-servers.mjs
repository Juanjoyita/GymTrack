import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const tlsDirectory = process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
const caPath = resolve(root, process.env.TLS_CA_PATH || resolve(tlsDirectory, 'ca.pem'));
if (!existsSync(caPath)) throw new Error('Falta la CA local. Ejecuta npm run tls:local.');

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const children = [];

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: isWindows && command === npm,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló: ${command} ${args.join(' ')}`);
}

function start(args, cwd = root, env = process.env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  child.on('error', (error) => console.error(`No se pudo iniciar el servidor E2E: ${error.message}`));
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function status(url) {
  return new Promise((resolveStatus, reject) => {
    const request = https.get(url, { ca: readFileSync(caPath) }, (response) => {
      response.resume();
      resolveStatus(response.statusCode ?? 0);
    });
    request.setTimeout(3000, () => request.destroy(new Error('Tiempo de espera agotado.')));
    request.on('error', reject);
  });
}

async function waitFor(url, expected, servers) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    if (servers.some((child) => child.exitCode !== null)) throw new Error(`Un servidor E2E terminó antes de estar listo: ${url}`);
    try {
      const actual = await status(url);
      if (expected(actual)) return;
      lastError = new Error(`HTTP ${actual}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Servidor E2E no disponible en ${url}: ${lastError?.message ?? 'sin respuesta'}`);
}

async function main() {
  const buildEnv = { ...process.env, NODE_ENV: 'production' };
  run(npm, ['run', 'build', '--workspace', '@gymtrack/frontend'], buildEnv);
  run(npm, ['run', 'build', '--workspace', '@gymtrack/backend'], buildEnv);

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    GYMTRACK_E2E: '1',
    NODE_EXTRA_CA_CERTS: caPath,
    JWT_SECRET: randomBytes(32).toString('base64url'),
  };
  const backend = start([resolve(root, 'backend/dist/main.js')], root, env);
  const preview = start([
    resolve(root, 'node_modules/vite/bin/vite.js'),
    'preview', '--host', 'localhost', '--port', '5173', '--strictPort',
  ], resolve(root, 'frontend'), env);
  try {
    await waitFor('https://localhost:3000/api', (code) => code === 404, [backend, preview]);
    await waitFor('https://localhost:5173', (code) => code === 200, [backend, preview]);
    await new Promise((resolveExit) => {
      const onExit = (code) => { stop(); resolveExit(code); };
      backend.once('exit', onExit);
      preview.once('exit', onExit);
    });
    throw new Error('Un servidor E2E terminó inesperadamente.');
  } finally {
    stop();
  }
}

process.on('SIGINT', () => { stop(); process.exitCode = 130; });
process.on('SIGTERM', () => { stop(); process.exitCode = 143; });
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  stop();
  process.exitCode = 1;
});
