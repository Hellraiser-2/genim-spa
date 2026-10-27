import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SesionService } from './sesion.service';

/** Solo deja pasar a las pantallas de inventario con una sesión iniciada. */
export const sesionGuard: CanActivateFn = () =>
  inject(SesionService).autenticado() ? true : inject(Router).createUrlTree(['/login']);

/** Evita mostrar el inicio de sesión a quien ya tiene una sesión vigente. */
export const sinSesionGuard: CanActivateFn = () =>
  inject(SesionService).autenticado() ? inject(Router).createUrlTree(['/inicio']) : true;
