import { Routes } from '@angular/router';

import { sesionGuard, sinSesionGuard } from './core/sesion/sesion.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [sinSesionGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [sesionGuard],
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./features/inicio/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'consulta',
        loadComponent: () => import('./features/consulta/consulta.page').then((m) => m.ConsultaPage),
      },
      {
        path: 'ingreso',
        loadComponent: () => import('./features/ingreso/ingreso.page').then((m) => m.IngresoPage),
      },
      {
        path: 'ingreso/producto-nuevo',
        loadComponent: () => import('./features/ingreso/producto-nuevo.page').then((m) => m.ProductoNuevoPage),
      },
      {
        path: 'producto/editar',
        loadComponent: () => import('./features/producto/editar-producto.page').then((m) => m.EditarProductoPage),
      },
      {
        path: 'merma',
        loadComponent: () => import('./features/merma/merma.page').then((m) => m.MermaPage),
      },
      {
        path: 'espacios',
        loadComponent: () => import('./features/espacios/espacios.page').then((m) => m.EspaciosPage),
      },
      {
        path: 'envios',
        loadComponent: () => import('./features/envios/envios.page').then((m) => m.EnviosPage),
      },
      // Etiquetas y edición no están en el menú: se abren desde la ficha de una prenda.
      {
        path: 'etiquetas',
        loadComponent: () => import('./features/etiquetas/etiquetas.page').then((m) => m.EtiquetasPage),
      },
      {
        path: '',
        redirectTo: 'inicio',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'inicio',
  },
];
