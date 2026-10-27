import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ServidorService } from './servidor.service';

/**
 * Envía cada solicitud a la API al servidor que el usuario eligió. Va al final de la
 * cadena, después del backend simulado, que en modo demostración responde antes.
 */
export const servidorInterceptor: HttpInterceptorFn = (solicitud, next) => {
  const url = inject(ServidorService).resolver(solicitud.url);
  return next(url === solicitud.url ? solicitud : solicitud.clone({ url }));
};
