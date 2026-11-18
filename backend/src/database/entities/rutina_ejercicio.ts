import { EntitySchema } from 'typeorm';

export interface RutinaEjercicioRow {
  rutina_id: string;
  posicion: number;
  ejercicio_id: string;
  rutina?: object;
  ejercicio?: object;
}

export const RutinaEjercicio = new EntitySchema<RutinaEjercicioRow>({
  name: "RutinaEjercicio",
  tableName: "rutina_ejercicio",
  columns: {
  "rutina_id": {
    "type": "uuid",
    "primary": true
  },
  "posicion": {
    "type": "integer",
    "primary": true
  },
  "ejercicio_id": {
    "type": "uuid"
  }
},
  relations: {
  "rutina": {
    "type": "many-to-one",
    "target": "Rutina",
    "joinColumn": {
      "name": "rutina_id"
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
    "name": "ck_rutina_ejercicio_posicion_valida",
    "expression": "posicion >= 1"
  }
]
});
