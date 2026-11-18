import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const directory = process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
const ca = resolve(root, process.env.TLS_CA_PATH || resolve(directory, 'ca.pem'));
if (!existsSync(ca)) throw new Error('Falta la CA local. Ejecuta npm run tls:local.');
const config = 'e2e/playwright.config.ts';
if (!existsSync(config)) {
  console.error('E2E pendiente de T006: falta e2e/playwright.config.ts. No se han ejecutado pruebas.');
  process.exitCode = 1;
} else {
  const isWindows = process.platform === 'win32';
  const backendBuild = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace', '@gymtrack/backend'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
    shell: isWindows,
  });
  const build = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace', '@gymtrack/frontend'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
    shell: isWindows,
  });
  if (build.error) throw build.error;
  if (backendBuild.error) throw backendBuild.error;
  if (build.status !== 0 || backendBuild.status !== 0) {
    process.exitCode = build.status !== 0 ? (build.status ?? 1) : (backendBuild.status ?? 1);
  } else {
    const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'test', '--config', config, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        GYMTRACK_E2E: '1',
        GYMTRACK_E2E_BUILT: '1',
        NODE_EXTRA_CA_CERTS: ca,
        JWT_SECRET: randomBytes(32).toString('base64url'),
      },
    });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  }
}
