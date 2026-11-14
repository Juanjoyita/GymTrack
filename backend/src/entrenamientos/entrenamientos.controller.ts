import { Body, ConflictException, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { PeticionAutenticada } from '../auth/auth.types';
import { noAutenticado } from '../auth/auth.errors';
import type { EjercicioRealizadoRow } from '../database/entities/ejercicio_realizado';
import type { SerieRow } from '../database/entities/serie';
import { SesionesService } from './sesiones.service';
import { EjerciciosRealizadosService } from './ejercicios-realizados.service';
import { SeriesService } from './series.service';
import { PresentacionEntrenamientos, serieDto } from './presentacion';
import { entero, fecha, invalido, nota, objeto, peso, uuid, versionQuery } from './entradas';

interface Respuesta { status(code: number): unknown }
const usuario = (req: PeticionAutenticada) => { if (!req.usuario) throw noAutenticado(); return req.usuario.id; };

@Controller('entrenamientos')
export class EntrenamientosController {
  constructor(private readonly sesiones: SesionesService, private readonly realizados: EjerciciosRealizadosService,
    private readonly series: SeriesService, private readonly presentacion: PresentacionEntrenamientos) {}

  private async conflicto<T>(action: () => Promise<T>, map: (actual: unknown) => unknown | Promise<unknown>) {
    try { return await action(); }
    catch (error) {
      if (error instanceof ConflictException) {
        const detail = error.getResponse();
        if (typeof detail === 'object' && 'actual' in detail && detail.actual && 'codigo' in detail && detail.codigo === 'CONFLICTO_VERSION') {
          throw new ConflictException({ ...detail, actual: await map(detail.actual) });
        }
      }
      throw error;
    }
  }

  @Post()
  async iniciar(@Req() req: PeticionAutenticada, @Body() input: unknown, @Res({ passthrough: true }) response: Respuesta) {
    const user = usuario(req), body = objeto(input), id = uuid(body.id);
    const inicio = body.inicio === undefined ? undefined : fecha(body.inicio, 'inicio');
    const fin = body.fin === undefined ? undefined : fecha(body.fin, 'fin');
    if (typeof body.zonaHoraria !== 'string' || !body.zonaHoraria.trim() || body.zonaHoraria.length > 64) throw invalido('zonaHoraria');
    if (body.rutinaId !== undefined && body.rutinaId !== null) throw invalido('rutinaId'); // P5 se integra en su tarea.
    try {
      const result = await this.sesiones.iniciarConEstado(user, { id, inicio, fin, zonaHoraria: body.zonaHoraria, nota: body.nota === undefined ? undefined : nota(body.nota) });
      response.status(result.creado ? 201 : 200);
    } catch (error) {
      if (error instanceof ConflictException) {
        const active = await this.sesiones.recuperar(user);
        throw new ConflictException({ codigo: 'ENTRENAMIENTO_EN_CURSO', mensaje: 'Ya existe un entrenamiento en curso.', campos: null,
          actual: active ? await this.presentacion.entrenamiento(user, active.id) : null });
      }
      throw error;
    }
    return this.presentacion.entrenamiento(user, id);
  }

  @Get('en-curso')
  async recuperar(@Req() req: PeticionAutenticada, @Res({ passthrough: true }) response: Respuesta) {
    const user = usuario(req), row = await this.sesiones.recuperar(user);
    if (!row) { response.status(204); return; }
    return this.presentacion.entrenamiento(user, row.id);
  }

  @Patch(':id')
  async actualizar(@Req() req: PeticionAutenticada, @Param('id') id: string, @Body() input: unknown) {
    uuid(id); const user = usuario(req), body = objeto(input);
    if (body.inicio !== undefined || body.fin !== undefined) throw invalido('inicio'); // Correcciones de fecha: P2.
    await this.conflicto(() => this.sesiones.actualizarNota(user, id, nota(body.nota), entero(body.version, 'version')),
      () => this.presentacion.entrenamiento(user, id));
    return this.presentacion.entrenamiento(user, id);
  }

  @Post(':id/finalizar')
  @HttpCode(200)
  async finalizar(@Req() req: PeticionAutenticada, @Param('id') id: string, @Body() input: unknown) {
    uuid(id); const user = usuario(req), body = objeto(input);
    const result = await this.conflicto(() => this.sesiones.finalizar(user, id, body.fin === undefined ? undefined : fecha(body.fin, 'fin'), entero(body.version, 'version')),
      () => this.presentacion.entrenamiento(user, id));
    return 'descartado' in result ? result : this.presentacion.entrenamiento(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async descartar(@Req() req: PeticionAutenticada, @Param('id') id: string, @Query('version') version: unknown) {
    uuid(id); const user = usuario(req);
    await this.conflicto(() => this.sesiones.descartar(user, id, versionQuery(version)), () => this.presentacion.entrenamiento(user, id));
  }

  @Post(':id/ejercicios')
  async crearEjercicio(@Req() req: PeticionAutenticada, @Param('id') id: string, @Body() input: unknown, @Res({ passthrough: true }) response: Respuesta) {
    uuid(id); const body = objeto(input);
    const result = await this.realizados.crearConEstado(usuario(req), id, { id: uuid(body.id), ejercicioId: uuid(body.ejercicioId, 'ejercicioId'), posicion: entero(body.posicion, 'posicion') });
    response.status(result.creado ? 201 : 200);
    return this.presentacion.ejercicio(result.ejercicio);
  }

  @Patch(':id/ejercicios/:erId')
  async actualizarEjercicio(@Req() req: PeticionAutenticada, @Param('id') id: string, @Param('erId') erId: string, @Body() input: unknown) {
    uuid(id); uuid(erId, 'erId'); const body = objeto(input);
    if (body.terminado !== undefined && typeof body.terminado !== 'boolean') throw invalido('terminado');
    if (body.volumenNotificadoKg !== undefined && (typeof body.volumenNotificadoKg !== 'number' || !Number.isFinite(body.volumenNotificadoKg) || body.volumenNotificadoKg < 0)) throw invalido('volumenNotificadoKg');
    const row = await this.conflicto(() => this.realizados.actualizar(usuario(req), id, erId, { version: entero(body.version, 'version'),
      ...(body.posicion !== undefined ? { posicion: entero(body.posicion, 'posicion') } : {}),
      ...(body.nota !== undefined ? { nota: nota(body.nota) } : {}), terminado: body.terminado as boolean | undefined, volumenNotificadoKg: body.volumenNotificadoKg as number | undefined }),
    (actual) => this.presentacion.ejercicio(actual as EjercicioRealizadoRow));
    return this.presentacion.ejercicio(row);
  }

  @Delete(':id/ejercicios/:erId')
  @HttpCode(204)
  async eliminarEjercicio(@Req() req: PeticionAutenticada, @Param('id') id: string, @Param('erId') erId: string, @Query('version') version: unknown) {
    uuid(id); uuid(erId, 'erId');
    await this.conflicto(() => this.realizados.eliminar(usuario(req), id, erId, versionQuery(version)), (actual) => this.presentacion.ejercicio(actual as EjercicioRealizadoRow));
  }

  @Post(':id/ejercicios/:erId/series')
  async crearSerie(@Req() req: PeticionAutenticada, @Param('id') id: string, @Param('erId') erId: string, @Body() input: unknown, @Res({ passthrough: true }) response: Respuesta) {
    uuid(id); uuid(erId, 'erId'); const body = objeto(input);
    const result = await this.series.crear(usuario(req), id, erId, { id: uuid(body.id), orden: entero(body.orden, 'orden'),
      repeticiones: entero(body.repeticiones, 'repeticiones'), pesoEntrada: peso(body.pesoEntrada), registradaEn: fecha(body.registradaEn, 'registradaEn') });
    response.status(result.creado ? 201 : 200); return serieDto(result.serie);
  }

  @Patch(':id/ejercicios/:erId/series/:serieId')
  async actualizarSerie(@Req() req: PeticionAutenticada, @Param('id') id: string, @Param('erId') erId: string, @Param('serieId') serieId: string, @Body() input: unknown) {
    uuid(id); uuid(erId, 'erId'); uuid(serieId, 'serieId'); const body = objeto(input);
    const row = await this.conflicto(() => this.series.actualizar(usuario(req), id, erId, serieId, { version: entero(body.version, 'version'),
      ...(body.orden !== undefined ? { orden: entero(body.orden, 'orden') } : {}),
      ...(body.repeticiones !== undefined ? { repeticiones: entero(body.repeticiones, 'repeticiones') } : {}),
      ...(body.pesoEntrada !== undefined ? { pesoEntrada: peso(body.pesoEntrada) } : {}) }), (actual) => serieDto(actual as SerieRow));
    return serieDto(row);
  }

  @Delete(':id/ejercicios/:erId/series/:serieId')
  @HttpCode(204)
  async eliminarSerie(@Req() req: PeticionAutenticada, @Param('id') id: string, @Param('erId') erId: string, @Param('serieId') serieId: string, @Query('version') version: unknown) {
    uuid(id); uuid(erId, 'erId'); uuid(serieId, 'serieId');
    await this.conflicto(() => this.series.eliminar(usuario(req), id, erId, serieId, versionQuery(version)), (actual) => serieDto(actual as SerieRow));
  }
}
