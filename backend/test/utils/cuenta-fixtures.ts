import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import type { DataSource } from 'typeorm';

export const contrasenaCuenta = 'T044-solo-pruebas-2026!';
export const contrasenaNueva = 'T044-nueva-solo-pruebas!';
export const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

// Compartido por REST y navegador. Solo datos sintéticos; ninguna ruta futura es simulada.
export async function sembrarCuenta(source: DataSource) {
  if (process.env.NODE_ENV !== 'test' || source.options.database !== 'gymtrack_test') {
    throw new Error('T044 solo permite gymtrack_test.');
  }
  const ids = { usuario: randomUUID(), ejercicio: randomUUID(), rutina: randomUUID(),
    entrenamiento: randomUUID(), entrenamientoVacio: randomUUID(), realizado: randomUUID(), serie: randomUUID(), serieCero: randomUUID(), token: randomUUID() };
  const email = `t044.${ids.usuario}@example.invalid`;
  const hashContrasena = await hash(contrasenaCuenta, { type: argon2id });
  const token = randomBytes(32).toString('hex');
  await source.transaction(async (manager) => {
    await manager.query('INSERT INTO usuario (id,email,hash_contrasena,zona_horaria) VALUES ($1,$2,$3,$4)',
      [ids.usuario, email, hashContrasena, 'America/Bogota']);
    await manager.query(`INSERT INTO ejercicio (id,usuario_id,nombre,nombre_normalizado,grupo_muscular)
      VALUES ($1,$2,'Press T044','press t044','pecho')`, [ids.ejercicio, ids.usuario]);
    await manager.query(`INSERT INTO rutina (id,usuario_id,nombre,dia_semana) VALUES ($1,$2,'Rutina T044',1)`, [ids.rutina, ids.usuario]);
    await manager.query('INSERT INTO rutina_ejercicio (rutina_id,posicion,ejercicio_id) VALUES ($1,1,$2)', [ids.rutina, ids.ejercicio]);
    await manager.query(`INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en,nota,rutina_origen_id)
      VALUES ($1,$2,'finalizado','2026-11-10T23:30:00Z','2026-11-11T00:30:00Z','America/Bogota','2026-11-11T00:00:00Z',$3,$4)`,
    [ids.entrenamiento, ids.usuario, 'Nota, con "comillas"\ny salto T044', ids.rutina]);
    await manager.query(`INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion,nota)
      VALUES ($1,$2,$3,1,'Nota ejercicio T044')`, [ids.realizado, ids.entrenamiento, ids.ejercicio]);
    await manager.query(`INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
      VALUES ($1,$2,1,8,60.1250,'2026-11-11T00:00:00Z')`, [ids.serie, ids.realizado]);
    await manager.query(`INSERT INTO entrenamiento (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
      VALUES ($1,$2,'finalizado','2026-11-09T23:30:00Z','2026-11-10T00:30:00Z','America/Bogota','2026-11-10T00:00:00Z')`, [ids.entrenamientoVacio, ids.usuario]);
    await manager.query(`INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
      VALUES ($1,$2,2,100,0,'2026-11-11T00:01:00Z')`, [ids.serieCero, ids.realizado]);
    await manager.query(`INSERT INTO token_recuperacion (id,usuario_id,hash_token,expira_en)
      VALUES ($1,$2,$3,now()+interval '1 hour')`, [ids.token, ids.usuario, sha256(token)]);
  });
  return { ids, email, hashContrasena, token };
}
export type CuentaFixture = Awaited<ReturnType<typeof sembrarCuenta>>;

export async function snapshotCuenta(source: DataSource, cuenta: CuentaFixture) {
  const condiciones = {
    usuario: ['id', cuenta.ids.usuario], ejercicio: ['usuario_id', cuenta.ids.usuario],
    rutina: ['usuario_id', cuenta.ids.usuario], rutina_ejercicio: ['rutina_id', cuenta.ids.rutina],
    entrenamiento: ['usuario_id', cuenta.ids.usuario], ejercicio_realizado: ['entrenamiento_id', cuenta.ids.entrenamiento],
    serie: ['ejercicio_realizado_id', cuenta.ids.realizado], token_recuperacion: ['usuario_id', cuenta.ids.usuario]
  };
  const result: Record<string, object[]> = {};
  for (const [tabla, [columna, id]] of Object.entries(condiciones)) {
    result[tabla] = await source.query(`SELECT * FROM ${tabla} WHERE ${columna}=$1 ORDER BY 1`, [id]);
  }
  return result;
}

export async function limpiarCuenta(source: DataSource, cuenta: CuentaFixture) {
  if (process.env.NODE_ENV !== 'test' || source.options.database !== 'gymtrack_test' ||
      !/^t044\.[0-9a-f-]{36}@example\.invalid$/.test(cuenta.email)) throw new Error('Limpieza T044 rechazada.');
  await source.query('DELETE FROM usuario WHERE id=$1 AND email=$2', [cuenta.ids.usuario, cuenta.email]);
}

// CSV RFC 4180: notas con comas, comillas y saltos de línea forman una sola celda.
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  const text = texto.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (comillas && text[i + 1] === '"') { celda += '"'; i++; }
      else comillas = !comillas;
    } else if (c === ',' && !comillas) { fila.push(celda); celda = ''; }
    else if (c === '\n' && !comillas) { fila.push(celda.replace(/\r$/, '')); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (comillas) throw new Error('CSV con comillas sin cerrar.');
  if (celda || fila.length) { fila.push(celda.replace(/\r$/, '')); filas.push(fila); }
  return filas;
}

export function contieneSecretos(texto: string, cuentas: CuentaFixture[]) {
  return /hash_?contrasena|hashContrasena|hash_?token|version_?token|versionToken|gt_sesion|\$argon2/i.test(texto) ||
    cuentas.some((c) => [c.hashContrasena, c.token, sha256(c.token), contrasenaCuenta].some((valor) => texto.includes(valor)));
}
