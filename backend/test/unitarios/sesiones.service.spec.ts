import { SesionesService } from '../../src/entrenamientos/sesiones.service';
import { Entrenamiento } from '../../src/database/entities/entrenamiento';
import { Serie } from '../../src/database/entities/serie';

describe('SesionesService', () => {
  const setup = (hasSeries = true) => {
    const repo: any = { create: jest.fn((x) => x), save: jest.fn(async (x) => x), findOne: jest.fn(), remove: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn() };
    const builder: any = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), returning: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({ affected: 1, raw: [{ id: 'i', nota: 'nota', version: 2 }] }) };
    repo.createQueryBuilder.mockReturnValue(builder);
    const txRepo: any = { findOne: jest.fn(), remove: jest.fn(), save: jest.fn(async (x) => x) };
    const seriesRepo: any = { createQueryBuilder: () => ({ innerJoin: () => ({ where: () => ({ getExists: async () => hasSeries }) }) }) };
    const manager: any = { getRepository: (entity: any) => entity === Entrenamiento ? txRepo : seriesRepo };
    const source: any = { transaction: (fn: any) => fn(manager) };
    return { service: new SesionesService(repo, source), repo, txRepo };
  };
  it('inicia y conserva fecha UTC, zona IANA y nota', async () => {
    const { service } = setup();
    await expect(service.iniciar('u', { id: 'i', inicio: '2026-11-10T18:00:00Z', zonaHoraria: 'America/Bogota', nota: 'n' }))
      .resolves.toMatchObject({ estado: 'en_curso', zona_horaria: 'America/Bogota', nota: 'n', inicio: new Date('2026-11-10T18:00:00Z') });
  });
  it('crea registro pasado finalizado', async () => {
    const { service } = setup();
    await expect(service.iniciar('u', { id: 'i', inicio: '2020-01-01T00:00:00Z', fin: '2020-01-01T01:00:00Z', zonaHoraria: 'UTC' }))
      .resolves.toMatchObject({ estado: 'finalizado', fin: new Date('2020-01-01T01:00:00Z') });
  });
  it('rechaza zona horaria que no es IANA', async () => {
    const { service } = setup();
    await expect(service.iniciar('u', { zonaHoraria: 'nada', inicio: new Date(), })).rejects.toMatchObject({ status: 400, response: { codigo: 'VALIDACION' } });
  });
  it('marca inactivo solo tras superar 12 horas', async () => {
    const { service, repo } = setup();
    const now = new Date('2026-11-13T12:00:00Z'); jest.useFakeTimers().setSystemTime(now);
    repo.findOne.mockResolvedValue({ ultima_actividad_en: new Date(now.getTime() - 12 * 3600000) });
    await expect(service.recuperar('u')).resolves.toMatchObject({ inactivo: false });
    repo.findOne.mockResolvedValue({ ultima_actividad_en: new Date(now.getTime() - 12 * 3600000 - 1) });
    await expect(service.recuperar('u')).resolves.toMatchObject({ inactivo: true });
    jest.useRealTimers();
  });
  it('finaliza inactivo con hora de última actividad y existente con hora actual', async () => {
    const { service, txRepo } = setup();
    const row = { id: 'i', inicio: new Date(Date.now() - 14 * 3600000), ultima_actividad_en: new Date(Date.now() - 13 * 3600000), estado: 'en_curso' };
    txRepo.findOne.mockResolvedValue(row);
    await expect(service.finalizar('u', 'i')).resolves.toMatchObject({ fin: row.ultima_actividad_en, estado: 'finalizado' });
  });
  it('descarta sesión vacía al finalizar', async () => {
    const { service, txRepo } = setup(false); txRepo.findOne.mockResolvedValue({ id: 'i' });
    await expect(service.finalizar('u', 'i')).resolves.toEqual({ descartado: true });
    expect(txRepo.remove).toHaveBeenCalled();
  });
  it('permite descartar explícitamente una sesión y actualiza nota propia', async () => {
    const { service, repo } = setup(); const row = { id: 'i', nota: null }; repo.findOne.mockResolvedValue(row);
    await service.actualizarNota('u', 'i', 'nota', 1);
    expect(repo.createQueryBuilder().where).toHaveBeenCalledWith('id = :id AND usuario_id = :usuarioId AND version = :version', { id: 'i', usuarioId: 'u', version: 1 });
    await service.descartar('u', 'i'); expect(repo.remove).toHaveBeenCalledWith(row);
  });
  it('convierte actualización condicional sin filas a conflicto de versión si existe recurso', async () => {
    const { service, repo } = setup();
    repo.createQueryBuilder().execute.mockResolvedValue({ affected: 0, raw: [] });
    repo.findOne.mockResolvedValue({ id: 'i', version: 2 });
    await expect(service.actualizarNota('u', 'i', 'nota', 1)).rejects.toMatchObject({ status: 409, response: { codigo: 'CONFLICTO_VERSION' } });
  });
  it('mantiene NO_ENCONTRADO para sesión ajena/inexistente tras actualización condicional', async () => {
    const { service, repo } = setup();
    repo.createQueryBuilder().execute.mockResolvedValue({ affected: 0, raw: [] }); repo.findOne.mockResolvedValue(null);
    await expect(service.actualizarNota('otro', 'i', 'nota', 1)).rejects.toMatchObject({ status: 404, response: { codigo: 'NO_ENCONTRADO' } });
  });
  it('rechaza una segunda sesión activa concurrente cuando la restricción única gana carrera', async () => {
    const { service, repo } = setup(); let calls = 0;
    repo.save.mockImplementation(async (row: any) => { if (++calls === 2) throw { driverError: { code: '23505' } }; return row; });
    const results = await Promise.allSettled([1, 2].map((n) => service.iniciar('u', { id: String(n), zonaHoraria: 'UTC' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('no traduce otra violación 23505 como sesión activa', async () => {
    const { service, repo } = setup();
    repo.save.mockRejectedValue({ driverError: { code: '23505', constraint: 'entrenamiento_pkey' } });
    await expect(service.iniciar('u', { id: 'i', zonaHoraria: 'UTC' })).rejects.toMatchObject({ driverError: { constraint: 'entrenamiento_pkey' } });
  });
  it('finalizar y descartar sesión ajena responden NO_ENCONTRADO', async () => {
    const { service, repo, txRepo } = setup();
    txRepo.findOne.mockResolvedValue(null); repo.findOne.mockResolvedValue(null);
    await expect(service.finalizar('otro', 'i')).rejects.toMatchObject({ status: 404, response: { codigo: 'NO_ENCONTRADO' } });
    await expect(service.descartar('otro', 'i')).rejects.toMatchObject({ status: 404, response: { codigo: 'NO_ENCONTRADO' } });
  });
});
