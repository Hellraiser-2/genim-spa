// Lo que comparten los scripts que cargan catálogos por la API: la dirección, las cuentas
// y las llamadas. Las cuentas por defecto son las de demostración. Para otras:
//   BODEGA_EMAIL, BODEGA_PASSWORD, GERENTE_EMAIL, GERENTE_PASSWORD

export const API = (process.env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, '');
export const CUENTAS = {
  bodega: { email: process.env.BODEGA_EMAIL ?? 'bodega@rockstar.cl', password: process.env.BODEGA_PASSWORD ?? 'bodega123' },
  gerente: { email: process.env.GERENTE_EMAIL ?? 'gerente@rockstar.cl', password: process.env.GERENTE_PASSWORD ?? 'gerente123' },
};

/** Nombre en minúsculas, sin tildes ni signos: para comparar y para armar claves. */
export const clave = (texto) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function llamar(metodo, ruta, cuerpo, token) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(`${metodo} ${ruta} respondió ${respuesta.status}: ${datos.mensaje ?? 'sin detalle'}`);
  }
  return datos;
}

export async function iniciarSesion({ email, password }) {
  return (await llamar('POST', '/usuarios/auth/login', { email, password })).accessToken;
}

export const escaparXml = (texto) => texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/**
 * Da de alta cada talla de cada producto que aún no existe. El servicio asigna los SKU y
 * los códigos de ubicación y registra el ingreso de las unidades. Devuelve cuántas creó.
 */
export async function crearVariantes(productos, { prefijo, ilustracion }, token) {
  const variantes = await llamar('GET', '/inventario/productos', undefined, token);
  const existe = (producto, talla, color) =>
    variantes.some((v) => clave(v.producto) === clave(producto) && clave(v.talla) === clave(talla) && clave(v.color) === clave(color));

  let creadas = 0;
  for (const producto of productos) {
    for (const [talla, cantidad] of Object.entries(producto.tallas)) {
      if (existe(producto.nombre, talla, producto.color)) {
        continue;
      }
      await llamar(
        'POST',
        '/inventario/productos',
        {
          // La misma clave en cada ejecución: si esta se corta a medias, repetirla no duplica nada.
          claveIdempotencia: `${prefijo}:${clave(producto.nombre)}:${clave(talla)}`,
          nombre: producto.nombre,
          categoria: producto.categoria,
          banda: producto.banda ?? null,
          talla,
          color: producto.color,
          cantidad,
          ubicacion: 'BODEGA',
          imagen: ilustracion(producto),
        },
        token,
      );
      creadas++;
    }
  }
  return creadas;
}

/** Pone precio y descripción a los productos que no tienen precio; uno ya definido por el Gerente se respeta. */
export async function ponerPrecios(productos, tokenBodega, tokenGerente) {
  const alDia = await llamar('GET', '/inventario/productos', undefined, tokenBodega);
  let conPrecio = 0;
  for (const producto of productos) {
    const variante = alDia.find((v) => clave(v.producto) === clave(producto.nombre));
    if (variante && variante.precio === null) {
      await llamar('PATCH', `/inventario/productos/${variante.idProducto}`, { precio: producto.precio, descripcion: producto.descripcion }, tokenGerente);
      conPrecio++;
    }
  }
  return conPrecio;
}
