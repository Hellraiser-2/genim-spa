import type { Ubicacion } from '@rockstar/contracts';

/** Identificadores fijos de `inventario.ubicaciones`, cargados por la migración. */
export const ID_UBICACION: Readonly<Record<Ubicacion, number>> = { BODEGA: 1, SALA_VENTAS: 2 };
export const UBICACIONES = Object.keys(ID_UBICACION) as Ubicacion[];

export function esUbicacion(valor: unknown): valor is Ubicacion {
  // `in` aceptaría también nombres heredados como "toString".
  return typeof valor === 'string' && Object.hasOwn(ID_UBICACION, valor);
}

const soloLetras = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();

/**
 * Elige las letras de la zona de bodega de una categoría nueva: las dos primeras de su
 * nombre más una tercera que no choque con las zonas ya usadas. "Poleras" es `POL` y
 * "Polerones", que empieza igual, avanza a `POE`.
 */
export function elegirZona(categoria: string, usadas: ReadonlySet<string>): string {
  const letras = soloLetras(categoria).padEnd(3, 'X');
  const prefijo = letras.slice(0, 2);
  const libre = [...letras.slice(2)].map((letra) => prefijo + letra).find((zona) => !usadas.has(zona));
  if (libre) {
    return libre;
  }
  // Todas las letras del nombre están tomadas: se numera.
  for (let numero = 1; ; numero++) {
    const zona = `${prefijo}${numero}`;
    if (!usadas.has(zona)) {
      return zona;
    }
  }
}

/** Código de ubicación de un producto en la bodega, por ejemplo `B-POL-03`. */
export function codigoDeUbicacion(zona: string, posicion: number): string {
  return `B-${zona}-${String(posicion).padStart(2, '0')}`;
}

/** SKU y código escaneable de una variante, derivados de su identificador. */
export function codigosDeVariante(idVariante: number): { sku: string; codigo: string } {
  const correlativo = String(idVariante).padStart(4, '0');
  return { sku: `RS-${correlativo}`, codigo: `780000000${correlativo}` };
}
