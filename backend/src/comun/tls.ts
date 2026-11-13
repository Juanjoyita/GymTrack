import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function opcionesTls(env: NodeJS.ProcessEnv = process.env) {
  const root = resolve(__dirname, '../../..');
  const directory = env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
  try {
    return {
      cert: readFileSync(resolve(root, env.TLS_CERT_PATH || resolve(directory, 'localhost.pem'))),
      key: readFileSync(resolve(root, env.TLS_KEY_PATH || resolve(directory, 'localhost-key.pem'))),
      minVersion: 'TLSv1.2' as const,
    };
  } catch {
    throw new Error('Certificados HTTPS no disponibles. Ejecuta npm run tls:local o configura TLS_CERT_PATH/TLS_KEY_PATH.');
  }
}
