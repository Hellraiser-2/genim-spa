import { TestBed } from '@angular/core/testing';
import type { Pedido } from '@rockstar/contracts';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { InicioPage } from '../inicio/inicio.page';
import { agruparEnvios, esUrgente, etiquetaDeEstado, grupoDeEnvio, haceCuanto, momentoDelPedido } from './envios';
import { EnviosPage } from './envios.page';

const AHORA = Date.parse('2026-10-01T12:00:00Z');
const haceHoras = (horas: number) => new Date(AHORA - horas * 60 * 60 * 1000).toISOString();

function pedido(datos: Partial<Pedido> & Pick<Pedido, 'idPedido' | 'estado'>): Pedido {
  return {
    idVenta: datos.idPedido,
    destinatario: 'Cliente',
    direccion: 'Calle 1',
    comuna: 'Santiago',
    region: 'Región Metropolitana',
    lineas: [],
    pagadoEn: haceHoras(1),
    ...datos,
  };
}

describe('envíos', () => {
  describe('agrupación', () => {
    it('clasifica cada estado en por enviar, en camino o enviados', () => {
      expect(grupoDeEnvio('PAGADO')).toBe('POR_ENVIAR');
      expect(grupoDeEnvio('EN_PREPARACION')).toBe('POR_ENVIAR');
      expect(grupoDeEnvio('DESPACHO_PENDIENTE')).toBe('POR_ENVIAR');
      expect(grupoDeEnvio('ATENCION_MANUAL')).toBe('POR_ENVIAR');
      expect(grupoDeEnvio('DESPACHADO')).toBe('EN_CAMINO');
      expect(grupoDeEnvio('ENTREGADO')).toBe('ENVIADOS');
    });

    it('ordena por enviar del más antiguo al más reciente y el resto del más reciente al más antiguo', () => {
      const envios = agruparEnvios([
        pedido({ idPedido: 1, estado: 'PAGADO', pagadoEn: haceHoras(2) }),
        pedido({ idPedido: 2, estado: 'EN_PREPARACION', pagadoEn: haceHoras(20) }),
        pedido({ idPedido: 3, estado: 'DESPACHADO', despachadoEn: haceHoras(30) }),
        pedido({ idPedido: 4, estado: 'DESPACHADO', despachadoEn: haceHoras(5) }),
        pedido({ idPedido: 5, estado: 'ENTREGADO', entregadoEn: haceHoras(90) }),
        pedido({ idPedido: 6, estado: 'ENTREGADO', entregadoEn: haceHoras(40) }),
      ]);

      expect(envios.POR_ENVIAR.map((p) => p.idPedido)).toEqual([2, 1]);
      expect(envios.EN_CAMINO.map((p) => p.idPedido)).toEqual([4, 3]);
      expect(envios.ENVIADOS.map((p) => p.idPedido)).toEqual([6, 5]);
    });

    it('destaca como urgente un pedido con más de 18 horas pagado sin despacharse', () => {
      expect(esUrgente(pedido({ idPedido: 1, estado: 'PAGADO', pagadoEn: haceHoras(19) }), AHORA)).toBe(true);
      expect(esUrgente(pedido({ idPedido: 2, estado: 'PAGADO', pagadoEn: haceHoras(17) }), AHORA)).toBe(false);
      expect(esUrgente(pedido({ idPedido: 3, estado: 'DESPACHADO', pagadoEn: haceHoras(40) }), AHORA)).toBe(false);
    });

    it('expresa el tiempo transcurrido en minutos, horas o días', () => {
      expect(haceCuanto(haceHoras(0.5), AHORA)).toBe('hace 30 min');
      expect(haceCuanto(haceHoras(20), AHORA)).toBe('hace 20 h');
      expect(haceCuanto(haceHoras(75), AHORA)).toBe('hace 3 días');
    });

    it('describe el pedido con el momento que corresponde a su estado', () => {
      expect(momentoDelPedido(pedido({ idPedido: 1, estado: 'PAGADO', pagadoEn: haceHoras(2) }), AHORA)).toBe('Pagado hace 2 h');
      expect(momentoDelPedido(pedido({ idPedido: 2, estado: 'DESPACHADO', despachadoEn: haceHoras(22) }), AHORA)).toBe(
        'Despachado hace 22 h',
      );
      expect(momentoDelPedido(pedido({ idPedido: 3, estado: 'ENTREGADO', entregadoEn: haceHoras(75) }), AHORA)).toBe(
        'Entregado hace 3 días',
      );
      expect(etiquetaDeEstado('DESPACHADO')).toBe('En camino');
    });
  });

  describe('pantallas', () => {
    let entorno: EntornoDePrueba;

    function crear<T>(componente: new () => T): T {
      const fixture = TestBed.createComponent(componente);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    beforeEach(async () => {
      entorno = configurarEntorno();
      await entorno.iniciarSesion();
    });

    it('muestra los pedidos por enviar al entrar, con el más antiguo primero', async () => {
      const pagina = crear(EnviosPage);

      await pagina.cargar();

      expect(pagina.grupo()).toBe('POR_ENVIAR');
      expect(pagina.visibles().map((p) => [p.idPedido, p.estado])).toEqual([
        [1003, 'DESPACHO_PENDIENTE'],
        [1002, 'EN_PREPARACION'],
        [1001, 'PAGADO'],
      ]);
    });

    it('muestra los pedidos en camino y los enviados al cambiar de pestaña', async () => {
      const pagina = crear(EnviosPage);
      await pagina.cargar();

      pagina.grupo.set('EN_CAMINO');
      expect(pagina.visibles().map((p) => [p.idPedido, p.trackingStarken])).toEqual([
        [1004, 'STK-900104'],
        [1005, 'STK-900105'],
      ]);

      pagina.grupo.set('ENVIADOS');
      expect(pagina.visibles().map((p) => p.idPedido)).toEqual([1006, 1007]);
    });

    it('informa la falla de conexión y permite reintentar', async () => {
      const pagina = crear(EnviosPage);
      entorno.red.caida = true;

      await pagina.cargar();
      expect(pagina.error()).toContain('No hay conexión');
      expect(pagina.visibles()).toEqual([]);

      entorno.red.caida = false;
      await pagina.cargar();
      expect(pagina.error()).toBeNull();
      expect(pagina.visibles()).toHaveLength(3);
    });

    it('genera el despacho de un pedido por enviar y lo deja en camino con su código de seguimiento', async () => {
      const pagina = crear(EnviosPage);
      await pagina.cargar();
      const pedido = pagina.visibles().find((p) => p.idPedido === 1001)!;

      pagina.pedirConfirmacion(pedido);
      expect(pagina.porConfirmar()).toBe(1001);
      await pagina.despachar(pedido);

      expect(pagina.porConfirmar()).toBeNull();
      expect(pagina.errorDespacho()).toBeNull();
      expect(pagina.visibles().map((p) => p.idPedido)).toEqual([1003, 1002]);
      pagina.grupo.set('EN_CAMINO');
      expect(pagina.visibles()[0]).toMatchObject({ idPedido: 1001, estado: 'DESPACHADO', trackingStarken: 'STK-901001' });
      expect(entorno.avisos.mensajes).toEqual(['Pedido #1001 despachado. Seguimiento STK-901001.']);
    });

    it('al despachar, la prenda sale de la bodega y deja de estar reservada', async () => {
      const pagina = crear(EnviosPage);
      await pagina.cargar();
      const antes = await entorno.variante('RS-0002');

      await pagina.despachar(pagina.visibles().find((p) => p.idPedido === 1001)!);

      const despues = await entorno.variante('RS-0002');
      expect(despues.existencias).toEqual([
        { ubicacion: 'BODEGA', cantidad: antes.existencias[0].cantidad - 1 },
        { ubicacion: 'SALA_VENTAS', cantidad: antes.existencias[1].cantidad },
      ]);
      expect(despues.reservado).toBe(antes.reservado - 1);
      expect(despues.disponible).toBe(antes.disponible);
    });

    it('si la respuesta del despacho se pierde, reintentar no genera otro', async () => {
      const pagina = crear(EnviosPage);
      await pagina.cargar();
      const pedido = pagina.visibles().find((p) => p.idPedido === 1002)!;
      const antes = await entorno.variante('RS-0002');
      pagina.pedirConfirmacion(pedido);
      entorno.red.pierdeRespuestas = true;

      await pagina.despachar(pedido);

      expect(pagina.errorDespacho()).toEqual({ idPedido: 1002, mensaje: expect.stringContaining('No hay conexión') });
      expect(pagina.porConfirmar()).toBe(1002);
      expect(pagina.despachando()).toBeNull();
      expect(pagina.visibles().map((p) => p.idPedido)).toContain(1002);

      entorno.red.pierdeRespuestas = false;
      await pagina.despachar(pedido);

      expect(pagina.errorDespacho()).toBeNull();
      pagina.grupo.set('EN_CAMINO');
      expect(pagina.visibles()[0]).toMatchObject({ idPedido: 1002, trackingStarken: 'STK-901002' });
      expect((await entorno.variante('RS-0002')).existencias[0].cantidad).toBe(antes.existencias[0].cantidad - 1);
    });

    it('resume en la pantalla principal cuántos envíos hay en cada estado', async () => {
      const inicio = crear(InicioPage);
      expect(inicio.resumenEnvios().map((g) => g.cantidad)).toEqual([null, null, null]);

      await inicio.cargarEnvios();

      expect(inicio.resumenEnvios()).toEqual([
        { etiqueta: 'Por enviar', cantidad: 3 },
        { etiqueta: 'En camino', cantidad: 2 },
        { etiqueta: 'Enviados', cantidad: 2 },
      ]);
    });

    it('informa en la pantalla principal cuando no se pueden cargar los envíos', async () => {
      const inicio = crear(InicioPage);
      entorno.red.caida = true;

      await inicio.cargarEnvios();

      expect(inicio.errorEnvios()).toContain('No hay conexión');
    });
  });
});
