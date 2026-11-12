import { EntitySchema } from 'typeorm';

export interface SerieRow {
  id: string;
  ejercicio_realizado_id: string;
  orden: number;
  repeticiones: number;
  peso_kg: string;
  registrada_en: Date;
  version: number;
  ejercicio_realizado?: object;
}

export const Serie = new EntitySchema<SerieRow>({
  name: "Serie",
  tableName: "serie",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "ejercicio_realizado_id": {
    "type": "uuid"
  },
  "orden": {
    "type": "integer"
  },
  "repeticiones": {
    "type": "smallint"
  },
  "peso_kg": {
    "type": "numeric",
    "precision": 8,
    "scale": 4
  },
  "registrada_en": {
    "type": "timestamptz"
  },
  "version": {
    "version": true,
    "type": "integer",
    "default": 1
  }
},
  relations: {
  "ejercicio_realizado": {
    "type": "many-to-one",
    "target": "EjercicioRealizado",
    "joinColumn": {
      "name": "ejercicio_realizado_id"
    },
    "onDelete": "CASCADE",
    "nullable": false
  }
},
  checks: [
  {
    "name": "ck_serie_orden_valido",
    "expression": "orden >= 1"
  },
  {
    "name": "ck_serie_repeticiones_validas",
    "expression": "repeticiones BETWEEN 1 AND 100"
  },
  {
    "name": "ck_serie_peso_valido",
    "expression": "peso_kg BETWEEN 0 AND 500"
  },
  {
    "name": "ck_serie_version_valida",
    "expression": "version >= 1"
  }
]
});
