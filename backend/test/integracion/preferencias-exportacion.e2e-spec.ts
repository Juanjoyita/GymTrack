import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CuentaService } from '../../src/cuenta/cuenta.service';
import { fuenteDatosIntegracion, prepararEsquemaIntegracion, limpiarEsquemaIntegracion } from '../utils/infraestructura';
import { sembrarCuenta, snapshotCuenta, contieneSecretos, leerCsv } from '../utils/cuenta-fixtures';

it('T047: módulo de servicio aislado cambia preferencias y exporta todos los datos sin tocar pesos ni ajenos', async () => {
  const source = await fuenteDatosIntegracion().initialize();
  await prepararEsquemaIntegracion(source);
  try {
    await source.runMigrations();
    const propio = await sembrarCuenta(source), ajeno = await sembrarCuenta(source);
    const antes = await snapshotCuenta(source, propio), otro = await snapshotCuenta(source, ajeno);
    const module = await Test.createTestingModule({ providers: [CuentaService, { provide: DataSource, useValue: source }] }).compile();
    try {
      const service = module.get(CuentaService);
      const usuario = await service.preferencias(propio.ids.usuario, { unidadPeso: 'lb' });
      expect(usuario.unidadPeso).toBe('lb');
      expect((await snapshotCuenta(source, propio)).serie).toEqual(antes.serie);
      const json = await service.exportar(propio.ids.usuario, 'json');
      const texto = JSON.stringify(json.contenido);
      expect(contieneSecretos(texto, [propio, ajeno])).toBe(false);
      for (const id of Object.values(propio.ids).filter((id) => id !== propio.ids.token)) expect(texto.includes(id)).toBe(true);
      expect(texto.includes(ajeno.ids.usuario)).toBe(false);
      const csv = await service.exportar(propio.ids.usuario, 'csv');
      const filas = leerCsv(String(csv.contenido));
      expect(filas).toHaveLength(3);
      expect(filas.some((fila) => fila.includes('60.125') && fila.includes('132.55'))).toBe(true);
      expect(JSON.stringify(await snapshotCuenta(source, ajeno)) === JSON.stringify(otro)).toBe(true);
    } finally { await module.close(); }
  } finally {
    await limpiarEsquemaIntegracion(source);
    if (source.isInitialized) await source.destroy();
  }
});
