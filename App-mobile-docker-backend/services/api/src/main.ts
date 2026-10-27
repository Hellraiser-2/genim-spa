import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { CONFIGURACION, type Configuracion } from './config.js';

interface Solicitud {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

interface Respuesta {
  statusCode: number;
  setHeader(nombre: string, valor: string): void;
  on(evento: 'finish', accion: () => void): void;
}

const CABECERA_CORRELACION = 'x-correlacion-id';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
const configuracion = app.get<Configuracion>(CONFIGURACION);
const accesos = new Logger('Acceso');

app.setGlobalPrefix('api/v1');
app.disable('x-powered-by');
// La foto de un producto nuevo viaja en el cuerpo como data URL, ya reducida por la app.
app.useBodyParser('json', { limit: '8mb' });
app.enableCors({ origin: configuracion.origenesCors, exposedHeaders: [CABECERA_CORRELACION] });
app.enableShutdownHooks();

// Cada solicitud lleva un identificador de correlación, que vuelve en la respuesta y queda en el registro.
app.use((solicitud: Solicitud, respuesta: Respuesta, siguiente: () => void) => {
  const recibido = solicitud.headers[CABECERA_CORRELACION];
  const correlacion = typeof recibido === 'string' && recibido !== '' ? recibido : randomUUID();
  const inicio = Date.now();
  respuesta.setHeader(CABECERA_CORRELACION, correlacion);
  respuesta.on('finish', () => {
    accesos.log(`${solicitud.method} ${solicitud.originalUrl} ${respuesta.statusCode} ${Date.now() - inicio}ms ${correlacion}`);
  });
  siguiente();
});

await app.listen(configuracion.puerto, '0.0.0.0');
new Logger('Arranque').log(`API escuchando en el puerto ${configuracion.puerto}`);
