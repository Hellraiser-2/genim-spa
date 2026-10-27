import type { ArticuloCatalogo } from '../lib/api';

/** Minusculas y sin tildes: "Camión" y "camion" se encuentran igual. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palabras de una prenda; las compuestas ("RS-0003") tambien por partes. */
function palabras(p: ArticuloCatalogo): string[] {
  const enteras = normalizar([p.producto, p.banda ?? '', p.categoria, p.color, p.sku].join(' ')).split(/\s+/);
  return [...enteras, ...enteras.flatMap((w) => w.split(/[-_/.]+/))].filter(Boolean);
}

/**
 * Prendas del catalogo que calzan con lo escrito, en cualquier orden. Cada palabra debe
 * ser el comienzo de una palabra del nombre, la banda, la categoria, el color o el SKU.
 * Una palabra que es una talla del catalogo ("m", "xl") filtra por esa talla: si no, la
 * "l" de "polera l" calzaria con cualquier prenda que tenga una palabra con "l".
 */
export function buscarEnCatalogo(catalogo: ArticuloCatalogo[], consulta: string): ArticuloCatalogo[] {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return [];
  const tallas = new Set(catalogo.map((p) => normalizar(p.talla)));
  return catalogo.filter((p) => {
    const suyas = palabras(p);
    const talla = normalizar(p.talla);
    return terminos.every((t) => (tallas.has(t) ? talla === t : suyas.some((w) => w.startsWith(t))));
  });
}

/** La prenda cuyo SKU es exactamente lo escrito, sin importar mayusculas. */
export function porSku(catalogo: ArticuloCatalogo[], sku: string): ArticuloCatalogo | undefined {
  const buscado = sku.trim().toUpperCase();
  return buscado ? catalogo.find((p) => p.sku.toUpperCase() === buscado) : undefined;
}
