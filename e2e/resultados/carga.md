# Evidencia T057 — Carga sintética reproducible

**Estado: completada.**

- `npm run db:seed:carga` crea 500 entrenamientos finalizados y 1.500 series para una cuenta
  sintética dedicada; el benchmark consulta estos datos.
- El seeder usa fechas e identificadores deterministas, y solo elimina entrenamientos y rutinas
  de su cuenta sintética. Una colisión con una cuenta distinta aborta sin modificar datos.
- Se ejecutó repetidamente con `NODE_ENV=test`; las ejecuciones recrearon el conjunto esperado.
- Se verificó el rechazo en `NODE_ENV=production` antes de conectar a la base de datos.
- El acceso está documentado en [quickstart.md](../../specs/001-registro-entrenamientos/quickstart.md).
- El resultado de las consultas sobre los 500 entrenamientos está en [rendimiento.md](./rendimiento.md).
