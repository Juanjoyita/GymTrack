import { GoneException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { esquemaRecuperar, esquemaRestablecer } from '@gymtrack/domain';
import { ZodValidationPipe } from '../comun/zod-validation.pipe';
import { CorreoService } from '../correo/correo.service';

const mensajeRecuperacion = Object.freeze({ mensaje: 'Si el email está registrado, recibirás un enlace en unos minutos.' });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const enlaceInvalido = () => new GoneException({ codigo: 'ENLACE_INVALIDO', mensaje: 'El enlace no es válido, ya se usó o ha caducado. Solicita uno nuevo.', campos: null, actual: null });

function urlFrontend() {
  const valor = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'https://localhost:5173');
  try {
    const url = new URL(valor);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new Error('Configura FRONTEND_URL con el origen HTTPS del frontend.'); }
}

@Injectable()
export class RecuperacionService {
  private readonly frontend = urlFrontend();
  constructor(private readonly source: DataSource, private readonly correo: CorreoService) {}

  async recuperar(input: unknown) {
    const { email } = new ZodValidationPipe(esquemaRecuperar).transform(input);
    const token = randomBytes(32).toString('hex');
    const usuario = await this.source.transaction(async (manager) => {
      // Mismo bloqueo que restablecer y eliminar: ninguna emisión/consumo se cruza en silencio.
      const [row] = await manager.query<Array<{ id: string }>>('SELECT id FROM usuario WHERE email=$1 FOR UPDATE', [email]);
      if (!row) return null;
      await manager.query('UPDATE token_recuperacion SET usado_en=clock_timestamp() WHERE usuario_id=$1 AND usado_en IS NULL', [row.id]);
      await manager.query(`WITH momento AS (SELECT clock_timestamp() AS instante)
        INSERT INTO token_recuperacion (id,usuario_id,hash_token,creado_en,expira_en)
        SELECT $1,$2,$3,instante,instante+interval '1 hour' FROM momento`, [randomUUID(), row.id, digest(token)]);
      return row;
    });
    if (usuario) {
      const enlace = new URL('/restablecer', this.frontend);
      enlace.searchParams.set('token', token);
      try {
        await this.correo.enviar(email, 'Recuperar contraseña de GymTrack',
          `Para crear una nueva contraseña abre este enlace:\n${enlace.href}\n\nEs válido durante una hora y solo puede usarse una vez. Si no lo solicitaste, ignora este correo.`);
      } catch {
        // La indisponibilidad SMTP tampoco debe revelar si existe la cuenta.
        // No registrar la excepción del transporte, destinatario ni enlace.
      }
    }
    return mensajeRecuperacion;
  }

  async restablecer(input: unknown): Promise<void> {
    const { token, contrasenaNueva } = new ZodValidationPipe(esquemaRestablecer).transform(input);
    const hashToken = digest(token);
    await this.source.transaction(async (manager) => {
      const [fila] = await manager.query<Array<{ usuario_id: string }>>('SELECT usuario_id FROM token_recuperacion WHERE hash_token=$1', [hashToken]);
      if (!fila) throw enlaceInvalido();
      const [usuario] = await manager.query('SELECT id FROM usuario WHERE id=$1 FOR UPDATE', [fila.usuario_id]);
      if (!usuario) throw enlaceInvalido();
      // clock_timestamp se evalúa tras adquirir los bloqueos, no al comenzar la transacción.
      const consumidos = await manager.query<Array<{ id: string }>>(`WITH consumidos AS (UPDATE token_recuperacion SET usado_en=clock_timestamp()
        WHERE hash_token=$1 AND usuario_id=$2 AND usado_en IS NULL AND expira_en>clock_timestamp() RETURNING id) SELECT id FROM consumidos`, [hashToken, fila.usuario_id]);
      if (!consumidos.length) throw enlaceInvalido();
      const hashContrasena = await hash(contrasenaNueva, { type: argon2id });
      await manager.query('UPDATE usuario SET hash_contrasena=$1,version_token=version_token+1 WHERE id=$2', [hashContrasena, fila.usuario_id]);
      await manager.query('UPDATE token_recuperacion SET usado_en=clock_timestamp() WHERE usuario_id=$1 AND usado_en IS NULL', [fila.usuario_id]);
    });
  }
}
