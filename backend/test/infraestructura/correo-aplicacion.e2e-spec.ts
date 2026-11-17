import { Test } from '@nestjs/testing';
import { CorreoModule } from '../../src/correo/correo.module';
import { CorreoService } from '../../src/correo/correo.service';
import { crearCorreoSintetico, esperarCorreo, eliminarCorreo } from '../utils/correo';

describe('T045: correo de aplicación', () => {
  it('envía con el servicio real y Mailpit lo recibe por SMTP sin registrar contenido', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const module = await Test.createTestingModule({ imports: [CorreoModule] }).compile();
    const correo = crearCorreoSintetico();
    let id: string | undefined;
    try {
      await module.get(CorreoService).enviar(correo.para, correo.asunto, correo.texto);
      const recibido = await esperarCorreo(correo.para); id = recibido.ID;
      expect(recibido.Subject).toBe(correo.asunto);
      expect(recibido.Text.trim()).toBe(correo.texto);
      expect(recibido.To.some((d) => d.Address === correo.para)).toBe(true);
      expect(info).not.toHaveBeenCalled(); expect(debug).not.toHaveBeenCalled();
    } finally {
      if (id) await eliminarCorreo(id);
      await module.close(); info.mockRestore(); debug.mockRestore();
    }
  });
});
