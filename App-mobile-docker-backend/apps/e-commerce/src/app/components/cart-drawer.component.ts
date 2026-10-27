import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bagHandleOutline, closeOutline } from 'ionicons/icons';
import { CartService } from '../services/cart.service';
import { CartPanelComponent } from './cart-panel.component';

/** Panel lateral del carrito: entra desde la derecha sobre la pantalla en que se esté. */
@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule, IonIcon, CartPanelComponent],
  template: `
    <div class="backdrop" [class.open]="cart.isOpen()" (click)="cart.close()"></div>
    <aside
      class="drawer"
      [class.open]="cart.isOpen()"
      role="dialog"
      aria-modal="true"
      aria-label="Carrito de compras"
      [attr.aria-hidden]="!cart.isOpen()"
    >
      <header class="drawer-head">
        <div class="drawer-title">
          <ion-icon name="bag-handle-outline" color="danger"></ion-icon>
          <h2>Tu carrito</h2>
          <span class="count" *ngIf="cart.count() > 0">{{ cart.count() }}</span>
        </div>
        <button class="close-btn" aria-label="Cerrar el carrito" (click)="cart.close()">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </header>
      <div class="drawer-body">
        <!-- Se crea al abrir: así el carrito siempre muestra precios y stock del momento. -->
        <app-cart-panel *ngIf="cart.isOpen()"></app-cart-panel>
      </div>
    </aside>
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.6);
      opacity: 0; pointer-events: none;
      transition: opacity 0.25s;
    }
    .backdrop.open { opacity: 1; pointer-events: auto; }
    .drawer {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 1001;
      width: min(420px, 100vw);
      display: flex; flex-direction: column;
      background: var(--bg-base);
      border-left: 1px solid var(--border);
      box-shadow: -20px 0 40px rgba(0, 0, 0, 0.5);
      transform: translateX(100%);
      visibility: hidden;
      transition: transform 0.25s ease, visibility 0s linear 0.25s;
    }
    .drawer.open { transform: translateX(0); visibility: visible; transition: transform 0.25s ease; }
    .drawer-head {
      flex: none;
      display: flex; align-items: center; justify-content: space-between;
      padding: calc(14px + env(safe-area-inset-top)) 16px 14px;
      border-bottom: 1px solid var(--border);
      background: #000;
    }
    .drawer-title { display: flex; align-items: center; gap: 10px; }
    .drawer-title ion-icon { font-size: 22px; }
    .drawer-title h2 { margin: 0; font-size: 18px; font-weight: 900; }
    .count {
      min-width: 22px; padding: 2px 7px; border-radius: 999px;
      background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; text-align: center;
    }
    .close-btn {
      display: grid; place-items: center; width: 36px; height: 36px;
      background: #18181b; border: 1px solid var(--border); border-radius: 10px;
      color: var(--text-muted); font-size: 20px; cursor: pointer;
    }
    .close-btn:hover { color: #fff; border-color: var(--accent); }
    .drawer-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding-bottom: env(safe-area-inset-bottom); }
  `],
})
export class CartDrawerComponent {
  cart = inject(CartService);

  constructor() {
    addIcons({ 'bag-handle-outline': bagHandleOutline, 'close-outline': closeOutline });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.cart.close();
  }
}
