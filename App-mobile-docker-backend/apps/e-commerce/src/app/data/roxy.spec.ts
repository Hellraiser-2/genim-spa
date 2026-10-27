import type { PedidoCliente } from '@rockstar/contracts';
import { describe, expect, it } from 'vitest';

import type { Product } from './models';
import { CONTEXTO_INICIAL, ContextoRoxy, DatosRoxy, responder } from './roxy';

const variante = (id: number, productId: number, name: string, size: string, stock: number, extra: Partial<Product> = {}): Product => ({
  id,
  productId,
  sku: `RS-${id}`,
  name,
  category: 'Poleras',
  band: 'Misfits',
  price: 14990,
  size,
  color: 'Negro',
  stock,
  image: '',
  ...extra,
});

const PRODUCTOS: Product[] = [
  variante(1, 1, 'Polera Calavera', 'M', 5),
  variante(2, 1, 'Polera Calavera', 'L', 0),
  variante(3, 2, 'Chaqueta de Cuero Rider', 'M', 4, { category: 'Chaquetas', band: null, price: 89990 }),
];

const PEDIDO: PedidoCliente = {
  idPedido: 12,
  idVenta: 5001,
  estado: 'DESPACHADO',
  destinatario: 'Cliente Demo',
  direccion: 'Av. Siempre Viva 742',
  comuna: 'Providencia',
  region: 'Metropolitana',
  lineas: [{ idVariante: 1, sku: 'RS-1', producto: 'Polera Calavera', talla: 'M', color: 'Negro', cantidad: 1, precioUnitario: 14990 }],
  pagadoEn: '2026-10-09T15:00:00Z',
  trackingStarken: 'STK123',
  flete: 4990,
  total: 19980,
};

const INVITADO: DatosRoxy = { nombre: null, esCliente: false, productos: PRODUCTOS, pedidos: null };
const CLIENTE: DatosRoxy = { nombre: 'Ana', esCliente: true, productos: PRODUCTOS, pedidos: [PEDIDO] };

/** Conversación completa: devuelve cada respuesta. */
function conversar(mensajes: string[], datos = INVITADO): string[] {
  let contexto: ContextoRoxy = CONTEXTO_INICIAL;
  return mensajes.map((m) => {
    const r = responder(m, contexto, datos);
    contexto = r.contexto;
    return r.texto;
  });
}

describe('Roxy', () => {
  it('a un "hola" responde presentándose, y a un segundo saludo no se vuelve a presentar', () => {
    const [primero, segundo] = conversar(['hola', 'Holaa!!']);
    expect(primero).toContain('Soy *Roxy*');
    expect(primero).toContain('¿En qué puedo ayudarte?');
    expect(segundo).toContain('Hola de nuevo');
    expect(segundo).not.toContain('Soy *Roxy*');
  });

  it('saluda por su nombre a quien inició sesión, con o sin tildes y signos', () => {
    expect(conversar(['Buenas tardes'], CLIENTE)[0]).toContain('¡Hola, Ana!');
    expect(conversar(['¡¡HOLA!!'], CLIENTE)[0]).toContain('¡Hola, Ana!');
  });

  it('si el saludo trae una pregunta, saluda y la responde', () => {
    const [respuesta] = conversar(['hola, ¿cómo puedo pagar?']);
    expect(respuesta).toMatch(/^¡Hola! /);
    expect(respuesta).toContain('Webpay');
  });

  it('responde gracias, despedidas y quién es', () => {
    expect(conversar(['muchas gracias'])[0]).toContain('De nada');
    expect(conversar(['chao'])[0]).toContain('Nos vemos');
    expect(conversar(['¿quién eres?'])[0]).toContain('asistente virtual');
  });

  it('a un invitado le pide iniciar sesión para ver su pedido', () => {
    expect(conversar(['¿dónde está mi pedido?'])[0]).toContain('inicia sesión');
  });

  it('a un cliente le muestra sus pedidos y, si le da el número, el detalle', () => {
    const [lista, detalle] = conversar(['quiero rastrear mi pedido', '12'], CLIENTE);
    expect(lista).toContain('Pedido *#12*: En camino');
    expect(lista).toContain('STK123');
    expect(detalle).toContain('Polera Calavera (M)');
    expect(detalle).toContain('Providencia');
    expect(conversar(['pedido #99'], CLIENTE)[0]).toContain('No encuentro el pedido *#99*');
  });

  it('en una devolución pide el pedido y el motivo, y luego deriva a WhatsApp', () => {
    const [politica, derivacion, cierre] = conversar(['quiero devolver una polera', 'pedido 12, me quedó chica', 'no, gracias']);
    expect(politica).toContain('30 días');
    expect(derivacion).toContain('pedido *#12*');
    expect(derivacion).toContain('WhatsApp');
    expect(cierre).toContain('Cualquier cosa me escribes');
  });

  it('en la devolución de un cliente, avisa si el pedido no es suyo y sigue esperando el número', () => {
    const [, ajeno, propio] = conversar(['quiero hacer un cambio', 'el pedido 3 me quedó chico', 'perdón, es el 12'], CLIENTE);
    expect(ajeno).toContain('No encuentro el pedido *#3*');
    expect(propio).toContain('pedido *#12*');
  });

  it('agradece un "gracias" y no confunde un "no" suelto con algo que no entendió', () => {
    const [, gracias, cierre] = conversar(['¿cómo pago?', 'gracias', 'no']);
    expect(gracias).toContain('De nada');
    expect(cierre).toContain('Cualquier cosa me escribes');
    expect(conversar(['no'])[0]).toContain('aquí estoy');
  });

  it('busca prendas en el catálogo con su precio y sus tallas disponibles', () => {
    const [respuesta] = conversar(['¿tienen poleras de Misfits?']);
    expect(respuesta).toContain('*Polera Calavera* (Misfits): $14.990');
    expect(respuesta).toContain('tallas M');
    expect(respuesta).not.toContain('Chaqueta');
  });

  it('con una talla dice si queda, aunque la pregunta hable de tallas', () => {
    expect(conversar(['¿hay polera calavera en talla L?'])[0]).toContain('no queda en L');
    expect(conversar(['¿hay polera calavera en talla M?'])[0]).toContain('hay en M');
  });

  it('para elegir talla recomienda el probador', () => {
    expect(conversar(['¿qué talla soy?'])[0]).toContain('*Probar*');
  });

  it('reconoce una prenda nombrada sin más palabras', () => {
    expect(conversar(['chaqueta rider'])[0]).toContain('Chaqueta de Cuero Rider');
  });

  it('si no entiende, lo dice y ofrece los temas en que ayuda', () => {
    const [respuesta] = conversar(['asdf qwerty']);
    expect(respuesta).toContain('No estoy segura de haberte entendido');
    expect(respuesta).not.toContain('Anotado');
  });
});
