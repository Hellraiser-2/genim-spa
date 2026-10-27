import type { TipoMerma, Ubicacion, VarianteStock } from '@rockstar/contracts';

export const UBICACIONES: readonly { valor: Ubicacion; etiqueta: string }[] = [
  { valor: 'BODEGA', etiqueta: 'Bodega' },
  { valor: 'SALA_VENTAS', etiqueta: 'Sala de ventas' },
];

export const TIPOS_MERMA: readonly { valor: TipoMerma; etiqueta: string }[] = [
  { valor: 'DANADO', etiqueta: 'Dañado' },
  { valor: 'MUESTRA', etiqueta: 'Muestra' },
  { valor: 'CAMBIO', etiqueta: 'Cambio' },
];

export function etiquetaUbicacion(ubicacion: Ubicacion): string {
  return UBICACIONES.find((u) => u.valor === ubicacion)?.etiqueta ?? ubicacion;
}

export function otraUbicacion(ubicacion: Ubicacion): Ubicacion {
  return ubicacion === 'BODEGA' ? 'SALA_VENTAS' : 'BODEGA';
}

export function existenciaEn(variante: VarianteStock, ubicacion: Ubicacion): number {
  return variante.existencias.find((e) => e.ubicacion === ubicacion)?.cantidad ?? 0;
}

export function nombreVariante(variante: VarianteStock): string {
  return `${variante.producto} · ${variante.talla} · ${variante.color}`;
}

/** Convierte el texto de un campo en un entero no negativo, o `null` si no lo es. */
export function enteroDesdeTexto(texto: string): number | null {
  const limpio = texto.trim();
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
}

/** Valor de un evento `ionInput` / `ionChange` de Ionic. */
export function valorDeEvento(evento: Event): string {
  const valor = (evento as CustomEvent<{ value?: unknown }>).detail?.value;
  return valor === null || valor === undefined ? '' : String(valor);
}
