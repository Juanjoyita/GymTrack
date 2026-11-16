import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';

config({ path: resolve(__dirname, '../../../.env') });

export interface CorreoSintetico { de: string; para: string; asunto: string; texto: string }
interface Direccion { Address: string }
export interface CorreoRecibido { ID: string; From: Direccion; To: Direccion[]; Subject: string; Text: string }

function configuracion() {
  if (process.env.NODE_ENV !== 'test') throw new Error('El fixture de correo solo admite NODE_ENV=test.');
  const host = process.env.SMTP_HOST || 'localhost';
  const url = new URL(process.env.MAILPIT_URL || 'https://localhost:8025');
  if (!['localhost', '127.0.0.1', '::1'].includes(host) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('El fixture requiere SMTP local y Mailpit local por HTTPS.');
  }
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT inválido.');
  const directory = process.env.GYMTRACK_TLS_DIR || resolve(homedir(), '.local/share/gymtrack/tls');
  const ca = readFileSync(resolve(__dirname, '../../../', process.env.TLS_CA_PATH || resolve(directory, 'ca.pem')));
  return { host, port, url, ca };
}

export function crearCorreoSintetico(): CorreoSintetico {
  const id = randomUUID();
  return {
    de: 'infraestructura@example.invalid', para: `t043a.${id}@example.invalid`,
    asunto: `T043A infraestructura ${id}`, texto: 'Correo sintético de infraestructura GymTrack. Sin datos personales ni enlaces de recuperación.'
  };
}

export async function enviarCorreoSintetico(correo: CorreoSintetico) {
  const { host, port } = configuracion();
  if (!/^t043a\.[0-9a-f-]{36}@example\.invalid$/.test(correo.para) || correo.de !== 'infraestructura@example.invalid') {
    throw new Error('Solo se permiten direcciones sintéticas del fixture T043A.');
  }
  const transporte = nodemailer.createTransport({
    host, port, secure: false, ignoreTLS: true,
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
    logger: false, debug: false
  });
  try {
    await transporte.sendMail({ from: correo.de, to: correo.para, subject: correo.asunto, text: correo.texto });
  } finally { transporte.close(); }
}

async function consultar(ruta: string, method = 'GET', body?: object): Promise<string> {
  const { url, ca } = configuracion();
  return new Promise((resolveRequest, reject) => {
    const req = request(new URL(ruta, url), { method, ca, rejectUnauthorized: true,
      headers: body ? { 'Content-Type': 'application/json' } : undefined
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 300) return reject(new Error(`Mailpit respondió HTTP ${res.statusCode}.`));
        resolveRequest(data);
      });
      res.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('Tiempo de espera de Mailpit agotado.')));
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

export async function esperarCorreo(destinatario: string): Promise<CorreoRecibido> {
  const limite = Date.now() + 5000;
  do {
    const listado = JSON.parse(await consultar(`/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)) as { messages: { ID: string }[] };
    if (listado.messages.length) {
      return JSON.parse(await consultar(`/api/v1/message/${encodeURIComponent(listado.messages[0].ID)}`)) as CorreoRecibido;
    }
    await new Promise((done) => setTimeout(done, 100));
  } while (Date.now() < limite);
  throw new Error('Mailpit no recibió el correo sintético en 5 s.');
}

export async function eliminarCorreo(id: string) {
  // Borra únicamente el mensaje que recuperó la prueba; nunca vacía el buzón completo.
  await consultar('/api/v1/messages', 'DELETE', { IDs: [id] });
}

export const leerPanel = () => consultar('/');

// Consulta exacta por destinatario UUID para aceptación US4 y limpieza individual.
export async function listarCorreos(destinatario: string): Promise<{ ID: string }[]> {
  const listado = JSON.parse(await consultar(`/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)) as { messages: { ID: string }[] };
  return listado.messages;
}
