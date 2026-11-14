import { MigrationInterface, QueryRunner } from 'typeorm';

// Catálogo inicial de 50 ejercicios (data-model «Catálogo inicial», R-20). Identificadores fijos y
// nombres normalizados como literales: la migración no depende de cambios futuros del dominio.
// Columnas: id, nombre, nombre_normalizado, grupo_muscular.
const CATALOGO: ReadonlyArray<readonly [string, string, string, string]> = [
  // Pecho
  ['c0000000-0000-4000-8000-000000000001', 'Press de banca', 'press de banca', 'pecho'],
  ['c0000000-0000-4000-8000-000000000002', 'Press de banca inclinado', 'press de banca inclinado', 'pecho'],
  ['c0000000-0000-4000-8000-000000000003', 'Press de banca declinado', 'press de banca declinado', 'pecho'],
  ['c0000000-0000-4000-8000-000000000004', 'Press con mancuernas', 'press con mancuernas', 'pecho'],
  ['c0000000-0000-4000-8000-000000000005', 'Aperturas con mancuernas', 'aperturas con mancuernas', 'pecho'],
  ['c0000000-0000-4000-8000-000000000006', 'Cruce de poleas', 'cruce de poleas', 'pecho'],
  // Espalda
  ['c0000000-0000-4000-8000-000000000007', 'Dominadas', 'dominadas', 'espalda'],
  ['c0000000-0000-4000-8000-000000000008', 'Jalón al pecho', 'jalon al pecho', 'espalda'],
  ['c0000000-0000-4000-8000-000000000009', 'Remo con barra', 'remo con barra', 'espalda'],
  ['c0000000-0000-4000-8000-000000000010', 'Remo con mancuerna', 'remo con mancuerna', 'espalda'],
  ['c0000000-0000-4000-8000-000000000011', 'Remo en polea baja', 'remo en polea baja', 'espalda'],
  ['c0000000-0000-4000-8000-000000000012', 'Peso muerto', 'peso muerto', 'espalda'],
  ['c0000000-0000-4000-8000-000000000013', 'Pullover en polea', 'pullover en polea', 'espalda'],
  // Hombros
  ['c0000000-0000-4000-8000-000000000014', 'Press militar', 'press militar', 'hombros'],
  ['c0000000-0000-4000-8000-000000000015', 'Press de hombros con mancuernas', 'press de hombros con mancuernas', 'hombros'],
  ['c0000000-0000-4000-8000-000000000016', 'Elevaciones laterales', 'elevaciones laterales', 'hombros'],
  ['c0000000-0000-4000-8000-000000000017', 'Elevaciones frontales', 'elevaciones frontales', 'hombros'],
  ['c0000000-0000-4000-8000-000000000018', 'Pájaros (deltoides posterior)', 'pajaros (deltoides posterior)', 'hombros'],
  // Bíceps
  ['c0000000-0000-4000-8000-000000000019', 'Curl con barra', 'curl con barra', 'biceps'],
  ['c0000000-0000-4000-8000-000000000020', 'Curl con mancuernas', 'curl con mancuernas', 'biceps'],
  ['c0000000-0000-4000-8000-000000000021', 'Curl martillo', 'curl martillo', 'biceps'],
  ['c0000000-0000-4000-8000-000000000022', 'Curl en banco Scott', 'curl en banco scott', 'biceps'],
  // Tríceps
  ['c0000000-0000-4000-8000-000000000023', 'Fondos en paralelas', 'fondos en paralelas', 'triceps'],
  ['c0000000-0000-4000-8000-000000000024', 'Press francés', 'press frances', 'triceps'],
  ['c0000000-0000-4000-8000-000000000025', 'Extensión de tríceps en polea', 'extension de triceps en polea', 'triceps'],
  ['c0000000-0000-4000-8000-000000000026', 'Extensión de tríceps sobre la cabeza', 'extension de triceps sobre la cabeza', 'triceps'],
  ['c0000000-0000-4000-8000-000000000027', 'Press de banca con agarre cerrado', 'press de banca con agarre cerrado', 'triceps'],
  // Antebrazos
  ['c0000000-0000-4000-8000-000000000028', 'Curl de muñeca', 'curl de muneca', 'antebrazos'],
  ['c0000000-0000-4000-8000-000000000029', 'Curl de muñeca inverso', 'curl de muneca inverso', 'antebrazos'],
  // Cuádriceps
  ['c0000000-0000-4000-8000-000000000030', 'Sentadilla', 'sentadilla', 'cuadriceps'],
  ['c0000000-0000-4000-8000-000000000031', 'Sentadilla frontal', 'sentadilla frontal', 'cuadriceps'],
  ['c0000000-0000-4000-8000-000000000032', 'Prensa de piernas', 'prensa de piernas', 'cuadriceps'],
  ['c0000000-0000-4000-8000-000000000033', 'Extensión de cuádriceps', 'extension de cuadriceps', 'cuadriceps'],
  ['c0000000-0000-4000-8000-000000000034', 'Zancadas', 'zancadas', 'cuadriceps'],
  ['c0000000-0000-4000-8000-000000000035', 'Sentadilla búlgara', 'sentadilla bulgara', 'cuadriceps'],
  // Isquiotibiales
  ['c0000000-0000-4000-8000-000000000036', 'Peso muerto rumano', 'peso muerto rumano', 'isquiotibiales'],
  ['c0000000-0000-4000-8000-000000000037', 'Curl femoral tumbado', 'curl femoral tumbado', 'isquiotibiales'],
  ['c0000000-0000-4000-8000-000000000038', 'Curl femoral sentado', 'curl femoral sentado', 'isquiotibiales'],
  ['c0000000-0000-4000-8000-000000000039', 'Buenos días', 'buenos dias', 'isquiotibiales'],
  // Glúteos
  ['c0000000-0000-4000-8000-000000000040', 'Hip thrust', 'hip thrust', 'gluteos'],
  ['c0000000-0000-4000-8000-000000000041', 'Puente de glúteos', 'puente de gluteos', 'gluteos'],
  ['c0000000-0000-4000-8000-000000000042', 'Patada de glúteo en polea', 'patada de gluteo en polea', 'gluteos'],
  ['c0000000-0000-4000-8000-000000000043', 'Abducción de cadera en máquina', 'abduccion de cadera en maquina', 'gluteos'],
  // Gemelos
  ['c0000000-0000-4000-8000-000000000044', 'Elevación de talones de pie', 'elevacion de talones de pie', 'gemelos'],
  ['c0000000-0000-4000-8000-000000000045', 'Elevación de talones sentado', 'elevacion de talones sentado', 'gemelos'],
  // Abdomen
  ['c0000000-0000-4000-8000-000000000046', 'Crunch abdominal', 'crunch abdominal', 'abdomen'],
  ['c0000000-0000-4000-8000-000000000047', 'Elevación de piernas colgado', 'elevacion de piernas colgado', 'abdomen'],
  ['c0000000-0000-4000-8000-000000000048', 'Crunch en polea', 'crunch en polea', 'abdomen'],
  ['c0000000-0000-4000-8000-000000000049', 'Rueda abdominal', 'rueda abdominal', 'abdomen'],
  ['c0000000-0000-4000-8000-000000000050', 'Russian twist', 'russian twist', 'abdomen'],
];

export class CatalogoInicial1794528000000 implements MigrationInterface {
  name = 'CatalogoInicial1794528000000';

  // Idempotente: ON CONFLICT ignora filas ya cargadas (por id o por nombre del catálogo) sin tocar
  // ejercicios propios, cuya unicidad se evalúa por usuario.
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [id, nombre, nombreNormalizado, grupo] of CATALOGO) {
      await queryRunner.query(
        `INSERT INTO ejercicio (id, usuario_id, nombre, nombre_normalizado, grupo_muscular)
VALUES ($1, NULL, $2, $3, $4::grupo_muscular_enum) ON CONFLICT DO NOTHING`,
        [id, nombre, nombreNormalizado, grupo]
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM ejercicio WHERE usuario_id IS NULL AND id = ANY($1::uuid[])', [CATALOGO.map(([id]) => id)]);
  }
}
