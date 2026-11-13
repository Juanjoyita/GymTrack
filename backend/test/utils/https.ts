import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import request from 'supertest';

export function peticionHttps(app: INestApplication) {
  const directory = process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
  const ca = readFileSync(resolve(__dirname, '../../..', process.env.TLS_CA_PATH || resolve(directory, 'ca.pem')));
  return request.agent(app.getHttpServer()).ca(ca);
}
