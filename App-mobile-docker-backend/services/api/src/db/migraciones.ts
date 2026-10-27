import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';

import type { BaseDeDatos } from './base-de-datos.js';

/** Número arbitrario y fijo: identifica el candado que serializa a quienes migran a la vez. */
const CANDADO_MIGRACIONES = 7_301_001;

/**
 * Aplica, en orden alfabético, los archivos `.sql` del directorio que aún no se han
 * aplicado y los anota en `public.migraciones`, de modo que repetir la ejecución no
 * hace nada. Todas las pendientes corren en una sola transacción: si una falla, la
 * base queda como estaba.
 */
export async function aplicarMigraciones(db: BaseDeDatos, directorio: string): Promise<string[]> {
  const log = new Logger('Migraciones');
  const archivos = (await readdir(directorio)).filter((nombre) => nombre.endsWith('.sql')).sort();

  return db.transaccion(async (tx) => {
    await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CANDADO_MIGRACIONES]);
    await tx.consultar(`
      CREATE TABLE IF NOT EXISTS public.migraciones (
        nombre text PRIMARY KEY,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);
    const aplicadas = new Set(
      (await tx.consultar<{ nombre: string }>('SELECT nombre FROM public.migraciones')).map((fila) => fila.nombre),
    );
    const nuevas = archivos.filter((nombre) => !aplicadas.has(nombre));
    for (const nombre of nuevas) {
      await tx.consultar(await readFile(join(directorio, nombre), 'utf8'));
      await tx.consultar('INSERT INTO public.migraciones (nombre) VALUES ($1)', [nombre]);
      log.log(`Aplicada ${nombre}`);
    }
    return nuevas;
  });
}
