import { randomBytes } from 'node:crypto';

// Secreto efímero solo del runner; la aplicación sigue exigiendo configuración explícita.
if (process.env.NODE_ENV !== 'test') throw new Error('Este setup solo se ejecuta en pruebas.');
process.env.JWT_SECRET ??= randomBytes(32).toString('base64');
