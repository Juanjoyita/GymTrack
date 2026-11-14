import { EjerciciosRealizadosService } from '../../src/entrenamientos/ejercicios-realizados.service';
import { SeriesService } from '../../src/entrenamientos/series.service';
import { UltimaSesionService } from '../../src/ejercicios/ultima-sesion.service';

type TestRow = {
  id: string; entrenamiento_id: string; ejercicio_id: string; ejercicio_realizado_id: string;
  posicion: number; orden: number; repeticiones: number; peso_kg: string; registrada_en: Date;
  nota: string | null; terminado_en: Date | null; volumen_notificado_kg: string | null; version: number;
};
const row = (overrides: Record<string, unknown> = {}): TestRow => ({
  id: 'r1', entrenamiento_id: 'w1', ejercicio_id: 'e1', ejercicio_realizado_id: 'er1',
  posicion: 1, orden: 1, repeticiones: 8, peso_kg: '60.0000', registrada_en: new Date('2026-11-14T10:00:00Z'),
  nota: null, terminado_en: null, volumen_notificado_kg: null, version: 1, ...overrides,
});
async function expectHttpError(promise: Promise<unknown>, status: number, codigo: string, actualVersion?: number) {
  let error: { getStatus(): number; getResponse(): unknown } | undefined;
  try { await promise; } catch (caught) { error = caught as typeof error; }
  expect(error).toBeDefined();
  expect(error?.getStatus()).toBe(status);
  expect(error?.getResponse()).toMatchObject({ codigo, ...(actualVersion === undefined ? {} : { actual: { version: actualVersion } }) });
}

describe('T020/T021 ejercicios realizados y series', () => {
  it('crea ejercicio realizado, actualiza orden/nota de forma versionada y elimina con cascada', async () => {
    let stored: TestRow | null = row({ id: 'er1', entrenamiento_id: 'w1', version: 1 });
    const sql = jest.fn(async (query: string) => {
      if (query.includes('INSERT INTO ejercicio_realizado')) return [stored];
      if (query.includes('UPDATE ejercicio_realizado')) { stored = { ...stored!, posicion: 2, nota: 'nota', version: 2 }; return [[stored], 1]; }
      if (query.includes('DELETE FROM ejercicio_realizado')) { stored = null; return [[{ id: 'er1' }], 1]; }
      if (query.includes('SELECT er.*')) return stored ? [stored] : [];
      return [];
    });
    const er = { findOne: jest.fn().mockResolvedValue(null), manager: { query: sql } };
    const workouts = { findOne: jest.fn().mockResolvedValue({ id: 'w1', usuario_id: 'u1' }) };
    const exercises = { findOne: jest.fn().mockResolvedValue({ id: 'e1', usuario_id: null }) };
    const service = new EjerciciosRealizadosService(workouts as never, er as never, exercises as never);
    await expect(service.crear('u1', 'w1', { id: 'er1', ejercicioId: 'e1', posicion: 1 })).resolves.toMatchObject({ id: 'er1' });
    await expect(service.actualizar('u1', 'w1', 'er1', { posicion: 2, nota: 'nota', version: 1 }))
      .resolves.toMatchObject({ posicion: 2, nota: 'nota', version: 2 });
    await service.eliminar('u1', 'w1', 'er1', 2);
    expect(sql.mock.calls.map(([query]) => query)).toEqual(expect.arrayContaining([expect.stringContaining('version = $3'), expect.stringContaining('RETURNING er.id')]));
  });

  it('rechaza ejercicio privado ajeno y UUID de ejercicio realizado con jerarquía incompatible', async () => {
    const er = { findOne: jest.fn().mockResolvedValue(null), manager: { query: jest.fn() } };
    const workouts = { findOne: jest.fn().mockResolvedValue({ id: 'w1', usuario_id: 'u1' }) };
    const exercises = { findOne: jest.fn().mockResolvedValue({ id: 'e1', usuario_id: 'u2' }) };
    const service = new EjerciciosRealizadosService(workouts as never, er as never, exercises as never);
    await expectHttpError(service.crear('u1', 'w1', { id: 'er1', ejercicioId: 'e1', posicion: 1 }), 404, 'NO_ENCONTRADO');
    expect(er.manager.query).not.toHaveBeenCalled();

    const lookup = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    er.findOne.mockResolvedValue(row({ id: 'er1' }));
    (er as { createQueryBuilder?: jest.Mock }).createQueryBuilder = jest.fn().mockReturnValue(lookup);
    await expectHttpError(service.crear('u1', 'w1', { id: 'er1', ejercicioId: 'other-exercise', posicion: 1 }), 404, 'NO_ENCONTRADO');
  });

  it('trata UUID de ejercicio realizado como reintento solo si jerarquía y operación coinciden', async () => {
    const winner = row({ id: 'er1', entrenamiento_id: 'w1', ejercicio_id: 'e1', posicion: 1 });
    const lookup = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(winner) };
    const er = { findOne: jest.fn().mockResolvedValue(winner), createQueryBuilder: jest.fn().mockReturnValue(lookup), manager: { query: jest.fn() } };
    const service = new EjerciciosRealizadosService(
      { findOne: jest.fn().mockResolvedValue({ id: 'w1', usuario_id: 'u1' }) } as never,
      er as never,
      { findOne: jest.fn() } as never,
    );
    await expect(service.crear('u1', 'w1', { id: 'er1', ejercicioId: 'e1', posicion: 1 })).resolves.toBe(winner);
    lookup.getOne.mockResolvedValue(null);
    await expectHttpError(service.crear('u1', 'w1', { id: 'er1', ejercicioId: 'e2', posicion: 1 }), 404, 'NO_ENCONTRADO');
  });

  function seriesFixture() {
    const stored = new Map<string, ReturnType<typeof row>>();
    let current = row();
    const managerQuery = jest.fn(async (query: string, params: unknown[]) => {
      if (query.includes('SELECT id FROM entrenamiento')) return [{ id: 'w1' }];
      if (query.includes('SELECT id FROM ejercicio_realizado')) return [{ id: 'er1' }];
      if (query.includes('INSERT INTO serie')) {
        const [id, erId, orden, repeticiones, peso, date] = params as [string, string, number, number, string, Date];
        if (stored.has(id)) return [];
        const inserted = row({ id, ejercicio_realizado_id: erId, orden, repeticiones, peso_kg: peso, registrada_en: date });
        stored.set(id, inserted); return [inserted];
      }
      if (query.includes('SELECT s.*')) {
        const existing = stored.get(params[0] as string);
        return existing && existing.ejercicio_realizado_id === params[1] && params[2] === 'w1' && params[3] === 'u1' ? [existing] : [];
      }
      return [];
    });
    const repo = { createQueryBuilder: jest.fn(), create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
    const ownedQuery = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => current) };
    repo.createQueryBuilder.mockReturnValue(ownedQuery);
    const writes = jest.fn(async (query: string, params: unknown[]) => {
      if (query.includes('UPDATE serie')) {
        if (current.version !== params[2]) return [[], 0];
        current = { ...current, orden: (params[4] as boolean) ? params[5] as number : current.orden,
          repeticiones: params[6] as number, peso_kg: params[7] as string, version: current.version + 1 };
        return [[current], 1];
      }
      if (query.includes('DELETE FROM serie')) { if (current.version !== params[2]) return [[], 0]; return [[{ id: current.id }], 1]; }
      return [];
    });
    const source = {
      transaction: (fn: (m: unknown) => unknown) => fn({ query: managerQuery }),
      query: writes,
    };
    return { service: new SeriesService(repo as never, source as never), stored, managerQuery, repo, writes, ownedQuery,
      setCurrent: (value: ReturnType<typeof row>) => { current = value; }, getCurrent: () => current };
  }
  const input = (id: string, order = 1, reps = 8, value = 60, unit: 'kg' | 'lb' = 'kg') => ({
    id, orden: order, repeticiones: reps, pesoEntrada: { valor: value, unidad: unit }, registradaEn: '2026-11-14T10:00:00Z',
  });

  it('valida V4, conserva cero y convierte libras a kg con valor numérico', async () => {
    const { service } = seriesFixture();
    const libras = await service.crear('u1', 'w1', 'er1', input('lb', 1, 8, 132.28, 'lb'));
    expect(Number(libras.serie.peso_kg)).toBeCloseTo(60.0012, 4);
    await expect(service.crear('u1', 'w1', 'er1', input('zero', 2, 1, 0))).resolves.toMatchObject({ serie: { peso_kg: '0.0000' } });
    for (const bad of [input('r0', 3, 0), input('r101', 3, 101), input('negative', 3, 8, -1), input('precision', 3, 8, 60.125), input('over', 3, 8, 1102.32, 'lb')]) {
      await expectHttpError(service.crear('u1', 'w1', 'er1', bad), 400, 'VALIDACION');
    }
  });

  it('guarda dos series distintas concurrentes y evita duplicar UUID en reintento', async () => {
    const { service, stored, managerQuery } = seriesFixture();
    const [a, b] = await Promise.all([
      service.crear('u1', 'w1', 'er1', input('s1', 1)),
      service.crear('u1', 'w1', 'er1', input('s2', 2, 10, 50)),
    ]);
    expect(a.creado).toBe(true); expect(b.creado).toBe(true); expect(stored.size).toBe(2);
    const again = await service.crear('u1', 'w1', 'er1', input('s1', 1));
    expect(again.creado).toBe(false); expect(again.serie.id).toBe('s1');
    await expectHttpError(service.crear('u1', 'w1', 'er1', input('s1', 3)), 404, 'NO_ENCONTRADO');
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id) DO NOTHING'), expect.any(Array));
  });

  it('aplica PATCH con versión esperada una sola vez y DELETE obsoleto devuelve actual', async () => {
    const fixture = seriesFixture();
    const { service, writes, setCurrent, getCurrent, ownedQuery } = fixture;
    const concurrent = await Promise.allSettled([
      service.actualizar('u1', 'w1', 'er1', 'r1', { version: 1, orden: 2 }),
      service.actualizar('u1', 'w1', 'er1', 'r1', { version: 1, repeticiones: 9 }),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(getCurrent().version).toBe(2);
    expect(writes.mock.calls[0][0]).toContain('s.version=$3');
    await expectHttpError(service.actualizar('u1', 'w1', 'er1', 'r1', { version: 1, repeticiones: 10 }), 409, 'CONFLICTO_VERSION', 2);
    expect([8, 9]).toContain(getCurrent().repeticiones);
    await expectHttpError(service.eliminar('u1', 'w1', 'er1', 'r1', 1), 409, 'CONFLICTO_VERSION', 2);
    ownedQuery.getOne.mockImplementation(async () => null as unknown as TestRow);
    setCurrent(row({ version: 3 }));
    await expectHttpError(service.eliminar('otro', 'w1', 'er1', 'r1', 1), 404, 'NO_ENCONTRADO');
  });
});

describe('T022 prellenado de última sesión', () => {
  it('devuelve la sesión finalizada más reciente, excluye sesiones actuales y ordena sus series', async () => {
    const source = { query: jest.fn().mockResolvedValue([
      { entrenamientoId: 'previa', fecha: '2026-11-14T09:00:00Z', orden: 1, repeticiones: 8, pesoKg: '60.0000' },
      { entrenamientoId: 'previa', fecha: '2026-11-14T09:00:00Z', orden: 2, repeticiones: 6, pesoKg: '65.0000' },
    ]) };
    const service = new UltimaSesionService(source as never);
    await expect(service.obtener('u1', 'e1', 'actual')).resolves.toEqual({
      entrenamientoId: 'previa', fecha: new Date('2026-11-14T09:00:00Z'),
      series: [{ orden: 1, repeticiones: 8, pesoKg: 60 }, { orden: 2, repeticiones: 6, pesoKg: 65 }],
    });
    expect(source.query.mock.calls[0][0]).toContain("t.estado='finalizado'");
    expect(source.query.mock.calls[0][0]).toContain('t.id <> $3');
    expect(source.query.mock.calls[0][1]).toEqual(['e1', 'u1', 'actual']);
    expect(source.query.mock.calls[0][0]).toContain('ORDER BY s.orden, s.id');
  });

  it('devuelve null si el ejercicio propio/de catálogo no tiene sesiones finalizadas y oculta ejercicios ajenos', async () => {
    const source = { query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'e1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]) };
    const service = new UltimaSesionService(source as never);
    await expect(service.obtener('u1', 'e1')).resolves.toBeNull();
    await expectHttpError(service.obtener('u1', 'privado-ajeno'), 404, 'NO_ENCONTRADO');
  });
});
