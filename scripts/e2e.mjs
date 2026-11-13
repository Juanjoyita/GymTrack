import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const config = 'e2e/playwright.config.ts';
if (!existsSync(config)) {
  console.error('E2E pendiente de T006: falta e2e/playwright.config.ts. No se han ejecutado pruebas.');
  process.exitCode = 1;
} else {
  const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
