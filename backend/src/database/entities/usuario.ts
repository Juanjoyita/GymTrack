import { EntitySchema } from 'typeorm';

export interface UsuarioRow {
  id: string;
  email: string;
  hash_contrasena: string;
  version_token: number;
  unidad_peso: 'kg' | 'lb';
  zona_horaria: string;
  creado_en: Date;
}

export const Usuario = new EntitySchema<UsuarioRow>({
  name: "Usuario",
  tableName: "usuario",
  columns: {
  "id": {
    "type": "uuid",
    "primary": true
  },
  "email": {
    "type": "varchar",
    "length": 254,
    "unique": true
  },
  "hash_contrasena": {
    "type": "varchar",
    "length": 255,
    "select": false
  },
  "version_token": {
    "type": "integer",
    "default": 0
  },
  "unidad_peso": {
    "type": "enum",
    "enum": [
      "kg",
      "lb"
    ],
    "enumName": "unidad_peso_enum",
    "default": "kg"
  },
  "zona_horaria": {
    "type": "varchar",
    "length": 64
  },
  "creado_en": {
    "type": "timestamptz",
    "default": () => "now()"
  }
},
  relations: {},
  checks: [
  {
    "name": "ck_usuario_email_minusculas",
    "expression": "email = lower(email)"
  },
  {
    "name": "ck_usuario_version_token_valida",
    "expression": "version_token >= 0"
  }
]
});
