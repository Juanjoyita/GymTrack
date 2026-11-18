import { EntitySchema } from 'typeorm';

export interface EjercicioRealizadoRow {
  id: string;
  entrenamiento_id: string;
  ejercicio_id: string;
  posicion: number;
  nota: string | null;
  terminado_en: Date | null;
  volumen_notificado_kg: string | null;
  version: number;
  creado_en: Date;
  entrenamiento?: object;
  ejercicio?: object;
}

export const EjercicioRealizado = new EntitySchema<EjercicioRealizadoRow>({
  name: "EjercicioRealizado",
  tableName: "ejercicio_realizado",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "entrenamiento_id": {
    "type": "uuid"
  },
  "ejercicio_id": {
    "type": "uuid"
  },
  "posicion": {
    "type": "integer"
  },
  "nota": {
    "type": "varchar",
    "nullable": true,
    "length": 1000
  },
  "terminado_en": {
    "type": "timestamptz",
    "nullable": true
  },
  "volumen_notificado_kg": {
    "type": "numeric",
    "nullable": true,
    "precision": 12,
    "scale": 4
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
  "entrenamiento": {
    "type": "many-to-one",
    "target": "Entrenamiento",
    "joinColumn": {
      "name": "entrenamiento_id"
    },
    "onDelete": "CASCADE",
    "nullable": false
  },
  "ejercicio": {
    "type": "many-to-one",
    "target": "Ejercicio",
    "joinColumn": {
      "name": "ejercicio_id"
    },
    "onDelete": "NO ACTION",
    "deferrable": "INITIALLY DEFERRED",
    "nullable": false
  }
},
  checks: [
  {
    "name": "ck_ejercicio_realizado_posicion_valida",
    "expression": "posicion >= 1"
  },
  {
    "name": "ck_ejercicio_realizado_volumen_valido",
    "expression": "volumen_notificado_kg IS NULL OR volumen_notificado_kg >= 0"
  },
  {
    "name": "ck_ejercicio_realizado_version_valida",
    "expression": "version >= 1"
  }
]
});
