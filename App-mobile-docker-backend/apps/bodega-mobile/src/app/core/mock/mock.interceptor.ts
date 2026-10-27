import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, delay, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ServidorService } from '../api/servidor.service';
import { BackendSimulado } from './backend-simulado';

const DEMORA_MS = 150;

/** Responde las solicitudes a la API con el backend simulado mientras la app está en modo demostración. */
export const mockInterceptor: HttpInterceptorFn = (solicitud, next) => {
  if (!inject(ServidorService).modoDemo() || !solicitud.url.startsWith(environment.apiUrl)) {
    return next(solicitud);
  }
  const backend = inject(BackendSimulado);
  const ruta = solicitud.urlWithParams.slice(environment.apiUrl.length);
  const token = solicitud.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;

  return defer(() => {
    const { status, body } = backend.manejar(solicitud.method, ruta, solicitud.body, token);
    if (status >= 400) {
      return throwError(() => new HttpErrorResponse({ status, error: body, url: solicitud.url }));
    }
    return of(new HttpResponse({ status, body, url: solicitud.url }));
  }).pipe(delay(DEMORA_MS));
};
