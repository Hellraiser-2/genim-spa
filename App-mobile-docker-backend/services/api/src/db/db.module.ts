import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';

import { CONFIGURACION, type Configuracion, leerConfiguracion } from '../config.js';
import { BaseDeDatos } from './base-de-datos.js';
import { sembrarDatosDemo } from './datos-demo.js';
import { aplicarMigraciones } from './migraciones.js';

/** Configuración y acceso a PostgreSQL, disponibles para todos los módulos. */
@Global()
@Module({
  providers: [{ provide: CONFIGURACION, useFactory: () => leerConfiguracion() }, BaseDeDatos],
  exports: [CONFIGURACION, BaseDeDatos],
})
export class DbModule implements OnModuleInit {
  constructor(
    private readonly db: BaseDeDatos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  /** Deja la base al día antes de que el servicio empiece a atender solicitudes. */
  async onModuleInit(): Promise<void> {
    await aplicarMigraciones(this.db, this.configuracion.directorioMigraciones);
    if (this.configuracion.sembrarDemo) {
      await sembrarDatosDemo(this.db);
    }
  }
}
