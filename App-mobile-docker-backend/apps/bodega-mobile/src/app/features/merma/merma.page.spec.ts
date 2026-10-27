import { TestBed } from '@angular/core/testing';
import type { Ubicacion } from '@rockstar/contracts';

import { existenciaEn } from '../../shared/formato';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { MermaPage } from './merma.page';

describe('ingreso de merma', () => {
  let entorno: EntornoDePrueba;

  const existencia = async (codigo: string, ubicacion: Ubicacion) =>
    existenciaEn(await entorno.variante(codigo), ubicacion);

  function crear<T>(componente: new () => T): T {
    const fixture = TestBed.createComponent(componente);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
  });

  describe('MermaPage', () => {
    let pagina: MermaPage;

    beforeEach(async () => {
      pagina = crear(MermaPage);
      pagina.seleccionar(await entorno.variante('RS-0001'));
    });

    it('registra la merma, descuenta la existencia y actualiza la ficha', async () => {
      pagina.tipo.set('DANADO');
      pagina.cantidad.set('2');
      pagina.motivo.set('Costura rota');

      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(10);
      expect(existenciaEn(pagina.variante()!, 'BODEGA')).toBe(10);
      expect(pagina.cantidad()).toBe('');
      expect(entorno.avisos.mensajes).toEqual(['Merma registrada: 2 unidades.']);
    });

    it('exige el tipo y el motivo', async () => {
      pagina.cantidad.set('1');
      const solicitudes = entorno.red.solicitudes;

      await pagina.confirmar();

      expect(pagina.mostrarErrores()).toBe(true);
      expect(pagina.errores()).toEqual([
        'Selecciona el tipo de merma: dañado, muestra o cambio.',
        'El motivo es obligatorio.',
      ]);
      expect(entorno.red.solicitudes).toBe(solicitudes);
    });

    it('no registra una merma mayor a la existencia de la ubicación', async () => {
      pagina.ubicacion.set('SALA_VENTAS');
      pagina.tipo.set('MUESTRA');
      pagina.cantidad.set('4');
      pagina.motivo.set('Vitrina');

      await pagina.confirmar();

      expect(pagina.errores()).toEqual(['La cantidad supera la existencia de la ubicación.']);
      expect(await existencia('RS-0001', 'SALA_VENTAS')).toBe(3);
    });

    it('muestra el rechazo del servicio cuando la merma toca unidades reservadas', async () => {
      pagina.seleccionar(await entorno.variante('RS-0002'));
      pagina.tipo.set('CAMBIO');
      pagina.cantidad.set('8');
      pagina.motivo.set('Cambio de cliente');

      await pagina.confirmar();

      expect(pagina.envio.error()).toContain('comprometidas en pedidos');
      expect(pagina.envio.reintentable()).toBe(false);
      expect(await existencia('RS-0002', 'BODEGA')).toBe(8);
    });

    it('no duplica la merma al reintentar tras perderse la respuesta', async () => {
      pagina.tipo.set('DANADO');
      pagina.cantidad.set('2');
      pagina.motivo.set('Mancha');
      entorno.red.pierdeRespuestas = true;

      await pagina.confirmar();
      expect(pagina.envio.reintentable()).toBe(true);
      expect(pagina.cantidad()).toBe('2');

      entorno.red.pierdeRespuestas = false;
      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(10);
    });
  });
});
