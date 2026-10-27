// Levanta la API compilada contra un PostgreSQL embebido (PGlite), sin Docker ni
// instalación. Sirve para las pruebas de contrato y para probar la app en un equipo
// donde los contenedores no están disponibles. Los datos viven en memoria: se pierden al cerrar.
//
//   npm run local            (desde services/api; deja la API en http://localhost:3000)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const RAIZ_API = fileURLToPath(new URL('..', import.meta.url));

function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolver(port));
    });
  });
}

async function esperarSalud(url, proceso) {
  for (let intento = 0; intento < 150; intento++) {
    if (proceso.exitCode !== null) {
      throw new Error(`La API terminó al arrancar (código ${proceso.exitCode}).`);
    }
    try {
      if ((await fetch(`${url}/salud`)).ok) {
        return;
      }
    } catch {
      // Aún no escucha.
    }
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  throw new Error('La API no respondió a tiempo.');
}

/**
 * @param {{ puertoApi?: number, silencioso?: boolean }} [opciones]
 * @returns {Promise<{ apiUrl: string, db: PGlite, detener: () => Promise<void> }>}
 */
export async function iniciarEntornoLocal({ puertoApi, silencioso = false } = {}) {
  const db = await PGlite.create();
  const puertoDb = await puertoLibre();
  // PGlite tiene una sola sesión: una conexión a la vez, para que las transacciones no se mezclen.
  const servidorDb = new PGLiteSocketServer({ db, port: puertoDb, host: '127.0.0.1', maxConnections: 1 });
  await servidorDb.start();

  const puerto = puertoApi ?? (await puertoLibre());
  const claves = mkdtempSync(join(tmpdir(), 'rockstar-claves-'));
  const api = spawn(process.execPath, ['dist/services/api/src/main.js'], {
    cwd: RAIZ_API,
    env: {
      ...process.env,
      PUERTO: String(puerto),
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${puertoDb}/postgres`,
      DB_POOL_MAX: '1',
      JWT_CLAVES_DIR: claves,
      SEMBRAR_DEMO: 'true',
    },
    stdio: silencioso ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });

  const detener = async () => {
    if (api.exitCode === null) {
      api.kill();
      await new Promise((resolver) => api.once('exit', resolver));
    }
    await servidorDb.stop();
    await db.close();
    rmSync(claves, { recursive: true, force: true });
  };

  const apiUrl = `http://127.0.0.1:${puerto}/api/v1`;
  try {
    await esperarSalud(apiUrl, api);
  } catch (error) {
    await detener();
    throw error;
  }
  // La base se entrega para que una prueba pueda preparar o revisar datos que la API no expone.
  return { apiUrl, db, detener };
}

// Ejecutado directamente: deja la API arriba hasta Ctrl+C.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { apiUrl, detener } = await iniciarEntornoLocal({ puertoApi: Number(process.env.PUERTO ?? 3000) });
  console.log(`\nAPI local con base en memoria: ${apiUrl}\nCuenta de prueba: bodega@rockstar.cl / bodega123\nCtrl+C para detener.\n`);
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.once(senal, () => void detener().then(() => process.exit(0)));
  }
}
