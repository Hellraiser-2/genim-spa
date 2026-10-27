import { Product } from './models';

/**
 * Búsqueda de productos. Corre completa en el navegador, sobre el catálogo que la tienda
 * ya tiene cargado: el texto que escribe el visitante no viaja al backend ni llega a una
 * consulta SQL, así que no hay nada que inyectar. Lo que sí se cuida aquí:
 *
 * - El texto también puede venir en un enlace (`?q=`), escrito por un tercero. Se limpia
 *   y se acorta siempre, venga de donde venga.
 * - Se compara con `includes`, nunca se convierte en una expresión regular: un texto
 *   rebuscado no puede dejar la página pegada.
 * - Se muestra solo con interpolación de Angular (`{{ }}`), que lo escapa: lo escrito se
 *   ve como texto, no se interpreta como HTML.
 */

/** Largo máximo del texto de búsqueda. El campo lo impone y `cleanQuery` lo repite para lo que llega por la dirección. */
export const MAX_QUERY_LENGTH = 60;

/** Caracteres de control: no se pueden escribir en el campo, pero sí venir en un enlace armado a mano. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Deja el texto de búsqueda en una sola línea, sin caracteres de control, sin espacios de sobra y con largo acotado. */
export function cleanQuery(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

/** Minúsculas y sin tildes, para que "poleron" encuentre "Polerón". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Indica si el producto corresponde a la búsqueda: cada palabra escrita debe ser el
 * comienzo de alguna palabra de su nombre, banda, categoría, color, talla, SKU o
 * descripción. Así "pol neg l" encuentra las poleras negras talla L, y una "l" suelta
 * no calza con cualquier texto que tenga esa letra.
 */
export function matchesQuery(product: Product, query: string): boolean {
  const words = normalize(cleanQuery(query)).split(' ').filter((word) => word !== '');
  if (words.length === 0) {
    return true;
  }
  const text = normalize(
    [product.name, product.band ?? '', product.category, product.color, product.size, product.sku, product.description ?? ''].join(' '),
  );
  // Las palabras tal como están escritas ("ac/dc", "rs-0003") y también sus partes ("dc", "0003").
  const terms = [...text.split(' '), ...text.split(/[^a-z0-9]+/)];
  return words.every((word) => terms.some((term) => term.startsWith(word)));
}
