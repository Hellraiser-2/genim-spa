import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, types } from 'pg';

import { CONFIGURACION, type Configuracion } from '../config.js';

// PostgreSQL entrega `bigint` como texto para no perder precisión. Los identificadores
// y sumas de este sistema caben de sobra en un número de JavaScript.
const OID_BIGINT = 20;
types.setTypeParser(OID_BIGINT, Number);

/** Algo capaz de ejecutar SQL: la base misma o una transacción abierta. */
export interface Ejecutor {
  consultar<T>(sql: string, parametros?: unknown[]): Promise<T[]>;
}

@Injectable()
export class BaseDeDatos implements Ejecutor, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    this.pool = new Pool({ connectionString: configuracion.databaseUrl, max: configuracion.poolMax });
  }

  async consultar<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    return (await this.pool.query(sql, parametros)).rows as T[];
  }

  /**
   * Ejecuta la operación en una transacción: se confirma si termina y se deshace
   * completa si lanza un error. Dentro, todo el SQL debe ir por el ejecutor recibido.
   */
  async transaccion<T>(operacion: (tx: Ejecutor) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    const tx: Ejecutor = {
      consultar: async <F>(sql: string, parametros: unknown[] = []) => (await cliente.query(sql, parametros)).rows as F[],
    };
    try {
      await cliente.query('BEGIN');
      const resultado = await operacion(tx);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
