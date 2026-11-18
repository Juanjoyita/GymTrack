import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { verify } from 'argon2';
import type { DataSource } from 'typeorm';
import { CorreoService } from '../../src/correo/correo.service';
import { AppModule } from '../../src/app.module';
import { configureApi } from '../../src/main';
import { opcionesTls } from '../../src/comun/tls';
import { peticionHttps } from '../utils/https';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';
import { sembrarCuenta, snapshotCuenta, contrasenaCuenta, contrasenaNueva, sha256, leerCsv, contieneSecretos, type CuentaFixture } from '../utils/cuenta-fixtures';
import { esperarCorreo, listarCorreos, eliminarCorreo } from '../utils/correo';

const mensaje = { mensaje: 'Si el email está registrado, recibirás un enlace en unos minutos.' };

describe('T044: aceptación REST US4', () => {
  let app: INestApplication | undefined;
  let source: DataSource;
  let propio: CuentaFixture, ajeno: CuentaFixture;
  let esquemaPropio = false;
  const cliente = () => {
    if (!app) throw new Error('Aplicación no inicializada.');
    return peticionHttps(app);
  };
  async function login(cuenta = propio, password = contrasenaCuenta) {
    const agent = cliente();
    await agent.post('/api/auth/login').send({ email: cuenta.email, contrasena: password }).expect(200);
    return agent;
  }
  beforeEach(async () => {
    source = await fuenteDatosIntegracion().initialize();
    await prepararEsquemaIntegracion(source); esquemaPropio = true;
    await source.runMigrations();
    propio = await sembrarCuenta(source); ajeno = await sembrarCuenta(source);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    app = module.createNestApplication({ logger: false, httpsOptions: opcionesTls() });
    configureApi(app); await app.init();
    // Prerrequisitos reales: BD, login y Mailpit deben funcionar antes de medir el rojo.
    await (await login()).get('/api/auth/yo').expect(200);
    await listarCorreos(propio.email);
  });
  afterEach(async () => {
    try {
      for (const cuenta of [propio, ajeno].filter(Boolean)) {
        for (const correo of await listarCorreos(cuenta.email)) await eliminarCorreo(correo.ID);
      }
    } finally {
      if (esquemaPropio && source?.isInitialized) await limpiarEsquemaIntegracion(source);
      esquemaPropio = false;
      await app?.close(); app = undefined;
      if (source?.isInitialized) await source.destroy();
    }
  });

  it('kg → lb → kg conserva exactamente todas las series y la cuenta ajena', async () => {
    const agent = await login();
    const antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
    for (const unidadPeso of ['lb', 'kg']) {
      const r = await agent.patch('/api/cuenta/preferencias').send({ unidadPeso, zonaHoraria: 'Europe/Madrid' }).expect(200);
      expect(r.body).toEqual({ id: propio.ids.usuario, email: propio.email, unidadPeso, zonaHoraria: 'Europe/Madrid' });
      await agent.get('/api/auth/yo').expect(200, r.body);
      const despues = await snapshotCuenta(source, propio);
      for (const tabla of ['serie', 'entrenamiento', 'ejercicio_realizado']) expect(despues[tabla]).toEqual(antes[tabla]);
    }
    expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
  });

  it.each(['json', 'csv'])('exporta %s completo, descargable, propio y sin secretos', async (formato) => {
    const agent = await login();
    const antes = await snapshotCuenta(source, propio);
    const r = await agent.get(`/api/exportacion?formato=${formato}`).expect(200);
    expect(r.headers['content-disposition']).toMatch(new RegExp(`attachment;.*gymtrack-\\d{4}-\\d{2}-\\d{2}\\.${formato}`));
    const texto = formato === 'json' ? JSON.stringify(r.body) : r.text;
    expect(contieneSecretos(texto, [propio, ajeno])).toBe(false);
    expect(texto.includes(ajeno.ids.usuario) || texto.includes(ajeno.email) || texto.includes(ajeno.ids.entrenamiento)).toBe(false);
    if (formato === 'json') {
      expect(r.headers['content-type']).toMatch(/application\/json/);
      for (const id of Object.values(propio.ids).filter((id) => id !== propio.ids.token)) expect(texto.includes(id)).toBe(true);
      for (const valor of [propio.email, '60.125', 'America/Bogota', '2026-11-10', 'Nota ejercicio T044', 'Rutina T044']) expect(texto.includes(valor)).toBe(true);
      expect(texto.includes(JSON.stringify('Nota, con "comillas"\ny salto T044').slice(1, -1))).toBe(true);
    } else {
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      const filas = leerCsv(texto);
      expect(filas).toHaveLength(3); // Dos series propias; la sesión vacía no produce filas CSV.
      for (const fila of filas.slice(1)) expect(fila).toHaveLength(filas[0].length);
      const filaSerie = filas.slice(1).find((fila) => fila.includes('60.125'));
      expect(Boolean(filaSerie)).toBe(true);
      expect(filas.slice(1).some((fila) => fila.includes('0') && fila.includes('100'))).toBe(true);
      for (const valor of ['2026-11-10', propio.ids.entrenamiento, 'Press T044', 'pecho', '1', '8', '60.125', '132.55', 'Nota, con "comillas"\ny salto T044']) {
        expect(filaSerie!.includes(valor)).toBe(true);
      }
    }
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
  });

  it('CSV neutraliza fórmulas de texto y JSON conserva la nota original =1+1', async () => {
    const agent = await login();
    for (const texto of ['=1+1', '+1+1', '-1+1', '@SUM(1,1)']) {
      await source.query('UPDATE entrenamiento SET nota=$1 WHERE id=$2', [texto, propio.ids.entrenamiento]);
      await source.query('UPDATE ejercicio SET nombre=$1 WHERE id=$2', [texto, propio.ids.ejercicio]);
      await source.query('UPDATE ejercicio_realizado SET nota=$1 WHERE id=$2', [texto, propio.ids.realizado]);
      const json = await agent.get('/api/exportacion?formato=json').expect(200);
      const entrenamiento = json.body.entrenamientos.find((t: { id: string }) => t.id === propio.ids.entrenamiento);
      expect(entrenamiento.nota).toBe(texto);
      expect(entrenamiento.ejercicios[0].nombre).toBe(texto);
      expect(entrenamiento.ejercicios[0].nota).toBe(texto);
      const csv = await agent.get('/api/exportacion?formato=csv').expect(200);
      const [cabecera, ...filas] = leerCsv(csv.text);
      for (const fila of filas) {
        for (const campo of ['ejercicio', 'notaEntrenamiento', 'notaEjercicio']) {
          expect(fila[cabecera.indexOf(campo)]).toBe(`'${texto}`);
        }
        expect(fila[cabecera.indexOf('pesoKg')]).toMatch(/^(60\.125|0)$/);
      }
      const [guardado] = await source.query('SELECT nota FROM entrenamiento WHERE id=$1', [propio.ids.entrenamiento]);
      expect(guardado.nota).toBe(texto);
    }
  });

  it('elimina todos los dependientes, conserva catálogo/ajenos e invalida dos sesiones', async () => {
    const agent = await login(), segundo = await login();
    const otro = await snapshotCuenta(source, ajeno);
    const catalogo = await source.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL ORDER BY id');
    const r = await agent.delete('/api/cuenta').send({ contrasena: contrasenaCuenta }).expect(204);
    const raw = r.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    expect(cookies.some((c) => /^gt_sesion=;/.test(c))).toBe(true);
    for (const filas of Object.values(await snapshotCuenta(source, propio))) expect(filas.length).toBe(0);
    expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
    expect(await source.query('SELECT * FROM ejercicio WHERE usuario_id IS NULL ORDER BY id')).toEqual(catalogo);
    await agent.get('/api/auth/yo').expect(401); await segundo.get('/api/auth/yo').expect(401);
    await cliente().post('/api/auth/login').send({ email: propio.email, contrasena: contrasenaCuenta }).expect(401);
  });

  it('contraseña incorrecta impide borrar sin mutar datos', async () => {
    const agent = await login(), antes = await snapshotCuenta(source, propio);
    await agent.delete('/api/cuenta').send({ contrasena: 'incorrecta-T044!' }).expect(401);
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
    await agent.get('/api/auth/yo').expect(200);
  });

  it.each(['preferencias', 'exportacion', 'eliminar'])('protege %s sin sesión', async (caso) => {
    const agent = cliente();
    const request = caso === 'preferencias' ? agent.patch('/api/cuenta/preferencias').send({ unidadPeso: 'lb' }) :
      caso === 'exportacion' ? agent.get('/api/exportacion?formato=json') : agent.delete('/api/cuenta').send({ contrasena: contrasenaCuenta });
    await request.expect(401);
  });

  it('recuperar responde 202 idéntico; solo el registrado recibe correo, hash y TTL de 1 h', async () => {
    const desconocido = `t044.desconocido.${propio.ids.usuario}@example.invalid`;
    const registrado = await cliente().post('/api/auth/recuperar').send({ email: propio.email }).expect(202);
    const inexistente = await cliente().post('/api/auth/recuperar').send({ email: desconocido }).expect(202);
    expect(registrado.body).toEqual(mensaje); expect(inexistente.body).toEqual(registrado.body);
    const correo = await esperarCorreo(propio.email);
    const enlace = correo.Text.match(/https:\/\/[^\s<>]+\/restablecer\?token=[^\s<>]+/)?.[0];
    expect(Boolean(enlace)).toBe(true);
    const token = new URL(enlace!).searchParams.get('token')!;
    expect(token.length >= 32).toBe(true);
    const [fila] = await source.query('SELECT * FROM token_recuperacion WHERE hash_token=$1', [sha256(token)]);
    expect(Boolean(fila)).toBe(true);
    expect(fila.usuario_id).toBe(propio.ids.usuario);
    expect(new Date(fila.expira_en).getTime() - new Date(fila.creado_en).getTime()).toBe(3600000);
    expect(fila.usado_en).toBeNull();
    // Ventana acotada para detectar envíos indebidos asíncronos al desconocido.
    await new Promise((done) => setTimeout(done, 500));
    expect(await listarCorreos(desconocido)).toHaveLength(0);
  });

  it('token vigente cambia contraseña una vez y revoca todas las sesiones', async () => {
    const primero = await login(), segundo = await login();
    const otro = await snapshotCuenta(source, ajeno);
    await cliente().post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva }).expect(204);
    const [fila] = await source.query('SELECT * FROM usuario WHERE id=$1', [propio.ids.usuario]);
    expect(await verify(fila.hash_contrasena, contrasenaNueva)).toBe(true);
    expect(fila.version_token).toBe(1);
    const [token] = await source.query('SELECT usado_en FROM token_recuperacion WHERE id=$1', [propio.ids.token]);
    expect(Boolean(token.usado_en)).toBe(true);
    await primero.get('/api/auth/yo').expect(401); await segundo.get('/api/auth/yo').expect(401);
    await cliente().post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva }).expect(410);
    await cliente().post('/api/auth/login').send({ email: propio.email, contrasena: contrasenaCuenta }).expect(401);
    await login(propio, contrasenaNueva);
    expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
  });

  it.each(['usado', 'exactamente 1 h', 'más de 1 h', 'desconocido'])('rechaza token %s con ENLACE_INVALIDO sin mutar cuenta', async (estado) => {
    if (estado === 'usado') await source.query('UPDATE token_recuperacion SET usado_en=now() WHERE id=$1', [propio.ids.token]);
    if (estado.includes('1 h')) await source.query(`UPDATE token_recuperacion
      SET creado_en=now()-interval '1 hour'-($2::int * interval '1 second'), expira_en=now()-($2::int * interval '1 second') WHERE id=$1`, [propio.ids.token, estado.startsWith('más') ? 1 : 0]);
    const antes = await snapshotCuenta(source, propio);
    const r = await cliente().post('/api/auth/restablecer').send({ token: estado === 'desconocido' ? randomBytes(32).toString('hex') : propio.token, contrasenaNueva }).expect(410);
    expect(r.body.codigo).toBe('ENLACE_INVALIDO');
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
  });

  it('acepta un enlace de 59 minutos todavía vigente', async () => {
    await source.query(`UPDATE token_recuperacion SET creado_en=now()-interval '59 minutes', expira_en=now()+interval '1 minute' WHERE id=$1`, [propio.ids.token]);
    await cliente().post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva }).expect(204);
    await login(propio, contrasenaNueva);
  });

  it('solicitar otro enlace invalida el anterior', async () => {
    await cliente().post('/api/auth/recuperar').send({ email: propio.email }).expect(202);
    await esperarCorreo(propio.email);
    await cliente().post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva }).expect(410);
  });

  it('consumo concurrente del mismo token permite un único cambio', async () => {
    const respuestas = await Promise.all([cliente(), cliente()].map((agent) =>
      agent.post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva })));
    expect(respuestas.map((r) => r.status).sort()).toEqual([204, 410]);
  });
  it('T046: limita recuperar a diez intentos por minuto, también para desconocidos', async () => {
    const email = `t046.inexistente.${propio.ids.usuario}@example.invalid`;
    for (let i = 0; i < 10; i++) await cliente().post('/api/auth/recuperar').send({ email }).expect(202);
    const r = await cliente().post('/api/auth/recuperar').send({ email }).expect(429);
    expect(r.body.codigo).toBe('DEMASIADAS_PETICIONES');
  });

  it('T046: valida email, tipo JSON y contraseña nueva sin cambiar la cuenta', async () => {
    const antes = await snapshotCuenta(source, propio);
    await cliente().post('/api/auth/recuperar').send({ email: 'invalido' }).expect(400);
    await cliente().post('/api/auth/recuperar').type('form').send({ email: propio.email }).expect(400);
    const r = await cliente().post('/api/auth/restablecer').send({ token: propio.token, contrasenaNueva: 'corta' }).expect(400);
    expect(Boolean(r.body.campos?.contrasenaNueva)).toBe(true);
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
  });

  it('T046: dos solicitudes concurrentes dejan un solo token vigente', async () => {
    const respuestas = await Promise.all([cliente(), cliente()].map((agent) => agent.post('/api/auth/recuperar').send({ email: propio.email })));
    expect(respuestas.map((r) => r.status)).toEqual([202, 202]);
    const [{ total }] = await source.query(`SELECT count(*)::int AS total FROM token_recuperacion
      WHERE usuario_id=$1 AND usado_en IS NULL AND expira_en>clock_timestamp()`, [propio.ids.usuario]);
    expect(total).toBe(1);
  });

  it('T046: un fallo SMTP no revela si el email existe ni devuelve el error del transporte', async () => {
    const envio = jest.spyOn(app!.get(CorreoService), 'enviar').mockRejectedValue(new Error('detalle SMTP sensible'));
    try {
      const r = await cliente().post('/api/auth/recuperar').send({ email: propio.email }).expect(202);
      const desconocido = await cliente().post('/api/auth/recuperar').send({ email: `t046.${propio.ids.usuario}@example.invalid` }).expect(202);
      expect(r.body).toEqual(mensaje); expect(desconocido.body).toEqual(r.body);
      expect(envio).toHaveBeenCalledTimes(1);
    } finally { envio.mockRestore(); }
  });

  it('T046: recuperación y restablecimiento no registran email, token ni contraseña', async () => {
    const log = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      await cliente().post('/api/auth/recuperar').send({ email: propio.email }).expect(202);
      const correo = await esperarCorreo(propio.email);
      const enlace = correo.Text.match(/https:\/\/[^\s<>]+\/restablecer\?token=[^\s<>]+/)?.[0];
      expect(Boolean(enlace)).toBe(true);
      const token = new URL(enlace!).searchParams.get('token')!;
      await cliente().post('/api/auth/restablecer').send({ token, contrasenaNueva }).expect(204);
      const salida = JSON.stringify(log.mock.calls);
      expect([propio.email, token, contrasenaNueva].some((dato) => salida.includes(dato))).toBe(false);
    } finally { log.mockRestore(); }
  });

  it('T047: valida preferencias y formato, rechazando identidad enviada por el cliente', async () => {
    const agent = await login(), antes = await snapshotCuenta(source, propio);
    for (const body of [{ unidadPeso: 'oz' }, { zonaHoraria: 'No/Existe' }, {}, { unidadPeso: 'lb', usuarioId: ajeno.ids.usuario }]) {
      const r = await agent.patch('/api/cuenta/preferencias').send(body).expect(400);
      expect(r.body.codigo).toBe('VALIDACION');
    }
    await agent.get('/api/exportacion?formato=xml').expect(400);
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
  });

  it('T047: cambia solo zona horaria y exporta siempre al dueño de la cookie', async () => {
    const agent = await login();
    const r = await agent.patch('/api/cuenta/preferencias').send({ zonaHoraria: 'Europe/Madrid' }).expect(200);
    expect(r.body.unidadPeso).toBe('kg'); expect(r.body.zonaHoraria).toBe('Europe/Madrid');
    const exportado = await agent.get(`/api/exportacion?formato=json&usuarioId=${ajeno.ids.usuario}`).expect(200);
    expect(exportado.body.usuario.id).toBe(propio.ids.usuario);
    expect(JSON.stringify(exportado.body).includes(ajeno.ids.usuario)).toBe(false);
    expect(exportado.headers['cache-control']).toBe('no-store');
  });

  it('T047: exporta una cuenta sin entrenamientos como JSON vacío y CSV con cabecera', async () => {
    await source.query('DELETE FROM entrenamiento WHERE usuario_id=$1', [propio.ids.usuario]);
    const agent = await login();
    const json = await agent.get('/api/exportacion?formato=json').expect(200);
    expect(json.body.entrenamientos).toEqual([]);
    expect(json.body.rutinas).toHaveLength(1);
    const csv = await agent.get('/api/exportacion?formato=csv').expect(200);
    expect(leerCsv(csv.text)).toHaveLength(1);
  });

  it('T048: un error durante el borrado revierte la cuenta y todos sus dependientes', async () => {
    const agent = await login();
    const antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
    await source.query(`CREATE FUNCTION t048_abortar_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo sintetico T048'; END $$`);
    await source.query(`CREATE TRIGGER zz_t048_abortar AFTER DELETE ON usuario FOR EACH ROW EXECUTE FUNCTION t048_abortar_borrado()`);
    const r = await agent.delete('/api/cuenta').send({ contrasena: contrasenaCuenta }).expect(500);
    expect(r.body.codigo).toBe('ERROR_INTERNO');
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
    expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
    await agent.get('/api/auth/yo').expect(200);
  });

  it('T048: borrar no acepta identidad ajena ni contraseña ausente', async () => {
    const agent = await login(), antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
    await agent.delete('/api/cuenta').send({ contrasena: contrasenaCuenta, usuarioId: ajeno.ids.usuario }).expect(400);
    await agent.delete('/api/cuenta').send({}).expect(400);
    expect(JSON.stringify(await snapshotCuenta(source, propio)) === JSON.stringify(antes)).toBe(true);
    expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
  });

});
