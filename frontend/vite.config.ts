import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  if (command === 'build') return { plugins: [react(), tailwindcss()] };
  const directory = env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
  const https = {
    cert: readFileSync(resolve(root, env.TLS_CERT_PATH || resolve(directory, 'localhost.pem'))),
    key: readFileSync(resolve(root, env.TLS_KEY_PATH || resolve(directory, 'localhost-key.pem'))),
    minVersion: 'TLSv1.2' as const,
  };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: 'localhost', port: 5173, strictPort: true, https,
      proxy: {
        '/api': {
          target: 'https://localhost:3000', secure: true,
          agent: new Agent({ ca: readFileSync(resolve(root, env.TLS_CA_PATH || resolve(directory, 'ca.pem'))) }),
        },
      },
    },
    preview: { host: 'localhost', port: 5173, strictPort: true, https },
  };
});
