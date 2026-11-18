-- Solo se ejecuta cuando PostgreSQL inicializa un volumen vacío.
-- No crea tablas de aplicación: el esquema corresponde a las migraciones T003.
SELECT 'CREATE DATABASE gymtrack_test OWNER gymtrack'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gymtrack_test')
\gexec
