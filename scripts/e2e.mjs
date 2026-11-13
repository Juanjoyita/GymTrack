import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', NODE_EXTRA_CA_CERTS: ca } });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
