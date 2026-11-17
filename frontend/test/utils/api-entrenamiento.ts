import { calcularMetricasProgreso, detectarRecordsPersonales } from '@gymtrack/domain';
import { vi } from 'vitest';

// API en memoria con estado según contracts/api.md («Entrenamientos — P1»): guarda, versiona, valida
// la versión esperada y descarta como el servidor. La usan las pruebas de T027, T028, T041, T042 y T049.
// El progreso y los récords se calculan con el dominio a partir de los entrenamientos finalizados.
export interface SerieApi { id: string; orden: number; repeticiones: number; pesoKg: number; registradaEn: string; version: number }
export interface RealizadoApi { id: string; ejercicioId: string; nombre: string; posicion: number; nota: string | null; terminadoEn: string | null; volumenNotificadoKg: number | null; version: number; series: SerieApi[] }
export interface EntrenamientoApi { id: string; estado: 'en_curso' | 'finalizado'; inicio: string; fin: string | null; zonaHoraria: string; nota: string | null; rutinaOrigenId: null; inactivo: boolean; version: number; ejercicios: RealizadoApi[] }

export const PRESS = { id: '27000000-0000-4000-8000-000000000001', nombre: 'Press de banca', grupoMuscular: 'pecho', propio: false, ultimoUso: null };
export const SENTADILLA = { id: '27000000-0000-4000-8000-000000000002', nombre: 'Sentadilla', grupoMuscular: 'cuadriceps', propio: false, ultimoUso: null };

/** Contraseña de la cuenta de pruebas para DELETE /cuenta (T049). */
export const CONTRASENA = 'Demo-T049-2026!';
export const usuario = { id: '00000000-0000-4000-8000-000000000271', email: 't027@example.invalid', unidadPeso: 'kg' as 'kg' | 'lb', zonaHoraria: 'America/Bogota' };
/** Récords de un ejercicio sin sesiones anteriores (contrato «GET /progreso/:id/records»). */
export const SIN_RECORDS = { sesionesAnteriores: 0, pesoMax: null, unoRm: null, volumenSesion: null };

/**
 * entrenamiento: el que está en curso; pasados: finalizados (p. ej., registrados a posteriori);
 * records: récords fijos por ejercicio (T041; si no hay, se calculan con los finalizados); recordsFallan y
 * progresoFalla: esas consultas responden 500; cuentaFalla: las operaciones de cuenta responden 500.
 */
export const servidor: { entrenamiento: EntrenamientoApi | null; pasados: EntrenamientoApi[]; ultimas: Record<string, unknown>; records: Record<string, unknown>; recordsFallan?: boolean; progresoFalla?: boolean; cuentaFalla?: boolean; cuentaEliminada?: boolean; sinRed: boolean; ultimaLenta?: Promise<void>; ejercicioLento?: Promise<void>; peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] } = { entrenamiento: null, pasados: [], ultimas: {}, records: {}, sinRed: false, peticiones: [] };

/** Estado inicial para cada prueba: sin entrenamiento, con red y usuario en kg. */
export function reiniciarServidor() {
  Object.assign(servidor, { entrenamiento: null, pasados: [], ultimas: {}, records: {}, recordsFallan: false, progresoFalla: false, cuentaFalla: false, cuentaEliminada: false, sinRed: false, ultimaLenta: undefined, ejercicioLento: undefined, peticiones: [] });
  usuario.unidadPeso = 'kg';
  usuario.zonaHoraria = 'America/Bogota';
}

function json(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' } });
}
const resumen = (e: EntrenamientoApi) => {
  const series = e.ejercicios.flatMap((x) => x.series);
  return { ejercicios: e.ejercicios.length, series: series.length, volumenKg: series.reduce((t, s) => t + s.pesoKg * s.repeticiones, 0), duracionMin: null };
};
const conResumen = (e: EntrenamientoApi) => ({ ...e, resumen: resumen(e) });
const PERIODOS_MESES: Record<string, number> = { '1m': 1, '3m': 3, '1a': 12 };
const error500 = () => json(500, { codigo: 'ERROR', mensaje: 'Error.', campos: null, actual: null });

/** Sesiones finalizadas de un ejercicio con sus métricas (como GET /progreso/:id). */
function metricas(ejercicioId: string, excluir?: string | null) {
  return calcularMetricasProgreso(servidor.pasados.filter((e) => e.id !== excluir).flatMap((e) => e.ejercicios
    .filter((r) => r.ejercicioId === ejercicioId && r.series.length)
    .map((r) => ({ entrenamientoId: e.id, fecha: e.inicio.slice(0, 10), series: r.series }))));
}

/** Último uso de cada ejercicio (en curso o finalizado), como en GET /ejercicios. */
function conUltimoUso<T extends { id: string }>(ejercicio: T) {
  const usos = [servidor.entrenamiento, ...servidor.pasados].filter((e) => e?.ejercicios.some((r) => r.ejercicioId === ejercicio.id)).map((e) => e!.inicio).sort();
  return { ...ejercicio, ultimoUso: usos.at(-1) ?? null };
}

const aKg = (p: { valor: number; unidad: 'kg' | 'lb' }) => (p.unidad === 'kg' ? p.valor : Number((p.valor / 2.2046226218487757).toFixed(4)));

export function instalarApi() {
  vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'https://localhost');
    const ruta = url.pathname.replace(/^\/api/, '');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (servidor.sinRed) throw new TypeError('Failed to fetch');
    servidor.peticiones.push({ metodo, ruta: `${ruta}${url.search}`, cuerpo });
    const enCurso = servidor.entrenamiento;
    if (servidor.cuentaEliminada) return json(401, { codigo: 'NO_AUTENTICADO', mensaje: 'No.', campos: null, actual: null });
    if (ruta === '/auth/yo') return json(200, usuario);
    if (metodo === 'DELETE' && ruta === '/cuenta') {
      if (servidor.cuentaFalla) return error500();
      if (cuerpo?.contrasena !== CONTRASENA) return json(401, { codigo: 'NO_AUTENTICADO', mensaje: 'Credenciales incorrectas.', campos: null, actual: null });
      Object.assign(servidor, { cuentaEliminada: true, entrenamiento: null, pasados: [] });
      return json(204);
    }
    if (metodo === 'PATCH' && ruta === '/cuenta/preferencias') {
      if (servidor.cuentaFalla) return error500();
      // Como el servidor: solo unidadPeso y zonaHoraria; nunca toca los pesos guardados.
      if (Object.keys(cuerpo).some((k) => k !== 'unidadPeso' && k !== 'zonaHoraria') || (cuerpo.unidadPeso && !['kg', 'lb'].includes(cuerpo.unidadPeso))) {
        return json(400, { codigo: 'VALIDACION', mensaje: 'Datos no válidos.', campos: {}, actual: null });
      }
      Object.assign(usuario, cuerpo);
      return json(200, usuario);
    }
    if (metodo === 'GET' && ruta === '/exportacion') {
      if (servidor.cuentaFalla) return error500();
      const formato = url.searchParams.get('formato');
      if (formato !== 'json' && formato !== 'csv') return json(400, { codigo: 'VALIDACION', mensaje: 'Formato.', campos: { formato: 'json o csv' }, actual: null });
      const contenido = formato === 'json' ? JSON.stringify({ usuario: { id: usuario.id, email: usuario.email }, entrenamientos: servidor.pasados }) : 'fecha,ejercicio,orden,repeticiones,pesoKg\r\n2026-11-02,Press de banca,1,8,60\r\n';
      return new Response(contenido, { status: 200, headers: {
        'Content-Type': formato === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="gymtrack-2026-11-16.${formato}"`,
      } });
    }
    if (metodo === 'GET' && ruta === '/entrenamientos') {
      const elementos = [...servidor.pasados].sort((a, b) => b.inicio.localeCompare(a.inicio)).map((e) => ({ id: e.id, inicio: e.inicio, fin: e.fin, zonaHoraria: e.zonaHoraria, resumen: { ...resumen(e), duracionMin: 60 } }));
      return json(200, { elementos, siguienteCursor: null });
    }
    if (ruta === '/ejercicios') return json(200, [PRESS, SENTADILLA].map(conUltimoUso));
    const ultima = /^\/ejercicios\/([^/]+)\/ultima-sesion$/.exec(ruta);
    if (ultima) { await servidor.ultimaLenta; return json(200, servidor.ultimas[ultima[1]] ?? null); }
    const records = /^\/progreso\/([^/]+)\/records$/.exec(ruta);
    if (records) {
      if (servidor.recordsFallan || servidor.progresoFalla) return error500();
      return json(200, servidor.records[records[1]] ?? detectarRecordsPersonales(metricas(records[1], url.searchParams.get('excluirEntrenamientoId'))));
    }
    const progreso = /^\/progreso\/([^/]+)$/.exec(ruta);
    if (progreso) {
      if (servidor.progresoFalla) return error500();
      const periodo = url.searchParams.get('periodo') ?? 'todo';
      const desde = new Date(); desde.setMonth(desde.getMonth() - (PERIODOS_MESES[periodo] ?? 1200));
      const sesiones = metricas(progreso[1]).filter((m) => periodo === 'todo' || m.fecha >= desde.toISOString().slice(0, 10));
      return json(200, { ejercicioId: progreso[1], periodo, sesiones, suficientesParaTendencia: sesiones.length > 1 });
    }
    if (ruta === '/entrenamientos/en-curso') return enCurso ? json(200, conResumen(enCurso)) : json(204);
    if (metodo === 'POST' && ruta === '/entrenamientos' && cuerpo.fin) {
      const pasado: EntrenamientoApi = { id: cuerpo.id, estado: 'finalizado', inicio: cuerpo.inicio, fin: cuerpo.fin, zonaHoraria: cuerpo.zonaHoraria, nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [] };
      servidor.pasados.push(pasado);
      return json(201, conResumen(pasado));
    }
    if (metodo === 'POST' && ruta === '/entrenamientos') {
      if (enCurso) return json(409, { codigo: 'ENTRENAMIENTO_EN_CURSO', mensaje: 'Ya hay uno.', campos: null, actual: conResumen(enCurso) });
      servidor.entrenamiento = { id: cuerpo.id, estado: 'en_curso', inicio: cuerpo.inicio, fin: null, zonaHoraria: cuerpo.zonaHoraria, nota: null, rutinaOrigenId: null, inactivo: false, version: 1, ejercicios: [] };
      return json(201, conResumen(servidor.entrenamiento));
    }
    // Las rutas anidadas valen para el entrenamiento en curso y para los finalizados (FR-010).
    const id = /^\/entrenamientos\/([^/]+)/.exec(ruta)?.[1];
    const e = [servidor.entrenamiento, ...servidor.pasados].find((x) => x?.id === id) ?? null;
    if (!e) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
    const base = `/entrenamientos/${e.id}`;
    if (metodo === 'GET' && ruta === base) return json(200, conResumen(e));
    if (metodo === 'DELETE' && ruta === base) {
      if (Number(url.searchParams.get('version')) !== e.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: conResumen(e) });
      if (servidor.entrenamiento === e) servidor.entrenamiento = null; else servidor.pasados = servidor.pasados.filter((x) => x !== e);
      return json(204);
    }
    if (metodo === 'PATCH' && ruta === base) {
      if (cuerpo.version !== e.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: conResumen(e) });
      e.nota = cuerpo.nota; e.version += 1;
      return json(200, conResumen(e));
    }
    if (metodo === 'POST' && ruta === `${base}/finalizar`) {
      if (cuerpo.version !== e.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: conResumen(e) });
      if (servidor.entrenamiento === e) servidor.entrenamiento = null;
      if (!e.ejercicios.some((x) => x.series.length)) return json(200, { descartado: true });
      Object.assign(e, { estado: 'finalizado', fin: cuerpo.fin ?? new Date().toISOString(), version: e.version + 1 });
      servidor.pasados.push(e);
      for (const x of e.ejercicios.filter((r) => r.series.length)) {
        servidor.ultimas[x.ejercicioId] = { entrenamientoId: e.id, fecha: e.inicio, series: x.series.map(({ orden, repeticiones, pesoKg }) => ({ orden, repeticiones, pesoKg })) };
      }
      return json(200, conResumen(e));
    }
    if (metodo === 'POST' && ruta === `${base}/ejercicios`) {
      await servidor.ejercicioLento;
      const ej = [PRESS, SENTADILLA].find((x) => x.id === cuerpo.ejercicioId);
      const r: RealizadoApi = { id: cuerpo.id, ejercicioId: cuerpo.ejercicioId, nombre: ej?.nombre ?? '?', posicion: cuerpo.posicion, nota: null, terminadoEn: null, volumenNotificadoKg: null, version: 1, series: [] };
      e.ejercicios.push(r);
      return json(201, r);
    }
    const ejercicio = new RegExp(`^${base}/ejercicios/([^/]+)$`).exec(ruta);
    if (metodo === 'PATCH' && ejercicio) {
      const r = e.ejercicios.find((x) => x.id === ejercicio[1]);
      if (!r) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
      if (cuerpo.version !== r.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: r });
      if (cuerpo.nota !== undefined) r.nota = cuerpo.nota;
      if (cuerpo.terminado !== undefined) r.terminadoEn = cuerpo.terminado ? new Date().toISOString() : null;
      if (cuerpo.volumenNotificadoKg !== undefined) r.volumenNotificadoKg = cuerpo.volumenNotificadoKg;
      r.version += 1;
      return json(200, r);
    }
    const series = new RegExp(`^${base}/ejercicios/([^/]+)/series(?:/([^/]+))?$`).exec(ruta);
    if (series) {
      const realizado = e.ejercicios.find((x) => x.id === series[1]);
      if (!realizado) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
      if (metodo === 'POST') {
        const s = { id: cuerpo.id, orden: cuerpo.orden, repeticiones: cuerpo.repeticiones, pesoKg: aKg(cuerpo.pesoEntrada), registradaEn: cuerpo.registradaEn, version: 1 };
        realizado.series.push(s);
        return json(201, s);
      }
      const s = realizado.series.find((x) => x.id === series[2]);
      if (!s) return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
      const version = metodo === 'DELETE' ? Number(url.searchParams.get('version')) : cuerpo.version;
      if (version !== s.version) return json(409, { codigo: 'CONFLICTO_VERSION', mensaje: 'Versión.', campos: null, actual: s });
      if (metodo === 'DELETE') { realizado.series = realizado.series.filter((x) => x !== s); return json(204); }
      if (cuerpo.repeticiones !== undefined) s.repeticiones = cuerpo.repeticiones;
      if (cuerpo.pesoEntrada) s.pesoKg = aKg(cuerpo.pesoEntrada);
      s.version += 1;
      return json(200, s);
    }
    return json(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No.', campos: null, actual: null });
  }));
}
