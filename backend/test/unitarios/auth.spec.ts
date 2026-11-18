import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hash, argon2id, verify } from 'argon2';
import type { Repository } from 'typeorm';
import { AuthService } from '../../src/auth/auth.service';
import { AuthGuard, exigirPropiedad } from '../../src/comun/auth.guard';
import type { UsuarioRow } from '../../src/database/entities/usuario';

const secret = 't016-clave-sintetica-exclusiva-de-pruebas-2026';
const password = 'T016-contrasena-sintetica!';
const id = '00000000-0000-4000-8000-000000000016';
const email = 't016@example.invalid';
const dto = { id, email, unidadPeso: 'kg', zonaHoraria: 'America/Bogota' };
const jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256', expiresIn: '7d', issuer: 'gymtrack', audience: 'gymtrack-web' },
  verifyOptions: { algorithms: ['HS256'], issuer: 'gymtrack', audience: 'gymtrack-web' } });

describe('T016: servicio y guard aislados', () => {
  let auth: AuthService;
  let rows: UsuarioRow[];
  let fixtureHash: string;
  const repo = {
    findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
  };
  beforeAll(async () => { fixtureHash = await hash(password, { type: argon2id }); });
  beforeEach(() => {
    rows = [{ id, email, hash_contrasena: fixtureHash, version_token: 0, unidad_peso: 'kg', zona_horaria: 'America/Bogota', creado_en: new Date() }];
    repo.findOne.mockReset().mockImplementation(async ({ where }) => rows.find((row) => where.id ? row.id === where.id : row.email === where.email) ?? null);
    repo.create.mockReset().mockImplementation((input) => input);
    repo.save.mockReset().mockImplementation(async (input) => {
      const row = { version_token: 0, unidad_peso: 'kg', creado_en: new Date(), ...input };
      rows.push(row); return row;
    });
    auth = new AuthService(repo as unknown as Repository<UsuarioRow>, jwt);
  });
  async function estado(promise: Promise<unknown>, code: number) {
    await expect(promise).rejects.toMatchObject({ status: code });
  }
  const firmar = (payload: object, expiresIn: number = 604800) => jwt.signAsync(payload, { expiresIn });

  it('registra normalizando email, guarda Argon2id y entrega DTO sin secretos', async () => {
    const result = await auth.registro({ email: ' NUEVO@EXAMPLE.INVALID ', contrasena: password, zonaHoraria: 'America/Bogota' });
    expect(result.usuario).toEqual({ ...dto, id: expect.any(String), email: 'nuevo@example.invalid' });
    const row = rows.find((row) => row.email === 'nuevo@example.invalid')!;
    expect(row.hash_contrasena.startsWith('$argon2id$')).toBe(true);
    expect(await verify(row.hash_contrasena, password)).toBe(true);
    const payload = await jwt.verifyAsync(result.token);
    expect(payload.sub).toBe(row.id);
    expect(payload.exp - payload.iat).toBe(604800);
    expect(payload.versionToken).toBe(0);
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub', 'versionToken']);
  });
  it('login verifica el hash seleccionado explícitamente y devuelve sesión', async () => {
    const result = await auth.login({ email: ' T016@EXAMPLE.INVALID ', contrasena: password });
    expect(result.usuario).toEqual(dto);
    expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email }, select: expect.objectContaining({ hash_contrasena: true }) }));
    expect(await auth.sesion(result.token)).toEqual(dto);
  });
  it('email registrado produce EMAIL_EN_USO', async () => {
    await expect(auth.registro({ email, contrasena: password, zonaHoraria: 'UTC' })).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ codigo: 'EMAIL_EN_USO' }) });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('una carrera de inserción única también produce EMAIL_EN_USO', async () => {
    repo.save.mockRejectedValueOnce({ driverError: { code: '23505', constraint: 'usuario_email_key' } });
    await expect(auth.registro({ email: 'otro@example.invalid', contrasena: password, zonaHoraria: 'UTC' })).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ codigo: 'EMAIL_EN_USO' }) });
  });
  it.each([
    { email: 'invalido', contrasena: password, zonaHoraria: 'UTC' },
    { email: 'nuevo@example.invalid', contrasena: '', zonaHoraria: 'UTC' },
    { email: 'nuevo@example.invalid', contrasena: password, zonaHoraria: 'zona-inexistente' },
  ])('registro rechaza entrada inválida por campo', async (input) => {
    await expect(auth.registro(input)).rejects.toMatchObject({ status: 400, response: { codigo: 'VALIDACION', campos: expect.any(Object) } });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('remapea password del dominio a contrasena del contrato', async () => {
    await expect(auth.login({ email, contrasena: '' })).rejects.toMatchObject({ status: 400,
      response: { campos: { contrasena: expect.any(String) } } });
  });
  it('email desconocido y contraseña incorrecta devuelven el mismo 401', async () => {
    const errores: unknown[] = [];
    for (const inputEmail of [email, 'ausente@example.invalid']) {
      try { await auth.login({ email: inputEmail, contrasena: 'incorrecta' }); }
      catch (error) { errores.push(error instanceof HttpException ? error.getResponse() : error); }
    }
    expect(errores).toHaveLength(2);
    expect(errores[0]).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String), campos: null, actual: null });
    expect(errores[0]).toEqual(errores[1]);
  });
  it('hash dañado no expone detalles ni permite acceso', async () => {
    rows[0].hash_contrasena = 'hash-invalido';
    await estado(auth.login({ email, contrasena: password }), 401);
  });
  it('JWT expirado, manipulado, firmado con otra clave o sin claims se rechaza', async () => {
    const expired = await firmar({ sub: id, versionToken: 0 }, -1);
    const wrongKey = await new JwtService({ secret: 'otra-clave-sintetica' }).signAsync({ sub: id, versionToken: 0 });
    for (const token of [expired, 'no.es.jwt', wrongKey, await firmar({ sub: id }), await firmar({ sub: email, versionToken: 0 })]) {
      await estado(auth.sesion(token), 401);
    }
  });
  it('usuario eliminado y version_token revocada producen 401', async () => {
    const token = await firmar({ sub: id, versionToken: 0 });
    rows[0].version_token = 1;
    await estado(auth.sesion(token), 401);
    rows.length = 0;
    await estado(auth.sesion(token), 401);
  });
  it('la identidad y preferencias se leen del usuario actual, no del cuerpo ni del JWT', async () => {
    const token = await firmar({ sub: id, versionToken: 0, email: 'suplantado@example.invalid' });
    expect(await auth.sesion(token)).toEqual(dto);
  });

  function contexto(headers: object) {
    const req = { headers, body: { usuarioId: 'ajeno' }, usuario: { id: 'inyectado' } };
    const context = { getHandler: () => contexto, getClass: () => AuthGuard,
      switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    return { req, context };
  }
  it('guard 401 sin cookie aunque reciba Authorization o usuario en el cuerpo', async () => {
    const guard = new AuthGuard(new Reflector(), auth);
    await estado(guard.canActivate(contexto({ authorization: 'Bearer no-valido' }).context), 401);
  });
  it('guard rechaza cookie manipulada', async () => {
    const guard = new AuthGuard(new Reflector(), auth);
    await estado(guard.canActivate(contexto({ cookie: 'gt_sesion=no-valido' }).context), 401);
  });
  it('guard asigna la identidad de la cookie válida, sobreescribiendo datos no confiables', async () => {
    const guard = new AuthGuard(new Reflector(), auth);
    const token = await firmar({ sub: id, versionToken: 0 });
    const { req, context } = contexto({ cookie: `otra=valor; gt_sesion=${token}` });
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.usuario).toEqual(dto);
  });
  it('propiedad permite recurso propio y oculta ajeno/ausente con el mismo 404', () => {
    const propio = { usuario_id: id, id: 'recurso-propio' };
    expect(exigirPropiedad(id, propio)).toBe(propio);
    for (const recurso of [{ usuario_id: 'otro-usuario' }, null, undefined]) {
      try { exigirPropiedad(id, recurso); throw new Error('Acceso indebido'); }
      catch (error) { expect(error).toMatchObject({ status: 404 }); }
    }
  });
});
