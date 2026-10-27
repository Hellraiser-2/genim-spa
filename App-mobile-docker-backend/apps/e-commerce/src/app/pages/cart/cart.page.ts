import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from '../../services/cart.service';

/**
 * El carrito ya no es una pantalla: es un panel lateral. Esta ruta se conserva para los
 * enlaces que llevan "al carrito" (volver tras iniciar sesión o tras un pago rechazado):
 * muestra la tienda y abre el panel.
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  template: '',
})
export class CartPage {
  constructor() {
    const cart = inject(CartService);
    void inject(Router)
      .navigateByUrl('/shop', { replaceUrl: true })
      .then(() => cart.open());
  }
}
