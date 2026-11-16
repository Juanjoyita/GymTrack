import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const tlsDirectory = process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
const caPath = resolve(root, process.env.TLS_CA_PATH || resolve(tlsDirectory, 'ca.pem'));
if (!existsSync(caPath)) throw new Error('Falta la CA local. Ejecuta npm run tls:local.');

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
  process.env['ProgramFiles(x86)'] && resolve(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
  resolve(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error('No se encontró Google Chrome estable para Lighthouse.');

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const outputDirectory = resolve(root, 'test-results/perf');
mkdirSync(outputDirectory, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
    shell: isWindows && command === npm,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló: ${command} ${args.join(' ')}`);
}

function requestStatus(url) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = https.get(url, { ca: readFileSync(caPath) }, (response) => {
      response.resume();
      resolveRequest(response.statusCode ?? 0);
    });
    request.setTimeout(3000, () => request.destroy(new Error('Tiempo de espera agotado.')));
    request.on('error', rejectRequest);
  });
}

async function waitFor(url, acceptedStatus, childProcesses) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    if (childProcesses.some((child) => child.exitCode !== null)) {
      throw new Error(`Un servidor terminó antes de estar listo: ${url}`);
    }
    try {
      const status = await requestStatus(url);
      if (acceptedStatus(status)) return;
      lastError = new Error(`Respuesta HTTP ${status} en ${url}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Servidor no disponible en ${url}: ${lastError?.message ?? 'sin respuesta'}`);
}

function startServer(args, env, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('error', (error) => console.error(`No se pudo iniciar el servidor: ${error.message}`));
  return child;
}

function stopServers(children) {
  return Promise.all(children.map((child) => new Promise((resolveClose) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolveClose();
    child.once('close', resolveClose);
    child.kill();
  })));
}

async function main() {
  const chromeVersion = spawnSync(chromePath, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (chromeVersion.error || chromeVersion.status !== 0) {
    throw new Error(`No se pudo comprobar Chrome estable: ${chromeVersion.error?.message ?? chromeVersion.stderr}`);
  }
  console.log(`Chrome: ${chromeVersion.stdout.trim()}`);

  const buildEnv = { ...process.env, NODE_ENV: 'production' };
  run(npm, ['run', 'build', '--workspace', '@gymtrack/frontend'], { env: buildEnv });
  run(npm, ['run', 'build', '--workspace', '@gymtrack/backend'], { env: buildEnv });

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    GYMTRACK_E2E: '1',
    NODE_EXTRA_CA_CERTS: caPath,
    CHROME_PATH: chromePath,
    JWT_SECRET: randomBytes(32).toString('base64url'),
  };
  const backend = startServer([resolve(root, 'backend/dist/main.js')], env);
  const preview = startServer([
    resolve(root, 'node_modules/vite/bin/vite.js'),
    'preview', '--host', 'localhost', '--port', '5173', '--strictPort',
  ], env, resolve(root, 'frontend'));
  const servers = [backend, preview];

  try {
    await waitFor('https://localhost:3000/api', (status) => status === 404, servers);
    await waitFor('https://localhost:5173', (status) => status === 200, servers);

    const lighthouseCli = resolve(root, 'node_modules/lighthouse/cli/index.js');
    const lighthouseConfig = resolve(root, 'e2e/lighthouse/lighthouse.config.json');
    const firstLoads = [];
    for (let runNumber = 1; runNumber <= 5; runNumber += 1) {
      const reportPath = resolve(outputDirectory, `lighthouse-${runNumber}.json`);
      run(process.execPath, [
        lighthouseCli,
        'https://localhost:5173',
        `--config-path=${lighthouseConfig}`,
        '--output=json',
        `--output-path=${reportPath}`,
        '--throttling-method=devtools',
        '--quiet',
        '--chrome-flags=--headless=new',
      ], { env });
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const interactive = report.audits.interactive?.numericValue;
      if (!Number.isFinite(interactive)) {
        throw new Error(`Lighthouse no produjo una métrica interactiva en la ejecución ${runNumber}.`);
      }
      firstLoads.push(interactive);
      console.log(`Primera carga interactiva ${runNumber}/5: ${(interactive / 1000).toFixed(2)} s`);
    }

    const passingLoads = firstLoads.filter((milliseconds) => milliseconds < 3000).length;
    const summary = {
      chrome: chromeVersion.stdout.trim(),
      profile: { viewport: '360x800', cpuSlowdown: 4, downloadMbps: 10, uploadMbps: 5, latencyMs: 100 },
      firstInteractiveMs: firstLoads,
      passingLoads,
      responseLocalTargetMs: 100,
    };
    const summaryPath = resolve(outputDirectory, 'summary.json');
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Primera carga <3 s: ${passingLoads}/5; evidencia: ${summaryPath}`);
    if (passingLoads < 4) throw new Error('No se alcanzó el umbral de primera carga interactiva (<3 s en 4/5).');

    const playwrightCli = resolve(root, 'node_modules/playwright/cli.js');
    run(process.execPath, [
      playwrightCli,
      'test',
      '--config=e2e/lighthouse/playwright.config.ts',
    ], { env });
  } finally {
    await stopServers(servers);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
