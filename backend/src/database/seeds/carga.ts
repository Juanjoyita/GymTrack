import { hash, argon2id } from 'argon2';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../data-source';

export const CARGA_EMAIL = 'carga-500@example.invalid';
export const CARGA_PASSWORD = 'CargaSinteticaSoloDev2026!';
export const CARGA_USUARIO_ID = 'd1000000-0000-4000-8000-000000000001';
export const CARGA_EJERCICIO_ID = 'c0000000-0000-4000-8000-000000000001';
export const SESIONES_CARGA = 500;

function uuid(prefijo: string, indice: number): string {
  return `${prefijo}-0000-4000-8000-${String(indice).padStart(12, '0')}`;
}

function placeholders(cantidad: number, columnas: number): string {
  return Array.from({ length: cantidad }, (_, fila) =>
    `(${Array.from({ length: columnas }, (_valor, columna) => `$${fila * columnas + columna + 1}`).join(',')})`,
  ).join(',');
}

async function sembrarCarga(): Promise<void> {
  const entorno = process.env.NODE_ENV ?? 'development';
  if (entorno !== 'development' && entorno !== 'test') {
    throw new Error('La carga sintética solo se permite con NODE_ENV=development o NODE_ENV=test.');
  }
  process.env.NODE_ENV = entorno;

  const source = new DataSource(databaseOptions());
  await source.initialize();
  try {
    await source.runMigrations();
    const [ejercicio] = await source.query<Array<{ id: string }>>(
      'SELECT id FROM ejercicio WHERE id=$1 AND usuario_id IS NULL',
      [CARGA_EJERCICIO_ID],
    );
    if (!ejercicio) throw new Error('Falta Press de banca en el catálogo; ejecuta las migraciones.');

    const colisiones = await source.query<Array<{ id: string; email: string }>>(
      'SELECT id,email FROM usuario WHERE id=$1 OR email=$2',
      [CARGA_USUARIO_ID, CARGA_EMAIL],
    );
    if (colisiones.some((cuenta) => cuenta.id !== CARGA_USUARIO_ID || cuenta.email !== CARGA_EMAIL)) {
      throw new Error('La cuenta sintética de carga colisiona con una cuenta distinta; no se modificaron datos.');
    }

    const hashContrasena = await hash(CARGA_PASSWORD, { type: argon2id });
    await source.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO usuario (id,email,hash_contrasena,zona_horaria)
         VALUES ($1,$2,$3,'America/Bogota')
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, hash_contrasena=EXCLUDED.hash_contrasena,
           zona_horaria=EXCLUDED.zona_horaria`,
        [CARGA_USUARIO_ID, CARGA_EMAIL, hashContrasena],
      );
      await manager.query('DELETE FROM entrenamiento WHERE usuario_id=$1', [CARGA_USUARIO_ID]);
      await manager.query('DELETE FROM rutina WHERE usuario_id=$1', [CARGA_USUARIO_ID]);

      const inicioBase = Date.parse('2025-01-01T18:00:00.000Z');
      const sesiones: unknown[] = [];
      const realizados: unknown[] = [];
      const series: unknown[] = [];
      for (let indice = 1; indice <= SESIONES_CARGA; indice += 1) {
        const entrenamientoId = uuid('d2000000', indice);
        const realizadoId = uuid('d3000000', indice);
        const inicio = new Date(inicioBase + (indice - 1) * 24 * 60 * 60 * 1000);
        const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
        sesiones.push(entrenamientoId, CARGA_USUARIO_ID, 'finalizado', inicio, fin, 'America/Bogota', fin);
        realizados.push(realizadoId, entrenamientoId, CARGA_EJERCICIO_ID, 1);
        for (let orden = 1; orden <= 3; orden += 1) {
          series.push(
            uuid('d4000000', (indice - 1) * 3 + orden),
            realizadoId,
            orden,
            8 + ((indice + orden) % 5),
            40 + (indice % 20) + orden * 2.5,
            new Date(inicio.getTime() + orden * 5 * 60 * 1000),
          );
        }
      }

      await manager.query(
        `INSERT INTO entrenamiento
         (id,usuario_id,estado,inicio,fin,zona_horaria,ultima_actividad_en)
         VALUES ${placeholders(SESIONES_CARGA, 7)}`,
        sesiones,
      );
      await manager.query(
        `INSERT INTO ejercicio_realizado (id,entrenamiento_id,ejercicio_id,posicion)
         VALUES ${placeholders(SESIONES_CARGA, 4)}`,
        realizados,
      );
      await manager.query(
        `INSERT INTO serie (id,ejercicio_realizado_id,orden,repeticiones,peso_kg,registrada_en)
         VALUES ${placeholders(SESIONES_CARGA * 3, 6)}`,
        series,
      );
    });

    console.log(`Carga sintética lista: ${SESIONES_CARGA} entrenamientos y ${SESIONES_CARGA * 3} series para una cuenta de prueba.`);
  } finally {
    await source.destroy();
  }
}

if (require.main === module) {
  sembrarCarga().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
