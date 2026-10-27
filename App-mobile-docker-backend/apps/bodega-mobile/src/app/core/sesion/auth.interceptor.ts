import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { SesionService } from './sesion.service';

function conToken(solicitud: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? solicitud.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : solicitud;
}

/**
 * Añade el token de acceso a cada solicitud. Ante un 401 intenta renovar la sesión
 * y repetir la solicitud; si no es posible, cierra la sesión y vuelve al inicio de sesión.
 */
export const authInterceptor: HttpInterceptorFn = (solicitud, next) => {
  if (solicitud.url.includes('/usuarios/auth/')) {
    return next(solicitud);
  }
  const sesion = inject(SesionService);
  const router = inject(Router);

  return next(conToken(solicitud, sesion.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(sesion.renovar()).pipe(
        switchMap((renovada) => {
          if (renovada) {
            return next(conToken(solicitud, sesion.accessToken()));
          }
          return from(sesion.cerrarPorExpiracion()).pipe(
            switchMap(() => {
              void router.navigateByUrl('/login');
              return throwError(() => error);
            }),
          );
        }),
      );
    }),
  );
};
