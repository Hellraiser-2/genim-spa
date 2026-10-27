const MARCA_ENIE = '\u0001';

/**
 * Forma de un nombre para compararlo sin distinguir mayúsculas ni tildes, de modo que
 * "Metállica" y "metallica" sean la misma banda. La ñ se conserva: en español es otra letra.
 */
export function claveDe(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .replaceAll('ñ', MARCA_ENIE)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll(MARCA_ENIE, 'ñ')
    .replace(/\s+/g, ' ');
}

/** Orden alfabético en español, el mismo que usan las listas de la app. */
export function ordenar(nombres: string[]): string[] {
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Escapa los comodines de `LIKE` para buscar el texto tal cual. */
export function patronLike(textoBuscado: string): string {
  return `%${textoBuscado.replace(/[\\%_]/g, '\\$&')}%`;
}
