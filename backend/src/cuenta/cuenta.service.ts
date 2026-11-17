import { verify } from 'argon2';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { esquemaEliminarCuenta, esquemaPreferencias, kgALb, redondearPesoParaMostrar } from '@gymtrack/domain';
import { ZodValidationPipe } from '../comun/zod-validation.pipe';
import { noAutenticado } from '../auth/auth.errors';
import { usuarioSesion } from '../auth/auth.types';
import { Usuario, type UsuarioRow } from '../database/entities/usuario';
import { Ejercicio } from '../database/entities/ejercicio';
import { Rutina } from '../database/entities/rutina';
import { Entrenamiento } from '../database/entities/entrenamiento';
import type { EjercicioRealizadoRow } from '../database/entities/ejercicio_realizado';
import type { SerieRow } from '../database/entities/serie';

type RealizadoExportable = EjercicioRealizadoRow & { nombre: string; grupo_muscular: string };
type RutinaEjercicioExportable = { rutina_id: string; posicion: number; ejercicio_id: string; nombre: string; grupo_muscular: string };
const csvCelda = (valor: unknown) => {
  // El apóstrofo fuerza texto en hojas de cálculo; solo se aplica al serializar CSV.
  const texto = typeof valor === 'string' && /^[=+\-@]/.test(valor) ? `'${valor}` : String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
};
function fechaLocal(fecha: Date, zonaHoraria: string) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

@Injectable()
export class CuentaService {
  constructor(private readonly source: DataSource) {}

  async preferencias(usuarioId: string, input: unknown) {
    const data = new ZodValidationPipe(esquemaPreferencias).transform(input);
    const [usuario] = await this.source.query<UsuarioRow[]>(`WITH actualizado AS (
      UPDATE usuario SET unidad_peso=COALESCE($2::unidad_peso_enum,unidad_peso),zona_horaria=COALESCE($3,zona_horaria)
      WHERE id=$1 RETURNING id,email,unidad_peso,zona_horaria) SELECT * FROM actualizado`, [usuarioId, data.unidadPeso ?? null, data.zonaHoraria ?? null]);
    if (!usuario) throw noAutenticado();
    return usuarioSesion(usuario);
  }

  async eliminar(usuarioId: string, input: unknown): Promise<void> {
    const { contrasena } = new ZodValidationPipe(esquemaEliminarCuenta).transform(input);
    await this.source.transaction(async (manager) => {
      const [usuario] = await manager.query<Array<{ hash_contrasena: string }>>(
        'SELECT hash_contrasena FROM usuario WHERE id=$1 FOR UPDATE', [usuarioId]);
      let valida = false;
      if (usuario) {
        try { valida = await verify(usuario.hash_contrasena, contrasena); } catch { /* Hash dañado: mismo 401. */ }
      }
      if (!valida) throw noAutenticado();
      // Las FK en cascada y las referencias diferibles se comprueban dentro de esta transacción.
      await manager.query('DELETE FROM usuario WHERE id=$1', [usuarioId]);
    });
  }

  private datos(usuarioId: string) {
    // Un único snapshot consistente, sin paginación y sin seleccionar credenciales ni tokens.
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const usuario = await manager.getRepository(Usuario).findOne({ where: { id: usuarioId }, select: {
        id: true, email: true, unidad_peso: true, zona_horaria: true, creado_en: true,
      } });
      if (!usuario) throw noAutenticado();
      const propios = await manager.getRepository(Ejercicio).find({ where: { usuario_id: usuarioId }, order: { id: 'ASC' } });
      const rutinas = await manager.getRepository(Rutina).find({ where: { usuario_id: usuarioId }, order: { dia_semana: 'ASC', id: 'ASC' } });
      const rutinaEjercicios = await manager.query<RutinaEjercicioExportable[]>(`SELECT re.rutina_id,re.posicion,re.ejercicio_id,e.nombre,e.grupo_muscular
        FROM rutina_ejercicio re JOIN rutina r ON r.id=re.rutina_id JOIN ejercicio e ON e.id=re.ejercicio_id
        WHERE r.usuario_id=$1 AND (e.usuario_id=$1 OR e.usuario_id IS NULL) ORDER BY re.rutina_id,re.posicion`, [usuarioId]);
      const entrenamientos = await manager.getRepository(Entrenamiento).find({ where: { usuario_id: usuarioId }, order: { inicio: 'ASC', id: 'ASC' } });
      const realizados = await manager.query<RealizadoExportable[]>(`SELECT er.id,er.entrenamiento_id,er.ejercicio_id,er.posicion,er.nota,
        er.terminado_en,er.volumen_notificado_kg,er.version,er.creado_en,e.nombre,e.grupo_muscular
        FROM ejercicio_realizado er JOIN entrenamiento t ON t.id=er.entrenamiento_id JOIN ejercicio e ON e.id=er.ejercicio_id
        WHERE t.usuario_id=$1 AND (e.usuario_id=$1 OR e.usuario_id IS NULL) ORDER BY er.entrenamiento_id,er.posicion,er.id`, [usuarioId]);
      const series = await manager.query<SerieRow[]>(`SELECT s.id,s.ejercicio_realizado_id,s.orden,s.repeticiones,s.peso_kg,s.registrada_en,s.version
        FROM serie s JOIN ejercicio_realizado er ON er.id=s.ejercicio_realizado_id JOIN entrenamiento t ON t.id=er.entrenamiento_id
        JOIN ejercicio e ON e.id=er.ejercicio_id WHERE t.usuario_id=$1 AND (e.usuario_id=$1 OR e.usuario_id IS NULL)
        ORDER BY s.ejercicio_realizado_id,s.orden,s.id`, [usuarioId]);
      // Lista explícita de campos en todos los niveles. Nunca serializar entidades de usuario completas.
      return {
        usuario: { ...usuarioSesion(usuario), creadoEn: usuario.creado_en },
        ejercicios: propios.map((e) => ({ id: e.id, nombre: e.nombre, nombreNormalizado: e.nombre_normalizado, grupoMuscular: e.grupo_muscular, creadoEn: e.creado_en })),
        rutinas: rutinas.map((r) => ({ id: r.id, nombre: r.nombre, diaSemana: r.dia_semana, version: r.version, creadoEn: r.creado_en,
          ejercicios: rutinaEjercicios.filter((e) => e.rutina_id === r.id).map((e) => ({ posicion: e.posicion, ejercicioId: e.ejercicio_id, nombre: e.nombre, grupoMuscular: e.grupo_muscular })) })),
        entrenamientos: entrenamientos.map((t) => ({ id: t.id, estado: t.estado, inicio: t.inicio, fin: t.fin, zonaHoraria: t.zona_horaria,
          ultimaActividadEn: t.ultima_actividad_en, nota: t.nota, rutinaOrigenId: t.rutina_origen_id, version: t.version, creadoEn: t.creado_en,
          ejercicios: realizados.filter((e) => e.entrenamiento_id === t.id).map((e) => ({ id: e.id, ejercicioId: e.ejercicio_id,
            nombre: e.nombre, grupoMuscular: e.grupo_muscular, posicion: e.posicion, nota: e.nota, terminadoEn: e.terminado_en,
            volumenNotificadoKg: e.volumen_notificado_kg === null ? null : Number(e.volumen_notificado_kg), version: e.version, creadoEn: e.creado_en,
            series: series.filter((s) => s.ejercicio_realizado_id === e.id).map((s) => ({ id: s.id, orden: s.orden, repeticiones: s.repeticiones,
              pesoKg: Number(s.peso_kg), registradaEn: s.registrada_en, version: s.version })) })) })),
      };
    });
  }

  async exportar(usuarioId: string, formato: unknown) {
    if (formato !== 'json' && formato !== 'csv') throw new BadRequestException({ codigo: 'VALIDACION', mensaje: 'Revisa los campos marcados.', campos: { formato: 'Selecciona json o csv.' }, actual: null });
    const datos = await this.datos(usuarioId);
    const nombre = `gymtrack-${new Date().toISOString().slice(0, 10)}.${formato}`;
    if (formato === 'json') return { nombre, tipo: 'application/json; charset=utf-8', contenido: datos };
    const filas: unknown[][] = [['fechaLocal', 'entrenamientoId', 'ejercicioId', 'ejercicio', 'grupoMuscular', 'orden', 'repeticiones', 'pesoKg', 'pesoLb', 'notaEntrenamiento', 'notaEjercicio']];
    for (const t of datos.entrenamientos) for (const e of t.ejercicios) for (const s of e.series) {
      filas.push([fechaLocal(t.inicio, t.zonaHoraria), t.id, e.ejercicioId, e.nombre, e.grupoMuscular, s.orden, s.repeticiones,
        s.pesoKg, redondearPesoParaMostrar(kgALb(s.pesoKg)), t.nota, e.nota]);
    }
    return { nombre, tipo: 'text/csv; charset=utf-8', contenido: filas.map((fila) => fila.map(csvCelda).join(',')).join('\r\n') + '\r\n' };
  }
}
