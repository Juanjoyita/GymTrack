import { MigrationInterface, QueryRunner } from 'typeorm';

// Esquema inicial únicamente; el catálogo se carga en T018.
export class EsquemaInicial1794441600000 implements MigrationInterface {
  name = 'EsquemaInicial1794441600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE unidad_peso_enum AS ENUM ('kg', 'lb')`);
    await queryRunner.query(`CREATE TYPE grupo_muscular_enum AS ENUM ('pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'antebrazos', 'cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'abdomen')`);
    await queryRunner.query(`CREATE TYPE estado_entrenamiento_enum AS ENUM ('en_curso', 'finalizado')`);
    await queryRunner.query(`CREATE TABLE usuario (
  id uuid NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  hash_contrasena varchar(255) NOT NULL,
  version_token integer NOT NULL DEFAULT 0,
  unidad_peso unidad_peso_enum NOT NULL DEFAULT 'kg',
  zona_horaria varchar(64) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT ck_usuario_email_minusculas CHECK (email = lower(email)),
  CONSTRAINT ck_usuario_version_token_valida CHECK (version_token >= 0)
)`);
    await queryRunner.query(`CREATE TABLE ejercicio (
  id uuid NOT NULL,
  usuario_id uuid,
  nombre varchar(80) NOT NULL,
  nombre_normalizado varchar(80) NOT NULL,
  grupo_muscular grupo_muscular_enum NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_ejercicio_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT ck_ejercicio_nombre_valido CHECK (length(trim(nombre)) BETWEEN 1 AND 80),
  CONSTRAINT ck_ejercicio_normalizado_valido CHECK (length(nombre_normalizado) BETWEEN 1 AND 80)
)`);
    await queryRunner.query(`CREATE TABLE rutina (
  id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  nombre varchar(80) NOT NULL,
  dia_semana smallint NOT NULL,
  version integer NOT NULL DEFAULT 1,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_rutina_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT ck_rutina_dia_valido CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT ck_rutina_nombre_valido CHECK (length(trim(nombre)) BETWEEN 1 AND 80),
  CONSTRAINT ck_rutina_version_valida CHECK (version >= 1)
)`);
    await queryRunner.query(`CREATE TABLE entrenamiento (
  id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  estado estado_entrenamiento_enum NOT NULL DEFAULT 'en_curso',
  inicio timestamptz NOT NULL,
  fin timestamptz,
  zona_horaria varchar(64) NOT NULL,
  ultima_actividad_en timestamptz NOT NULL,
  nota varchar(1000),
  rutina_origen_id uuid,
  version integer NOT NULL DEFAULT 1,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_entrenamiento_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT fk_entrenamiento_rutina_origen_id FOREIGN KEY (rutina_origen_id) REFERENCES rutina(id) ON DELETE SET NULL,
  CONSTRAINT ck_entrenamiento_fechas_validas CHECK ((estado = 'en_curso' AND fin IS NULL) OR (estado = 'finalizado' AND fin IS NOT NULL AND fin >= inicio)),
  CONSTRAINT ck_entrenamiento_version_valida CHECK (version >= 1)
)`);
    await queryRunner.query(`CREATE TABLE ejercicio_realizado (
  id uuid NOT NULL,
  entrenamiento_id uuid NOT NULL,
  ejercicio_id uuid NOT NULL,
  posicion integer NOT NULL,
  nota varchar(1000),
  terminado_en timestamptz,
  volumen_notificado_kg numeric(12,4),
  version integer NOT NULL DEFAULT 1,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_ejercicio_realizado_entrenamiento_id FOREIGN KEY (entrenamiento_id) REFERENCES entrenamiento(id) ON DELETE CASCADE,
  CONSTRAINT fk_ejercicio_realizado_ejercicio_id FOREIGN KEY (ejercicio_id) REFERENCES ejercicio(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT ck_ejercicio_realizado_posicion_valida CHECK (posicion >= 1),
  CONSTRAINT ck_ejercicio_realizado_volumen_valido CHECK (volumen_notificado_kg IS NULL OR volumen_notificado_kg >= 0),
  CONSTRAINT ck_ejercicio_realizado_version_valida CHECK (version >= 1)
)`);
    await queryRunner.query(`CREATE TABLE serie (
  id uuid NOT NULL,
  ejercicio_realizado_id uuid NOT NULL,
  orden integer NOT NULL,
  repeticiones smallint NOT NULL,
  peso_kg numeric(8,4) NOT NULL,
  registrada_en timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_serie_ejercicio_realizado_id FOREIGN KEY (ejercicio_realizado_id) REFERENCES ejercicio_realizado(id) ON DELETE CASCADE,
  CONSTRAINT ck_serie_orden_valido CHECK (orden >= 1),
  CONSTRAINT ck_serie_repeticiones_validas CHECK (repeticiones BETWEEN 1 AND 100),
  CONSTRAINT ck_serie_peso_valido CHECK (peso_kg BETWEEN 0 AND 500),
  CONSTRAINT ck_serie_version_valida CHECK (version >= 1)
)`);
    await queryRunner.query(`CREATE TABLE rutina_ejercicio (
  rutina_id uuid NOT NULL,
  posicion integer NOT NULL,
  ejercicio_id uuid NOT NULL,
  PRIMARY KEY (rutina_id, posicion),
  CONSTRAINT fk_rutina_ejercicio_rutina_id FOREIGN KEY (rutina_id) REFERENCES rutina(id) ON DELETE CASCADE,
  CONSTRAINT fk_rutina_ejercicio_ejercicio_id FOREIGN KEY (ejercicio_id) REFERENCES ejercicio(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT ck_rutina_ejercicio_posicion_valida CHECK (posicion >= 1)
)`);
    await queryRunner.query(`CREATE TABLE token_recuperacion (
  id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  hash_token char(64) NOT NULL UNIQUE,
  expira_en timestamptz NOT NULL,
  usado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_token_recuperacion_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT ck_token_recuperacion_expiracion_valida CHECK (expira_en > creado_en)
)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_ejercicio_nombre ON ejercicio ((COALESCE(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid)), nombre_normalizado)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_entrenamiento_en_curso ON entrenamiento (usuario_id) WHERE estado = 'en_curso'`);
    await queryRunner.query(`CREATE INDEX ix_entrenamiento_usuario_inicio ON entrenamiento (usuario_id, inicio DESC)`);
    await queryRunner.query(`CREATE INDEX ix_ejercicio_realizado_ejercicio ON ejercicio_realizado (ejercicio_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE token_recuperacion");
    await queryRunner.query("DROP TABLE rutina_ejercicio");
    await queryRunner.query("DROP TABLE serie");
    await queryRunner.query("DROP TABLE ejercicio_realizado");
    await queryRunner.query("DROP TABLE entrenamiento");
    await queryRunner.query("DROP TABLE rutina");
    await queryRunner.query("DROP TABLE ejercicio");
    await queryRunner.query("DROP TABLE usuario");
    await queryRunner.query("DROP TYPE estado_entrenamiento_enum");
    await queryRunner.query("DROP TYPE grupo_muscular_enum");
    await queryRunner.query("DROP TYPE unidad_peso_enum");
  }
}
