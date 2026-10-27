// Carga en el sistema las fotos de las bandas y un catálogo de productos de bandas conocidas.
//
//   npm run semilla:bandas                               contra http://localhost:3000/api/v1
//   API_URL=http://equipo:3000/api/v1 npm run semilla:bandas
//
// Trabaja por la API, con las mismas reglas que la app: el servicio asigna los SKU, los
// códigos de ubicación y registra el ingreso de las unidades. Se puede ejecutar más de una
// vez: lo que ya existe no se duplica, y un precio ya definido por el Gerente no se toca.
//
// Las cuentas y la dirección se configuran como en api-semillas.mjs.
//
// Los datos están en db/semillas/bandas: `catalogo.json`, las fotos y sus créditos.

import { readFileSync } from 'node:fs';

import { API, CUENTAS, clave, crearVariantes, escaparXml, iniciarSesion, llamar, ponerPrecios } from './api-semillas.mjs';

const CARPETA = new URL('../../../db/semillas/bandas/', import.meta.url);

/** Parte un título en renglones de hasta `ancho` caracteres, sin cortar palabras. */
function renglones(texto, ancho) {
  const lineas = [''];
  for (const palabra of texto.split(' ')) {
    const actual = lineas[lineas.length - 1];
    if (actual !== '' && `${actual} ${palabra}`.length > ancho) {
      lineas.push(palabra);
    } else {
      lineas[lineas.length - 1] = actual === '' ? palabra : `${actual} ${palabra}`;
    }
  }
  return lineas;
}

/**
 * Ilustración del producto: una prenda negra con el nombre de la banda y el título. No
 * es una foto de la prenda real; ocupa su lugar hasta que la tienda suba la propia. Es
 * un SVG de un par de kilobytes, así que no pesa en el catálogo.
 */
function ilustracion({ banda, titulo, categoria }) {
  const conCapucha = categoria === 'Polerones';
  // Polerón: mangas largas, capucha, cordones y bolsillo. Polera: mangas cortas y cuello redondo.
  const prenda = conCapucha
    ? 'M128 110 L158 92 Q200 120 242 92 L272 110 L340 170 L352 400 L312 404 L296 232 L292 448 L108 448 L104 232 L88 404 L48 400 L60 170 Z'
    : 'M122 78 L160 60 Q200 96 240 60 L278 78 L362 138 L326 200 L290 180 L290 448 L110 448 L110 180 L74 200 L38 138 Z';
  const detalle = conCapucha
    ? '<path d="M152 96 Q146 34 200 30 Q254 34 248 96 Q200 128 152 96 Z" fill="#19191c" stroke="#4a4a52" stroke-width="2"/>' +
      '<path d="M170 92 Q200 58 230 92 Q200 110 170 92 Z" fill="#070708"/>' +
      '<path d="M187 110 L185 152 M213 110 L215 152" stroke="#8b8b94" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M150 350 L250 350 L264 404 L136 404 Z" fill="none" stroke="#4a4a52" stroke-width="2"/>'
    : '<path d="M160 60 Q200 96 240 60" fill="none" stroke="#4a4a52" stroke-width="5"/>';
  const nombre = escaparXml(banda.toUpperCase());
  // El nombre se ajusta al ancho de la prenda: los largos se comprimen, los cortos no se estiran.
  const ajuste = banda.length > 7 ? ' textLength="150" lengthAdjust="spacingAndGlyphs"' : '';
  const titulos = renglones(titulo.toUpperCase(), 18)
    .map((linea, i) => `<text x="200" y="${286 + i * 18}" font-size="13" letter-spacing="1.5" fill="#ef4444">${escaparXml(linea)}</text>`)
    .join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
    '<defs><radialGradient id="f" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#7a7a84"/><stop offset="1" stop-color="#2a2a30"/></radialGradient></defs>' +
    '<rect width="400" height="500" fill="url(#f)"/>' +
    `<path d="${prenda}" fill="#111113" stroke="#4a4a52" stroke-width="2" stroke-linejoin="round"/>${detalle}` +
    '<g font-family="Impact, Haettenschweiler, \'Arial Narrow Bold\', \'Arial Black\', sans-serif" text-anchor="middle">' +
    `<text x="200" y="244" font-size="34" fill="#f4f4f5"${ajuste}>${nombre}</text>` +
    '<rect x="150" y="256" width="100" height="3" fill="#b91c1c"/>' +
    `${titulos}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const catalogo = JSON.parse(readFileSync(new URL('catalogo.json', CARPETA), 'utf8'));
console.log(`Cargando el catálogo de bandas en ${API}`);

const bodega = await iniciarSesion(CUENTAS.bodega);
const gerente = await iniciarSesion(CUENTAS.gerente);

// --- Fotos de las bandas ---

const conFoto = new Map((await llamar('GET', '/inventario/catalogo/bandas')).map((b) => [clave(b.nombre), b]));
let fotos = 0;
for (const banda of catalogo.bandas) {
  const actual = conFoto.get(clave(banda.nombre));
  // Una banda que ya tiene foto con el mismo crédito se da por cargada.
  if (actual?.imagenUrl && actual.credito === banda.credito) {
    continue;
  }
  const bytes = readFileSync(new URL(banda.foto, CARPETA));
  await llamar('PUT', '/inventario/bandas/imagen', { banda: banda.nombre, imagen: `data:image/jpeg;base64,${bytes.toString('base64')}`, credito: banda.credito }, bodega);
  fotos++;
}

// --- Productos, con su precio y descripción ---

const creadas = await crearVariantes(catalogo.productos, { prefijo: 'semilla-bandas', ilustracion }, bodega);
const conPrecio = await ponerPrecios(catalogo.productos, bodega, gerente);

console.log(`Fotos de bandas guardadas: ${fotos} de ${catalogo.bandas.length}`);
console.log(`Variantes creadas: ${creadas} de ${catalogo.productos.reduce((n, p) => n + Object.keys(p.tallas).length, 0)}`);
console.log(`Productos que recibieron precio: ${conPrecio} de ${catalogo.productos.length}`);
if (fotos + creadas + conPrecio === 0) {
  console.log('Todo estaba cargado: no hubo cambios.');
}
