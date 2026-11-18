import { EntitySchema } from 'typeorm';

export interface RutinaRow {
  id: string;
  usuario_id: string;
  nombre: string;
  dia_semana: number;
  version: number;
  creado_en: Date;
  usuario?: object;
}

export const Rutina = new EntitySchema<RutinaRow>({
  name: "Rutina",
  tableName: "rutina",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "usuario_id": {
    "type": "uuid"
  },
  "nombre": {
    "type": "varchar",
    "length": 80
  },
  "dia_semana": {
    "type": "smallint"
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
  }
},
  checks: [
  {
    "name": "ck_rutina_dia_valido",
    "expression": "dia_semana BETWEEN 1 AND 7"
  },
  {
    "name": "ck_rutina_nombre_valido",
    "expression": "length(trim(nombre)) BETWEEN 1 AND 80"
  },
  {
    "name": "ck_rutina_version_valida",
    "expression": "version >= 1"
  }
]
});
