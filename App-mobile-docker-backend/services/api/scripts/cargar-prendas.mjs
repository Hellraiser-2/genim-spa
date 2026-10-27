// Carga en el sistema un catálogo de chaquetas y pantalones, prendas que no son de una banda.
//
//   npm run semilla:prendas                              contra http://localhost:3000/api/v1
//   API_URL=http://equipo:3000/api/v1 npm run semilla:prendas
//
// Trabaja por la API, igual que semilla:bandas: el servicio asigna los SKU, los códigos de
// ubicación y registra el ingreso de las unidades. Se puede ejecutar más de una vez: lo que
// ya existe no se duplica, y un precio ya definido por el Gerente no se toca.
//
// Las cuentas y la dirección se configuran como en api-semillas.mjs.
//
// Los datos están en db/semillas/prendas/catalogo.json.

import { readFileSync } from 'node:fs';

import { API, CUENTAS, crearVariantes, iniciarSesion, ponerPrecios } from './api-semillas.mjs';

/** Tono de la tela de cada color, y el de sus costuras. */
const TONOS = {
  Negro: { tela: '#141416', costura: '#4a4a52' },
  'Café': { tela: '#5b3a23', costura: '#8a6446' },
  Burdeo: { tela: '#5e1b27', costura: '#8c3a48' },
  Azul: { tela: '#3b5b85', costura: '#c99a3b' },
  Gris: { tela: '#4d4f56', costura: '#7a7c84' },
  'Verde oliva': { tela: '#4f5530', costura: '#7c8250' },
  Rojo: { tela: '#a61e22', costura: '#2a0d0e' },
};

const METAL = '#b8b8c0';
const trazo = (d, color, ancho = 2, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ancho}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const pespunte = (d, color) => trazo(d, color, 1.6, ' stroke-dasharray="5 4"');
const botones = (x, ys, color) => ys.map((y) => `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`).join('');
/** Brillo del cuero: franjas claras y transparentes a lo largo de la prenda. */
const brillo = (d) => trazo(d, '#ffffff', 10, ' stroke-opacity="0.08"');

// Chaqueta: mangas largas y escote en V hasta donde empieza el cierre.
const CHAQUETA = 'M150 76 L110 90 L64 150 L48 414 L94 418 L108 230 L108 452 L292 452 L292 230 L306 418 L352 414 L336 150 L290 90 L250 76 L200 160 Z';
const SOLAPAS = 'M150 76 L132 132 L176 176 L200 160 Z M250 76 L268 132 L224 176 L200 160 Z';

function detalleChaqueta(estilo, { tela, costura }) {
  const solapas = `<path d="${SOLAPAS}" fill="${tela}" stroke="${costura}" stroke-width="2" stroke-linejoin="round"/>`;
  switch (estilo) {
    case 'cuero':
      // Cierre cruzado, bolsillos con cierre y cinturón en el ruedo, como la biker clásica.
      return (
        solapas +
        trazo('M232 170 L212 452', METAL, 3) +
        trazo('M128 300 L172 290 M246 338 L284 332', METAL, 2.5) +
        `<rect x="108" y="422" width="184" height="16" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
        `<rect x="136" y="420" width="18" height="20" fill="none" stroke="${METAL}" stroke-width="2.5"/>` +
        brillo('M84 176 Q70 290 66 396') +
        brillo('M318 176 Q330 290 334 396') +
        brillo('M140 196 Q132 300 136 404')
      );
    case 'mezclilla':
      return (
        solapas +
        trazo('M200 160 L200 452', costura, 1.6) +
        botones(206, [186, 236, 286, 336, 386], METAL) +
        pespunte('M126 196 h46 v44 h-46 Z M228 196 h46 v44 h-46 Z', costura) +
        pespunte('M108 420 L292 420', costura) +
        pespunte('M60 392 L96 396 M340 392 L304 396', costura)
      );
    case 'bomber':
      // Cuello, puños y cintura de punto, con cierre al centro.
      return (
        `<path d="M150 76 Q200 112 250 76 L200 160 Z" fill="${tela}"/>` +
        trazo('M150 76 Q200 112 250 76', costura, 9) +
        trazo('M200 104 L200 452', METAL, 3) +
        `<path d="M50 388 L94 392 L94 418 L48 414 Z M350 388 L306 392 L306 418 L352 414 Z" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
        `<rect x="108" y="424" width="184" height="28" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
        trazo(Array.from({ length: 22 }, (_, i) => `M${116 + i * 8} 428 L${116 + i * 8} 448`).join(' '), costura, 1.2) +
        trazo('M72 214 L94 210', METAL, 2.5) +
        `<rect x="66" y="200" width="34" height="40" rx="3" fill="none" stroke="${costura}" stroke-width="1.6"/>`
      );
    case 'militar':
      return (
        solapas +
        trazo('M200 160 L200 452', costura, 1.6) +
        botones(206, [196, 246, 296, 346, 396], '#2d2f1c') +
        ['M124 196 h50 v50 h-50 Z', 'M226 196 h50 v50 h-50 Z', 'M120 320 h58 v64 h-58 Z', 'M222 320 h58 v64 h-58 Z']
          .map((d) => pespunte(d, costura))
          .join('') +
        trazo('M124 212 L174 212 M226 212 L276 212 M120 338 L178 338 M222 338 L280 338', costura, 2)
      );
    default:
      return solapas;
  }
}

// Pantalón: pretina arriba y dos piernas que se separan en el tiro.
const PANTALON = 'M118 56 L282 56 L296 470 L214 470 L200 196 L186 470 L104 470 Z';

function detallePantalon(estilo, { tela, costura }) {
  const base =
    `<path d="M118 56 L282 56 L283 84 L117 84 Z" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
    [138, 196, 254].map((x) => `<rect x="${x}" y="52" width="8" height="36" rx="2" fill="${tela}" stroke="${costura}" stroke-width="1.6"/>`).join('') +
    `<circle cx="200" cy="70" r="5" fill="${METAL}"/>` +
    pespunte('M200 84 L214 84 L214 160 Q214 178 200 188', costura) +
    pespunte('M126 92 Q152 104 162 84 M274 92 Q248 104 238 84', costura);
  switch (estilo) {
    case 'rasgado':
      return (
        base +
        trazo('M128 302 L168 298 M126 314 L170 316 M134 326 L162 324', '#d9d9de', 3) +
        trazo('M232 298 L272 302 M230 316 L274 314 M238 324 L266 326', '#d9d9de', 3) +
        trazo('M110 462 L130 470 M150 462 L160 470 M228 462 L240 470 M266 462 L284 470', '#d9d9de', 1.6)
      );
    case 'cargo':
      return (
        base +
        `<path d="M108 248 h44 v70 h-44 Z M248 248 h44 v70 h-44 Z" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
        `<path d="M106 244 h48 v18 h-48 Z M246 244 h48 v18 h-48 Z" fill="${tela}" stroke="${costura}" stroke-width="2"/>` +
        botones(130, [254], costura) +
        botones(270, [254], costura) +
        trazo('M104 446 L186 446 M214 446 L296 446', costura, 2)
      );
    case 'cuero':
      return base + brillo('M134 120 Q130 300 128 456') + brillo('M268 120 Q272 300 274 456');
    default:
      return base;
  }
}

/**
 * Ilustración del producto: la prenda en su color sobre fondo gris. No es una foto de
 * la prenda real; ocupa su lugar hasta que la tienda suba la propia. Pesa un par de
 * kilobytes, así que no carga el catálogo.
 */
function ilustracion({ categoria, estilo, color }) {
  const tonos = TONOS[color];
  if (!tonos) {
    throw new Error(`No hay un tono definido para el color ${color}.`);
  }
  const esChaqueta = categoria === 'Chaquetas';
  // El escocés se pinta con cuadros: franjas negras cruzadas sobre el rojo.
  const cuadros =
    estilo === 'escoces'
      ? '<pattern id="c" width="44" height="44" patternUnits="userSpaceOnUse">' +
        `<rect width="44" height="44" fill="${tonos.tela}"/>` +
        '<rect y="14" width="44" height="14" fill="#111" fill-opacity="0.75"/><rect x="14" width="14" height="44" fill="#111" fill-opacity="0.75"/>' +
        '<path d="M0 36 H44 M36 0 V44" stroke="#e8c547" stroke-width="1.5"/></pattern>'
      : '';
  const relleno = cuadros ? 'url(#c)' : tonos.tela;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
    '<defs><radialGradient id="f" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#7a7a84"/><stop offset="1" stop-color="#2a2a30"/></radialGradient>' +
    `${cuadros}</defs>` +
    '<rect width="400" height="500" fill="url(#f)"/>' +
    `<path d="${esChaqueta ? CHAQUETA : PANTALON}" fill="${relleno}" stroke="${tonos.costura}" stroke-width="2" stroke-linejoin="round"/>` +
    (esChaqueta ? detalleChaqueta(estilo, tonos) : detallePantalon(estilo, tonos)) +
    '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const { productos } = JSON.parse(readFileSync(new URL('../../../db/semillas/prendas/catalogo.json', import.meta.url), 'utf8'));

if (process.argv.includes('--vista-previa')) {
  // Escribe las ilustraciones en una página, para revisarlas sin tocar la base.
  const destino = process.argv[process.argv.indexOf('--vista-previa') + 1] ?? 'prendas.html';
  const { writeFileSync } = await import('node:fs');
  const tarjetas = productos.map((p) => `<figure><img src="${ilustracion(p)}" width="200"><figcaption>${p.nombre}</figcaption></figure>`);
  writeFileSync(destino, `<body style="display:flex;flex-wrap:wrap;gap:8px;font:12px sans-serif;background:#111;color:#eee">${tarjetas.join('')}</body>`);
  console.log(`Vista previa en ${destino}`);
  process.exit(0);
}

console.log(`Cargando el catálogo de chaquetas y pantalones en ${API}`);
const bodega = await iniciarSesion(CUENTAS.bodega);
const gerente = await iniciarSesion(CUENTAS.gerente);

const creadas = await crearVariantes(productos, { prefijo: 'semilla-prendas', ilustracion }, bodega);
const conPrecio = await ponerPrecios(productos, bodega, gerente);

console.log(`Variantes creadas: ${creadas} de ${productos.reduce((n, p) => n + Object.keys(p.tallas).length, 0)}`);
console.log(`Productos que recibieron precio: ${conPrecio} de ${productos.length}`);
if (creadas + conPrecio === 0) {
  console.log('Todo estaba cargado: no hubo cambios.');
}
