export function opcionesCorreo(env: NodeJS.ProcessEnv = process.env) {
  const host = env.SMTP_HOST?.trim() || (env.NODE_ENV === 'production' ? '' : 'localhost');
  const port = Number(env.SMTP_PORT || 1025);
  const from = env.SMTP_FROM?.trim() || 'GymTrack <noreply@example.invalid>';
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(from)) {
    throw new Error('Configura SMTP_HOST, SMTP_PORT y SMTP_FROM válidos.');
  }
  const secure = env.SMTP_SECURE === 'true';
  const requireTLS = env.NODE_ENV === 'production' && !secure;
  const user = env.SMTP_USER?.trim(), pass = env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(pass)) throw new Error('Configura ambas credenciales SMTP o ninguna.');
  return { from, transporte: { host, port, secure, requireTLS,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
    logger: false as const, debug: false } };
}
