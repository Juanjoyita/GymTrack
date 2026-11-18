interface RequestMetadata {
  method: string;
  route?: { path?: unknown };
}
interface ResponseMetadata {
  statusCode: number;
  once(event: 'finish', callback: () => void): void;
}

// Se registra antes del parser JSON para incluir también peticiones malformadas.
export function httpLogger(req: RequestMetadata, res: ResponseMetadata, next: () => void) {
  const inicio = performance.now();
  res.once('finish', () => {
    console.info(JSON.stringify({
      metodo: req.method,
      // Solo plantilla estática de Express, nunca originalUrl, params o query.
      ruta: typeof req.route?.path === 'string' ? req.route.path : 'SIN_RUTA',
      estado: res.statusCode,
      duracionMs: Math.round((performance.now() - inicio) * 100) / 100,
    }));
  });
  next();
}
