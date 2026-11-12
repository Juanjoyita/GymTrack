import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const config = 'e2e/playwright.config.ts';
if (!existsSync(config)) {
  console.error('E2E pendiente de T006: falta e2e/playwright.config.ts. No se han ejecutado pruebas.');
  process.exitCode = 1;
} else {
  const result = spawnSync('playwright', ['test', '--config', config, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
