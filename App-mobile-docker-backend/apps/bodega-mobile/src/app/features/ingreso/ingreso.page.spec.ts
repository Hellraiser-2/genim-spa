import { TestBed } from '@angular/core/testing';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { existenciaEn } from '../../shared/formato';
import { IngresoPage } from './ingreso.page';

describe('IngresoPage', () => {
  let entorno: EntornoDePrueba;
  let pagina: IngresoPage;

  const enBodega = async (codigo: string) => existenciaEn(await entorno.variante(codigo), 'BODEGA');

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
    const fixture = TestBed.createComponent(IngresoPage);
    fixture.detectChanges();
    pagina = fixture.componentInstance;
  });

  it('agrega la variante escaneada y suma una unidad si ya estaba', async () => {
    const polera = await entorno.variante('RS-0001');

    pagina.agregar(polera);
    pagina.agregar(polera);
    pagina.agregar(await entorno.variante('RS-0003'));

    expect(pagina.lineas().map((l) => [l.variante.sku, l.cantidad])).toEqual([
      ['RS-0001', '2'],
      ['RS-0003', '1'],
    ]);
  });

  it('registra el ingreso de varias variantes y aumenta la existencia de la ubicación', async () => {
    pagina.agregar(await entorno.variante('RS-0001'));
    pagina.cambiarCantidad(1, '12');
    pagina.agregar(await entorno.variante('RS-0003'));

    await pagina.confirmar();

    expect(await enBodega('RS-0001')).toBe(24);
    expect(await enBodega('RS-0003')).toBe(5);
    expect(pagina.lineas()).toEqual([]);
    expect(entorno.avisos.mensajes).toEqual(['Ingreso registrado: 13 unidades en Bodega.']);
  });

  it('registra el ingreso en la sala de ventas cuando se elige esa ubicación', async () => {
    pagina.ubicacion.set('SALA_VENTAS');
    pagina.agregar(await entorno.variante('RS-0004'));

    await pagina.confirmar();

    expect(existenciaEn(await entorno.variante('RS-0004'), 'SALA_VENTAS')).toBe(1);
    expect(await enBodega('RS-0004')).toBe(6);
  });

  it.each(['0', '-3', '1.5', '', 'abc'])('no registra el ingreso con la cantidad no válida "%s"', async (cantidad) => {
    pagina.agregar(await entorno.variante('RS-0001'));
    pagina.cambiarCantidad(1, cantidad);
    const solicitudes = entorno.red.solicitudes;

    await pagina.confirmar();

    expect(pagina.hayCantidadesInvalidas()).toBe(true);
    expect(pagina.puedeConfirmar()).toBe(false);
    expect(entorno.red.solicitudes).toBe(solicitudes);
  });

  it('no permite confirmar un ingreso sin productos', () => {
    expect(pagina.puedeConfirmar()).toBe(false);
  });

  it('no agrega productos desactivados', async () => {
    pagina.agregar(await entorno.variante('RS-0006'));

    expect(pagina.lineas()).toEqual([]);
    expect(pagina.aviso()).toContain('desactivado');
  });

  it('conserva los datos e informa cuando la operación no se confirma por falla de conexión', async () => {
    pagina.agregar(await entorno.variante('RS-0001'));
    pagina.cambiarCantidad(1, '5');
    entorno.red.caida = true;

    await pagina.confirmar();

    expect(pagina.envio.error()).toContain('No hay conexión');
    expect(pagina.envio.reintentable()).toBe(true);
    expect(pagina.lineas().map((l) => l.cantidad)).toEqual(['5']);
    expect(pagina.bloqueado()).toBe(true);

    entorno.red.caida = false;
    await pagina.confirmar();

    expect(await enBodega('RS-0001')).toBe(17);
    expect(pagina.lineas()).toEqual([]);
  });

  it('no duplica el ingreso al reintentar si el primer envío sí se había registrado', async () => {
    pagina.agregar(await entorno.variante('RS-0001'));
    pagina.cambiarCantidad(1, '5');
    entorno.red.pierdeRespuestas = true;

    await pagina.confirmar();
    expect(pagina.envio.reintentable()).toBe(true);

    entorno.red.pierdeRespuestas = false;
    await pagina.confirmar();

    expect(await enBodega('RS-0001')).toBe(17);
    expect(entorno.avisos.mensajes).toHaveLength(1);
  });

  it('registra un solo ingreso ante una doble confirmación', async () => {
    pagina.agregar(await entorno.variante('RS-0001'));

    await Promise.all([pagina.confirmar(), pagina.confirmar()]);

    expect(await enBodega('RS-0001')).toBe(13);
  });
});
