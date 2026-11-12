import { EntitySchema } from 'typeorm';

export interface EjercicioRow {
  id: string;
  usuario_id: string | null;
  nombre: string;
  nombre_normalizado: string;
  grupo_muscular: 'pecho' | 'espalda' | 'hombros' | 'biceps' | 'triceps' | 'antebrazos' | 'cuadriceps' | 'isquiotibiales' | 'gluteos' | 'gemelos' | 'abdomen';
  creado_en: Date;
  usuario?: object;
}

export const Ejercicio = new EntitySchema<EjercicioRow>({
  name: "Ejercicio",
  tableName: "ejercicio",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "usuario_id": {
    "type": "uuid",
    "nullable": true
  },
  "nombre": {
    "type": "varchar",
    "length": 80
  },
  "nombre_normalizado": {
    "type": "varchar",
    "length": 80
  },
  "grupo_muscular": {
    "type": "enum",
    "enum": [
      "pecho",
      "espalda",
      "hombros",
      "biceps",
      "triceps",
      "antebrazos",
      "cuadriceps",
      "isquiotibiales",
      "gluteos",
      "gemelos",
      "abdomen"
    ],
    "enumName": "grupo_muscular_enum"
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
    "nullable": true
  }
},
  checks: [
  {
    "name": "ck_ejercicio_nombre_valido",
    "expression": "length(trim(nombre)) BETWEEN 1 AND 80"
  },
  {
    "name": "ck_ejercicio_normalizado_valido",
    "expression": "length(nombre_normalizado) BETWEEN 1 AND 80"
  }
]
});
