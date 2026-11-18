import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { opcionesCorreo } from './correo.config';

@Injectable()
export class CorreoService {
  async enviar(para: string, asunto: string, texto: string): Promise<void> {
    const { from, transporte } = opcionesCorreo();
    const cliente = nodemailer.createTransport(transporte);
    try {
      await cliente.sendMail({ from, to: para, subject: asunto, text: texto, disableFileAccess: true, disableUrlAccess: true });
    } catch {
      // El error SMTP puede contener destinatarios o contenido: no propagarlo ni registrarlo.
      throw new ServiceUnavailableException('No se pudo enviar el correo.');
    } finally { cliente.close(); }
  }
}
