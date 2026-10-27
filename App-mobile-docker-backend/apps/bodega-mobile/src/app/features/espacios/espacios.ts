import type { VarianteStock } from '@rockstar/contracts';

/**
 * Espacio de la bodega: la repisa o el colgador donde se guarda un producto, con todas
 * sus tallas y colores. Se identifica por su código, por ejemplo `B-POL-03`: la zona de
 * la categoría y un número correlativo dentro de ella.
 */
export interface Espacio {
  codigo: string;
  /** Las tres letras de la zona: `POL`. */
  zona: string;
  /** El número del espacio dentro de su zona: `03`. */
  numero: string;
  producto: string;
  categoria: string;
  banda: string | null;
  imagenUrl: string | null;
  /** Tallas y colores guardados en el espacio. */
  variantes: number;
  /** Unidades que hay en la bodega; no cuenta las de la sala de ventas. */
  unidadesEnBodega: number;
}

const FORMATO = /^B-([^-]+)-(.+)$/i;

/** Verdadero si el texto tiene la forma del código de un espacio (`B-POL-03`). */
export function esCodigoDeEspacio(texto: string): boolean {
  return FORMATO.test(texto.trim());
}

/** Un espacio por cada código de ubicación, ordenados por zona y número. */
export function agruparEspacios(variantes: VarianteStock[]): Espacio[] {
  const espacios = new Map<string, Espacio>();
  for (const variante of variantes) {
    const codigo = variante.codigoUbicacion;
    let espacio = espacios.get(codigo);
    if (!espacio) {
      const partes = FORMATO.exec(codigo);
      espacio = {
        codigo,
        zona: partes?.[1] ?? '',
        numero: partes?.[2] ?? codigo,
        producto: variante.producto,
        categoria: variante.categoria,
        banda: variante.banda,
        imagenUrl: variante.imagenUrl,
        variantes: 0,
        unidadesEnBodega: 0,
      };
      espacios.set(codigo, espacio);
    }
    espacio.variantes += 1;
    espacio.unidadesEnBodega += variante.existencias.find((e) => e.ubicacion === 'BODEGA')?.cantidad ?? 0;
  }
  // Con `numeric`, B-POL-10 queda después de B-POL-9 y no entre el 1 y el 2.
  return [...espacios.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

/** Espacios cuyo código, producto, categoría o banda contienen el texto. */
export function filtrarEspacios(espacios: Espacio[], texto: string): Espacio[] {
  const consulta = texto.trim().toLowerCase();
  if (consulta === '') {
    return espacios;
  }
  return espacios.filter((espacio) =>
    [espacio.codigo, espacio.producto, espacio.categoria, espacio.banda ?? ''].some((campo) =>
      campo.toLowerCase().includes(consulta),
    ),
  );
}
