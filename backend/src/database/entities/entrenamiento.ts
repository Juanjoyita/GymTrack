import { EntitySchema } from 'typeorm';

export interface EntrenamientoRow {
  id: string;
  usuario_id: string;
  estado: 'en_curso' | 'finalizado';
  inicio: Date;
  fin: Date | null;
  zona_horaria: string;
  ultima_actividad_en: Date;
  nota: string | null;
  rutina_origen_id: string | null;
  version: number;
  creado_en: Date;
  usuario?: object;
  rutina_origen?: object;
}

export const Entrenamiento = new EntitySchema<EntrenamientoRow>({
  name: "Entrenamiento",
  tableName: "entrenamiento",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "usuario_id": {
    "type": "uuid"
  },
  "estado": {
    "type": "enum",
    "enum": [
      "en_curso",
      "finalizado"
    ],
    "enumName": "estado_entrenamiento_enum",
    "default": "en_curso"
  },
  "inicio": {
    "type": "timestamptz"
  },
  "fin": {
    "type": "timestamptz",
    "nullable": true
  },
  "zona_horaria": {
    "type": "varchar",
    "length": 64
  },
  "ultima_actividad_en": {
    "type": "timestamptz"
  },
  "nota": {
    "type": "varchar",
    "nullable": true,
    "length": 1000
  },
  "rutina_origen_id": {
    "type": "uuid",
    "nullable": true
  },
  "version": {
    "version": true,
    "type": "integer",
    "default": 1
  },
  "creado_en": {
    "type": "timestamptz",
    "default": () => "now()"
  }
},
  relations: {
  "usuario": {
    "type": "many-to-one",
    "target": "Usuario",
    "joinColumn": {
      "name": "usuario_id"
    },
    "onDelete": "CASCADE",
    "nullable": false
  },
  "rutina_origen": {
    "type": "many-to-one",
    "target": "Rutina",
    "joinColumn": {
      "name": "rutina_origen_id"
    },
    "onDelete": "SET NULL",
    "nullable": true
  }
},
  checks: [
  {
    "name": "ck_entrenamiento_fechas_validas",
    "expression": "(estado = 'en_curso' AND fin IS NULL) OR (estado = 'finalizado' AND fin IS NOT NULL AND fin >= inicio)"
  },
  {
    "name": "ck_entrenamiento_version_valida",
    "expression": "version >= 1"
  }
]
});
