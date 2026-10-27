import { Module } from '@nestjs/common';

import { PASARELA, PasarelaSimulada } from './pasarela.js';

@Module({
  // Mientras no haya credenciales de Transbank, los pagos los resuelve el doble de Webpay.
  providers: [{ provide: PASARELA, useClass: PasarelaSimulada }],
  exports: [PASARELA],
})
export class PagosModule {}
