import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { hash, verify, argon2id } from 'argon2';
import { Repository } from 'typeorm';
import { Usuario, type UsuarioRow } from '../database/entities/usuario';
import { validarAcceso } from './auth.validation';
import { noAutenticado } from './auth.errors';
import { usuarioSesion, type Acceso, type UsuarioSesion } from './auth.types';

@Injectable()
export class AuthService {
  // Mismo camino de verificación para email inexistente, sin almacenar contraseñas ficticias en BD.
  private readonly hashInexistente = hash('tarea-auth-verificacion-inexistente', { type: argon2id });

  constructor(@InjectRepository(Usuario) private readonly usuarios: Repository<UsuarioRow>, private readonly jwt: JwtService) {}

  private conflictoEmail() {
    return new ConflictException({ codigo: 'EMAIL_EN_USO', mensaje: 'Ese correo ya está registrado.', campos: null, actual: null });
  }
  private async acceso(row: UsuarioRow): Promise<Acceso> {
    const token = await this.jwt.signAsync({ sub: row.id, versionToken: row.version_token });
    return { usuario: usuarioSesion(row), token };
  }

  async registro(input: unknown): Promise<Acceso> {
    const data = validarAcceso(input, true);
    if (await this.usuarios.findOne({ where: { email: data.email } })) throw this.conflictoEmail();
    const row = this.usuarios.create({ id: randomUUID(), email: data.email,
      hash_contrasena: await hash(data.contrasena, { type: argon2id }),
      zona_horaria: data.zonaHoraria, unidad_peso: 'kg', version_token: 0 });
    let saved: UsuarioRow;
    try { saved = await this.usuarios.save(row); }
    catch (error) {
      const databaseError = error as { driverError?: { code?: string; constraint?: string } };
      if (databaseError?.driverError?.code === '23505' && databaseError.driverError.constraint === 'usuario_email_key') throw this.conflictoEmail();
      throw error;
    }
    return this.acceso(saved);
  }

  async login(input: unknown): Promise<Acceso> {
    const data = validarAcceso(input, false);
    const row = await this.usuarios.findOne({ where: { email: data.email }, select: {
      id: true, email: true, hash_contrasena: true, version_token: true, unidad_peso: true, zona_horaria: true,
    } });
    let valid = false;
    try { valid = await verify(row?.hash_contrasena ?? await this.hashInexistente, data.contrasena); }
    catch { /* Un hash dañado tampoco revela detalles al cliente. */ }
    if (!row || !valid) throw noAutenticado();
    return this.acceso(row);
  }

  async sesion(token: string): Promise<UsuarioSesion> {
    let payload: { sub?: unknown; versionToken?: unknown; exp?: unknown; iat?: unknown };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { throw noAutenticado(); }
    if (!payload || typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
      || !Number.isInteger(payload.versionToken) || (payload.versionToken as number) < 0
      || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') throw noAutenticado();
    const row = await this.usuarios.findOne({ where: { id: payload.sub } });
    if (!row || row.version_token !== payload.versionToken) throw noAutenticado();
    return usuarioSesion(row);
  }
}
