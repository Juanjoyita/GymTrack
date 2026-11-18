import { EntitySchema } from 'typeorm';

export interface TokenRecuperacionRow {
  id: string;
  usuario_id: string;
  hash_token: string;
  expira_en: Date;
  usado_en: Date | null;
  creado_en: Date;
  usuario?: object;
}

export const TokenRecuperacion = new EntitySchema<TokenRecuperacionRow>({
  name: "TokenRecuperacion",
  tableName: "token_recuperacion",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "usuario_id": {
    "type": "uuid"
  },
  "hash_token": {
    "type": "char",
    "length": 64,
    "unique": true,
    "select": false
  },
  "expira_en": {
    "type": "timestamptz"
  },
  "usado_en": {
    "type": "timestamptz",
    "nullable": true
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
    "name": "ck_token_recuperacion_expiracion_valida",
    "expression": "expira_en > creado_en"
  }
]
});
