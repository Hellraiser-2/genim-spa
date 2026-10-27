import type { PedidoCliente } from '@rockstar/contracts';

import { Product, compareSizes, formatCLP, orderStatusLabel } from './models';

/**
 * Roxy, la asistente del chat de soporte. Responde según lo que se le escribe y según la
 * conversación: saluda cuando la saludan, recuerda si está esperando un número de pedido
 * y usa los datos de la tienda (catálogo y pedidos del cliente). Corre en el navegador,
 * sin servicios externos: lo escrito no sale del dispositivo.
 */

/** Lo que Roxy recuerda entre un mensaje y el siguiente. */
export interface ContextoRoxy {
  /** Ya se presentó en esta conversación. */
  saludo: boolean;
  /** Pregunta que dejó abierta y cuya respuesta espera. */
  esperando: 'pedido' | 'devolucion' | 'algoMas' | null;
}

/** Lo que Roxy sabe de la tienda y de quien le escribe. */
export interface DatosRoxy {
  /** Nombre de quien escribe, si inició sesión. */
  nombre: string | null;
  /** Inició sesión con una cuenta de cliente: puede consultar sus pedidos. */
  esCliente: boolean;
  productos: Product[];
  /** Pedidos del cliente, de su cuenta; `null` si no se pudieron cargar o no hay sesión. */
  pedidos: PedidoCliente[] | null;
}

export interface RespuestaRoxy {
  texto: string;
  contexto: ContextoRoxy;
}

export const CONTEXTO_INICIAL: ContextoRoxy = { saludo: false, esperando: null };

type Tema =
  | 'agente'
  | 'devolucion'
  | 'pedido'
  | 'envio'
  | 'pago'
  | 'talla'
  | 'tienda'
  | 'producto'
  | 'quien'
  | 'comoEstas'
  | 'gracias'
  | 'despedida'
  | 'saludo'
  | 'si'
  | 'no';

/** Minúsculas, sin tildes ni signos, con los espacios justos. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}#\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Frases que delatan cada tema, ya normalizadas. Se buscan como palabras o frases completas. */
const PISTAS: [Tema, string[]][] = [
  ['agente', ['agente', 'humano', 'humana', 'persona real', 'asesor', 'asesora', 'ejecutivo', 'ejecutiva', 'hablar con alguien', 'whatsapp', 'reclamo']],
  ['devolucion', ['devolucion', 'devoluciones', 'devolver', 'cambio', 'cambios', 'cambiar', 'reembolso', 'garantia', 'fallada', 'fallado', 'defecto']],
  ['pedido', ['pedido', 'pedidos', 'orden', 'ordenes', 'rastrear', 'rastreo', 'seguimiento', 'tracking', 'mi compra', 'mis compras', 'donde esta', 'no ha llegado', 'no me ha llegado', 'cuando llega']],
  ['envio', ['envio', 'envios', 'despacho', 'despachos', 'despachan', 'flete', 'starken', 'envian', 'enviar', 'regiones', 'cuanto demora', 'cuanto tarda', 'retiro']],
  ['pago', ['pago', 'pagos', 'pagar', 'webpay', 'tarjeta', 'debito', 'credito', 'efectivo', 'transferencia', 'cuotas', 'medios de pago']],
  ['talla', ['talla', 'tallas', 'medida', 'medidas', 'me queda', 'quedara', 'probador', 'probar', 'que talla', 'tallaje']],
  ['tienda', ['tienda fisica', 'local', 'direccion', 'donde estan', 'donde quedan', 'horario', 'horarios', 'abren', 'cierran', 'sucursal']],
  ['producto', ['stock', 'precio', 'precios', 'cuanto cuesta', 'cuanto vale', 'tienen', 'venden', 'hay', 'disponible', 'catalogo', 'polera', 'poleras', 'poleron', 'polerones', 'chaqueta', 'chaquetas', 'pantalon', 'pantalones', 'jeans', 'cinturon', 'cinturones']],
  ['quien', ['quien eres', 'eres un bot', 'eres una ia', 'eres humana', 'como te llamas', 'tu nombre', 'eres real']],
  ['comoEstas', ['como estas', 'como te va', 'que tal estas', 'como andas']],
  ['gracias', ['gracias', 'muchas gracias', 'te pasaste', 'buena onda', 'se agradece', 'genial']],
  ['despedida', ['chao', 'chau', 'adios', 'hasta luego', 'hasta pronto', 'nos vemos', 'bye', 'eso es todo', 'eso seria todo']],
  ['saludo', ['hola', 'holi', 'holaa', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'wena', 'wenas', 'saludos', 'que tal', 'alo']],
  ['si', ['si', 'sip', 'claro', 'dale', 'ok', 'okay', 'bueno', 'por favor', 'obvio']],
  ['no', ['no', 'nop', 'nada mas', 'no gracias', 'nada']],
];

/** Temas de conversación social: se contestan, pero ceden ante una consulta concreta. */
const SOCIALES = new Set<Tema>(['saludo', 'gracias', 'despedida', 'comoEstas', 'quien', 'si', 'no']);

function contiene(texto: string, frase: string): boolean {
  return ` ${texto} `.includes(` ${frase} `);
}

function temasDe(texto: string): Tema[] {
  return PISTAS.filter(([, frases]) => frases.some((f) => contiene(texto, f))).map(([tema]) => tema);
}

/** Número de pedido escrito en el mensaje ("pedido 12", "#12", "12"). */
function numeroEn(texto: string): number | null {
  const encontrado = texto.match(/#?\b(\d{1,7})\b/);
  return encontrado ? Number(encontrado[1]) : null;
}

const TALLAS_LETRA = ['xs', 's', 'm', 'l', 'xl', 'xxl'];

/** Talla pedida en el mensaje ("talla M", "en L", "42"). */
function tallaEn(texto: string): string | null {
  const conPalabra = texto.match(/\btalla (xxl|xl|xs|s|m|l|\d{2})\b/);
  if (conPalabra) return conPalabra[1]!.toUpperCase();
  const numero = texto.match(/\b(3[68]|4[02468]|50)\b/);
  if (numero) return numero[1]!;
  const letra = texto.split(' ').find((p) => TALLAS_LETRA.includes(p) && p !== 's' && p !== 'm');
  return letra ? letra.toUpperCase() : null;
}

const VACIAS = new Set([
  'que', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'para', 'por', 'con', 'sin', 'tienen', 'tiene', 'hay', 'venden',
  'precio', 'precios', 'cuanto', 'cuesta', 'vale', 'stock', 'talla', 'tallas', 'quiero', 'busco', 'necesito', 'algo',
  'alguna', 'alguno', 'disponible', 'hola', 'buenas', 'favor', 'tienda', 'ropa', 'prenda', 'prendas', 'como', 'esta', 'estan',
]);

/** Palabra en singular aproximado, para que "poleras" encuentre "Polera" y "polerones" encuentre "Polerón". */
function raiz(palabra: string): string {
  if (palabra.length > 5 && palabra.endsWith('es')) return palabra.slice(0, -2);
  if (palabra.length > 4 && palabra.endsWith('s')) return palabra.slice(0, -1);
  return palabra;
}

/** Productos del catálogo que nombra el mensaje, de más a menos coincidencias. */
function productosNombrados(texto: string, productos: Product[]): Product[] {
  const claves = texto
    .split(' ')
    .filter((p) => p.length >= 3 && !VACIAS.has(p) && !/^\d+$/.test(p))
    .map(raiz);
  if (claves.length === 0) return [];
  const puntaje = (p: Product) => {
    const palabras = normalizar(`${p.name} ${p.band ?? ''} ${p.category} ${p.color}`).split(' ');
    return claves.filter((c) => palabras.some((w) => w.startsWith(c))).length;
  };
  const conPuntaje = productos.map((p) => ({ p, n: puntaje(p) })).filter((x) => x.n > 0);
  const mejor = Math.max(0, ...conPuntaje.map((x) => x.n));
  return conPuntaje.filter((x) => x.n === mejor).map((x) => x.p);
}

/** Una línea por producto (no por variante): nombre, banda, precio y tallas con stock. */
function listaDeProductos(variantes: Product[], talla: string | null): string {
  const porProducto = new Map<number, Product[]>();
  for (const v of variantes) {
    porProducto.set(v.productId, [...(porProducto.get(v.productId) ?? []), v]);
  }
  const lineas = [...porProducto.values()].slice(0, 4).map((vs) => {
    const p = vs[0]!;
    const tallas = [...new Set(vs.filter((v) => v.stock > 0).map((v) => v.size))].sort(compareSizes);
    const banda = p.band ? ` (${p.band})` : '';
    const disponibles = tallas.length ? `tallas ${tallas.join(', ')}` : 'sin stock por ahora';
    const conTalla = talla ? (tallas.includes(talla) ? ` ✅ hay en ${talla}` : ` · no queda en ${talla}`) : '';
    return `• *${p.name}*${banda}: ${formatCLP(p.price)} · ${disponibles}${conTalla}`;
  });
  const mas = porProducto.size > 4 ? `\n…y ${porProducto.size - 4} más en la Tienda.` : '';
  return lineas.join('\n') + mas;
}

function lineaDePedido(p: PedidoCliente): string {
  const seguimiento = p.trackingStarken ? ` · seguimiento Starken *${p.trackingStarken}*` : '';
  return `• Pedido *#${p.idPedido}*: ${orderStatusLabel(p.estado)} (${formatCLP(p.total)})${seguimiento}`;
}

const MENU = 'Puedo ayudarte con *pedidos*, *cambios y devoluciones*, *envíos*, *medios de pago*, *tallas* y *productos*.';

/** La respuesta de Roxy a un mensaje, y lo que recordará para el siguiente. */
export function responder(mensaje: string, contexto: ContextoRoxy, datos: DatosRoxy): RespuestaRoxy {
  const texto = normalizar(mensaje);
  const temas = temasDe(texto);
  let consulta = temas.find((t) => !SOCIALES.has(t));
  // "¿Tienen la polera Misfits en talla M?" pregunta por stock, no por cómo elegir talla.
  if (consulta === 'talla' && temas.includes('producto') && productosNombrados(texto, datos.productos).length > 0) {
    consulta = 'producto';
  }
  const numero = numeroEn(texto);
  const saludoInicial = temas.includes('saludo') ? (contexto.saludo ? '¡Hola de nuevo! ' : `¡Hola${datos.nombre ? `, ${datos.nombre}` : ''}! `) : '';
  const seguir = (texto: string, esperando: ContextoRoxy['esperando'] = null): RespuestaRoxy => ({
    texto,
    contexto: { saludo: contexto.saludo || temas.includes('saludo'), esperando },
  });

  // Respuesta a la pregunta que Roxy dejó abierta. En una devolución, "pedido 12, me quedó chica" son los datos pedidos, no otra consulta.
  const respondeDevolucion = !consulta || consulta === 'pedido' || consulta === 'devolucion';
  if (contexto.esperando === 'devolucion' && respondeDevolucion && (numero !== null || texto.split(' ').length >= 3)) {
    const ajeno = numero !== null && datos.esCliente && datos.pedidos !== null && !datos.pedidos.some((p) => p.idPedido === numero || p.idVenta === numero);
    if (ajeno) {
      return seguir(`No encuentro el pedido *#${numero}* en tu cuenta 🤔. ¿Me confirmas el número? Lo ves en *Mis pedidos*.`, 'devolucion');
    }
    const pedido = numero !== null ? ` del pedido *#${numero}*` : '';
    return seguir(
      `¡Gracias! Para gestionar el cambio${pedido} lo revisa una persona del equipo: escríbenos por *WhatsApp* con el botón de abajo y lo resolvemos al tiro 🙌. ¿Te ayudo con algo más?`,
      'algoMas',
    );
  }
  if (!consulta && contexto.esperando === 'pedido' && numero !== null) {
    return seguir(estadoDePedido(numero, datos), 'algoMas');
  }
  if (!consulta && contexto.esperando === 'algoMas') {
    if (temas.includes('gracias')) {
      return seguir('¡De nada! 🤘 Cualquier cosa me escribes.');
    }
    if (temas.includes('no') || temas.includes('despedida')) {
      return seguir('¡Perfecto! Cualquier cosa me escribes. ¡Que lo disfrutes! 🤘');
    }
    if (temas.includes('si')) {
      return seguir(`¡Dale! Cuéntame qué necesitas. ${MENU}`);
    }
  }

  switch (consulta) {
    case 'agente':
      return seguir(
        `${saludoInicial}Te conecto con una persona del equipo Rockstar 🎸. Pulsa *Continuar en WhatsApp* aquí abajo y cuéntale tu nombre, tu número de pedido (si tienes) y el motivo.`,
      );
    case 'devolucion':
      return seguir(
        `${saludoInicial}Tienes *30 días* desde tu compra para cambiar o devolver una prenda, sin uso y con su etiqueta 🙌. ¿Me cuentas el *número de pedido* y el *motivo*?`,
        'devolucion',
      );
    case 'pedido':
      return seguir(saludoInicial + consultaDePedido(numero, datos), datos.esCliente ? 'pedido' : null);
    case 'envio':
      return seguir(
        `${saludoInicial}Despachamos a todo Chile con *Starken* 📦. El costo depende de tu comuna y lo ves antes de pagar, al elegir la dirección. Cuando sale tu pedido te damos el número de seguimiento en *Mis pedidos*.`,
      );
    case 'pago':
      return seguir(
        `${saludoInicial}En la tienda web pagas con *Webpay* (débito o crédito) 💳. En la tienda física aceptamos *efectivo*, *débito* y *crédito*.`,
      );
    case 'talla':
      return seguir(
        `${saludoInicial}Para elegir talla usa el botón *Probar* de cada prenda en la Tienda 👕: ingresas tu altura y tu peso, ves la prenda en un maniquí 3D y te recomiendo la talla.`,
      );
    case 'tienda':
      return seguir(
        `${saludoInicial}Nuestra tienda física está en *Av. Principal 123, Santiago* 🎸. Para horarios o para saber si una prenda está en el local, escríbenos por *WhatsApp* con el botón de abajo.`,
      );
    case 'producto':
      return seguir(saludoInicial + consultaDeProducto(texto, datos), 'algoMas');
  }

  // Sin consulta concreta: conversación social.
  if (temas.includes('quien')) {
    return seguir(`${saludoInicial}Soy *Roxy*, la asistente virtual de Rockstar 🤖🎸. ${MENU} Si prefieres hablar con una persona, te paso a WhatsApp.`);
  }
  if (temas.includes('comoEstas')) {
    return seguir(`${saludoInicial}¡Súper bien, con la música a todo volumen! 🤘 ¿Y tú? ¿En qué te puedo ayudar?`);
  }
  if (temas.includes('gracias')) {
    return seguir('¡De nada! 🤘 ¿Te ayudo con algo más?', 'algoMas');
  }
  if (temas.includes('despedida')) {
    return seguir('¡Nos vemos! Gracias por escribirle a Rockstar 🎸');
  }
  if (temas.includes('saludo')) {
    return seguir(
      contexto.saludo
        ? '¡Hola de nuevo! 👋 ¿En qué más te puedo ayudar?'
        : `¡Hola${datos.nombre ? `, ${datos.nombre}` : ''}! 👋 Soy *Roxy*, la asistente de Rockstar. ¿En qué puedo ayudarte?`,
    );
  }

  // Quizás nombra una prenda o una banda sin decir "precio" o "stock".
  if (productosNombrados(texto, datos.productos).length > 0) {
    return seguir(consultaDeProducto(texto, datos), 'algoMas');
  }
  if (numero !== null && datos.esCliente) {
    return seguir(estadoDePedido(numero, datos), 'algoMas');
  }
  if (temas.includes('si') || temas.includes('no')) {
    return seguir('¡Ok! Si necesitas algo, aquí estoy 🤘');
  }
  return seguir(`No estoy segura de haberte entendido 🤔. ${MENU} ¿Sobre qué me preguntas?`);
}

function consultaDePedido(numero: number | null, datos: DatosRoxy): string {
  if (!datos.esCliente) {
    return 'Para ver el estado de tu pedido, *inicia sesión* con la cuenta con que compraste: tus pedidos aparecen en *Mis pedidos* con su número de seguimiento 📦.';
  }
  if (numero !== null) {
    return estadoDePedido(numero, datos);
  }
  if (datos.pedidos === null) {
    return 'No pude revisar tus pedidos en este momento 😕. Puedes verlos en *Mis pedidos*.';
  }
  if (datos.pedidos.length === 0) {
    return 'No veo pedidos pagados en tu cuenta todavía. Si acabas de comprar, puede tardar unos minutos en aparecer.';
  }
  const recientes = datos.pedidos.slice(0, 3).map(lineaDePedido).join('\n');
  return `Estos son tus últimos pedidos 📦:\n${recientes}\n¿Quieres el detalle de alguno? Dime su número.`;
}

function estadoDePedido(numero: number, datos: DatosRoxy): string {
  if (!datos.esCliente) {
    return consultaDePedido(numero, datos);
  }
  const pedido = datos.pedidos?.find((p) => p.idPedido === numero || p.idVenta === numero);
  if (!pedido) {
    return `No encuentro el pedido *#${numero}* en tu cuenta 🤔. Revisa el número en *Mis pedidos* o escríbenos por WhatsApp.`;
  }
  const productos = pedido.lineas.map((l) => `${l.cantidad}× ${l.producto} (${l.talla})`).join(', ');
  const destino = `${pedido.direccion}, ${pedido.comuna}`;
  return `${lineaDePedido(pedido)}\nProductos: ${productos}.\nDestino: ${destino}. ¿Te ayudo con algo más?`;
}

function consultaDeProducto(texto: string, datos: DatosRoxy): string {
  if (datos.productos.length === 0) {
    return 'Ahora no pude revisar el catálogo 😕. Puedes ver todas las prendas en la *Tienda*.';
  }
  const talla = tallaEn(texto);
  const encontrados = productosNombrados(texto, datos.productos);
  if (encontrados.length === 0) {
    const categorias = [...new Set(datos.productos.map((p) => p.category))].sort().join(', ');
    return `¿Qué prenda buscas? Tenemos ${categorias}. Dime el tipo o la banda y te digo precios y tallas 🎸.`;
  }
  return `Esto encontré 🎸:\n${listaDeProductos(encontrados, talla)}\nLas ves en la *Tienda*, y con *Probar* te recomiendo la talla. ¿Te ayudo con algo más?`;
}
