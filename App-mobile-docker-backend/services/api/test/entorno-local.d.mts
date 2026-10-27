import type { PGlite } from '@electric-sql/pglite';

export function iniciarEntornoLocal(opciones?: {
  puertoApi?: number;
  silencioso?: boolean;
}): Promise<{ apiUrl: string; db: PGlite; detener: () => Promise<void> }>;
