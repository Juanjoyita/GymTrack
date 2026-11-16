import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearCorreoSintetico, enviarCorreoSintetico, esperarCorreo, eliminarCorreo, leerPanel } from '../utils/correo';

describe('T043A: infraestructura SMTP y Mailpit HTTPS', () => {
  it('envía por SMTP y recupera destinatario, asunto y cuerpo mediante HTTPS', async () => {
    const correo = crearCorreoSintetico();
    let id: string | undefined;
    try {
      await enviarCorreoSintetico(correo);
      const recibido = await esperarCorreo(correo.para);
      id = recibido.ID;
      expect(recibido.To.map((destino) => destino.Address)).toContain(correo.para);
      expect(recibido.From.Address).toBe(correo.de);
      expect(recibido.Subject).toBe(correo.asunto);
      expect(recibido.Text.trim()).toBe(correo.texto);
      expect(await leerPanel()).toMatch(/Mailpit/i);
      const browser = await chromium.launch({ channel: 'chrome' });
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: false });
        await page.goto(process.env.MAILPIT_URL || 'https://localhost:8025');
        await page.getByText(correo.asunto, { exact: true }).first().click();
        await page.getByText(correo.para, { exact: false }).first().waitFor({ state: 'visible' });
        const directorio = resolve(__dirname, '../../../test-results/mailpit');
        mkdirSync(directorio, { recursive: true });
        await page.screenshot({ path: resolve(directorio, 'correo-sintetico-https.png'), fullPage: true });
        expect(page.url()).toMatch(/^https:\/\//);
      } finally { await browser.close(); }
    } finally {
      if (id) await eliminarCorreo(id);
    }
  });
});
