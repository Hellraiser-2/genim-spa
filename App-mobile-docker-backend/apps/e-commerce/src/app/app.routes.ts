import { Routes } from '@angular/router';

export const routes: Routes = [
  // La página abre en la tienda como invitado; iniciar sesión se ofrece en un recuadro pequeño y en la pestaña "Ingresar".
  { path: '', redirectTo: 'shop', pathMatch: 'full' },
  {
    path: 'entry',
    loadComponent: () => import('./pages/entry/entry.page').then((m) => m.EntryPage),
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'producto/:id',
    loadComponent: () => import('./pages/product/product.page').then((m) => m.ProductPage),
  },
  {
    path: 'bandas',
    loadComponent: () => import('./pages/bandas/bandas.page').then((m) => m.BandasPage),
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'pago',
    loadComponent: () => import('./pages/pago/pago.page').then((m) => m.PagoPage),
  },
  {
    path: 'pedidos',
    loadComponent: () => import('./pages/pedidos/pedidos.page').then((m) => m.PedidosPage),
  },
  {
    path: 'perfil',
    loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage),
  },
  {
    path: 'warehouse',
    loadComponent: () => import('./pages/warehouse/warehouse.page').then((m) => m.WarehousePage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'inversion',
    loadComponent: () => import('./pages/inversion/inversion.page').then((m) => m.InversionPage),
  },
  {
    path: 'support',
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  { path: '**', redirectTo: 'shop' },
];
