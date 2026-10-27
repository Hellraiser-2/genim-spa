import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { API_URL } from './api';

/**
 * Agrega el token de acceso a las llamadas al backend. Si el token venció, renueva la
 * sesión una vez con el token de refresco y repite la llamada.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_URL) || req.url.includes('/usuarios/auth/')) {
    return next(req);
  }
  const auth = inject(AuthService);
  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !auth.isLoggedIn()) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((token) => (token ? next(withToken(token)) : throwError(() => error))),
      );
    }),
  );
};
