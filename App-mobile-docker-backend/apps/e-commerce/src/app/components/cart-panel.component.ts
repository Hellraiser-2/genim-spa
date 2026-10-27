import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonSelect, IonSelectOption, IonInput } from '@ionic/angular/standalone';
import type { Comuna, Region } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { addOutline, removeOutline, trashOutline, cardOutline, alertCircleOutline } from 'ionicons/icons';
import { errorCode, errorMessage } from '../core/api';
import { formatCLP, usePlaceholder } from '../data/models';
import { AuthService } from '../services/auth.service';
import { CartService, ShippingData } from '../services/cart.service';
import { ProductsService } from '../services/products.service';
import { ShopApi } from '../services/shop.api';
import { ToastService } from '../services/toast.service';

/**
 * Contenido del carrito: productos, datos de despacho, totales y el paso al pago. Se
 * crea cada vez que se abre el panel lateral, y al crearse se pone al día con el catálogo.
 */
@Component({
  selector: 'app-cart-panel',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonItem, IonSelect, IonSelectOption, IonInput],
  template: `
      <div class="panel">
        <div class="notice" *ngIf="changes().length > 0" role="status">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <div>
            <div *ngFor="let change of changes()">{{ change }}</div>
          </div>
        </div>

        <ng-container *ngIf="cart.items().length > 0; else empty">
          <div class="cart-items">
            <div class="cart-item" *ngFor="let item of cart.items()">
              <img [src]="item.image" [alt]="item.name" (error)="usePlaceholder($event)" />
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-price">Talla {{ item.size }} · {{ formatCLP(item.price) }}</div>
                <div class="qty-row">
                  <button class="qty-btn" aria-label="Quitar una unidad" (click)="cart.changeQty(item.id, -1)">
                    <ion-icon name="remove-outline"></ion-icon>
                  </button>
                  <span class="qty">{{ item.qty }}</span>
                  <button class="qty-btn" aria-label="Agregar una unidad" [disabled]="item.qty >= item.stock" (click)="cart.changeQty(item.id, 1)">
                    <ion-icon name="add-outline"></ion-icon>
                  </button>
                  <button class="trash-btn" aria-label="Quitar del carrito" (click)="cart.remove(item.id)">
                    <ion-icon name="trash-outline"></ion-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="shipping">
            <label class="lbl">Datos de despacho</label>
            <ion-item lines="none" class="input-item">
              <ion-input
                label="Quien recibe"
                labelPlacement="stacked"
                autocomplete="name"
                [value]="cart.shipping().recipient"
                (ionInput)="setText('recipient', $event)"
              ></ion-input>
            </ion-item>
            <ion-item lines="none" class="input-item">
              <ion-input
                label="Teléfono"
                labelPlacement="stacked"
                type="tel"
                autocomplete="tel"
                placeholder="+56 9 ..."
                [value]="cart.shipping().phone"
                (ionInput)="setText('phone', $event)"
              ></ion-input>
            </ion-item>
            <ion-item lines="none" class="input-item">
              <ion-select
                label="Región"
                labelPlacement="stacked"
                interface="popover"
                placeholder="Elige una región"
                [value]="cart.shipping().regionId"
                (ionChange)="onRegionChange($event)"
              >
                <ion-select-option *ngFor="let r of regions()" [value]="r.idRegion">{{ r.nombre }}</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="none" class="input-item">
              <ion-select
                label="Comuna"
                labelPlacement="stacked"
                interface="popover"
                [placeholder]="cart.shipping().regionId === null ? 'Primero elige la región' : 'Elige una comuna'"
                [disabled]="comunas().length === 0"
                [value]="cart.shipping().comunaId"
                (ionChange)="onComunaChange($event)"
              >
                <ion-select-option *ngFor="let c of comunas()" [value]="c.idComuna">{{ c.nombre }}</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item lines="none" class="input-item">
              <ion-input
                label="Dirección"
                labelPlacement="stacked"
                autocomplete="street-address"
                placeholder="Calle, número, depto."
                [value]="cart.shipping().address"
                (ionInput)="setText('address', $event)"
              ></ion-input>
            </ion-item>
          </div>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <span>{{ formatCLP(cart.subtotal()) }}</span>
            </div>
            <div class="total-row">
              <span>Despacho</span>
              <span>{{ cart.shippingCost() === null ? 'Elige una comuna' : formatCLP(cart.shippingCost()!) }}</span>
            </div>
            <div class="total-row grand">
              <span>Total</span>
              <span class="text-accent">{{ formatCLP(cart.total()) }}</span>
            </div>
          </div>

          <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>

          <ng-container *ngIf="!auth.isAdmin(); else staff">
            <ion-button expand="block" class="btn-rockstar" [disabled]="busy()" (click)="checkout()">
              <ion-icon slot="start" name="card-outline"></ion-icon>
              {{ busy() ? 'Reservando tus productos…' : auth.isCustomer() ? 'Ir a pagar' : 'Iniciar sesión para comprar' }}
            </ion-button>
            <p class="demo-note">Al continuar se reservan tus productos por 15 minutos.</p>
          </ng-container>
          <ng-template #staff>
            <p class="demo-note">Las cuentas del personal no compran en la tienda.</p>
          </ng-template>
        </ng-container>

        <ng-template #empty>
          <div class="empty-state">
            <p>Tu carrito está vacío.</p>
            <ion-button class="btn-rockstar" (click)="keepShopping()">Seguir comprando</ion-button>
          </div>
        </ng-template>
      </div>
  `,
  styles: [`
    .panel { padding: 16px; }
    .notice {
      display: flex; gap: 10px; align-items: flex-start;
      margin-bottom: 16px; padding: 12px;
      border: 1px solid #854d0e; border-radius: 12px;
      background: rgba(133, 77, 14, 0.2); color: #fde68a; font-size: 13px; line-height: 1.5;
    }
    .notice ion-icon { flex: none; font-size: 18px; margin-top: 1px; }
    .cart-items { display: flex; flex-direction: column; gap: 12px; }
    .cart-item {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #18181b;
    }
    .cart-item img { width: 56px; height: 64px; object-fit: cover; border-radius: 8px; filter: grayscale(0.8); }
    .item-info { flex: 1; min-width: 0; }
    .item-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-price { font-size: 11px; color: var(--text-faint); margin-top: 4px; }
    .qty-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .qty-btn {
      background: #18181b; border: none; border-radius: 6px;
      width: 24px; height: 24px; display: grid; place-items: center; cursor: pointer;
      color: var(--text-muted);
    }
    .qty-btn:disabled { opacity: 0.4; cursor: default; }
    .qty { font-size: 12px; min-width: 16px; text-align: center; }
    .trash-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--text-faint); margin-left: auto;
    }
    .trash-btn:hover { color: var(--accent); }
    .shipping { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
    .lbl { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; }
    .input-item {
      --background: #0c0c0c;
      --border-radius: 12px;
      --border: 1px solid var(--border);
      --padding-start: 12px;
    }
    .totals { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
    .total-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); }
    .total-row.grand { font-size: 18px; font-weight: 900; color: var(--text); padding-top: 8px; border-top: 1px solid #18181b; }
    .error-msg {
      margin: 16px 0 0;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(127, 29, 29, 0.3);
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      font-size: 13px;
    }
    .btn-rockstar { margin-top: 16px; }
    .demo-note { text-align: center; font-size: 11px; color: var(--text-faint); margin: 12px 0 0; }
    .empty-state { text-align: center; padding: 60px 20px; }
    .empty-state p { color: var(--text-faint); margin-bottom: 20px; }
  `],
})
export class CartPanelComponent {
  cart = inject(CartService);
  auth = inject(AuthService);
  products = inject(ProductsService);
  api = inject(ShopApi);
  toast = inject(ToastService);
  router = inject(Router);

  regions = signal<Region[]>([]);
  comunas = signal<Comuna[]>([]);
  /** Lo que cambió en el carrito al ponerlo al día con el catálogo. */
  changes = signal<string[]>([]);
  error = signal('');
  busy = signal(false);

  formatCLP = formatCLP;
  usePlaceholder = usePlaceholder;

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'remove-outline': removeOutline,
      'trash-outline': trashOutline,
      'card-outline': cardOutline,
      'alert-circle-outline': alertCircleOutline,
    });
    void this.refresh();
  }

  keepShopping() {
    this.cart.close();
    this.router.navigateByUrl('/shop');
  }

  /** Pone el carrito al día con los precios y la disponibilidad actuales, y carga los destinos. */
  private async refresh() {
    try {
      await this.products.load();
      if (this.products.error()) {
        this.error.set(this.products.error()!);
      } else {
        this.changes.set(this.cart.sync());
      }
      this.regions.set(await this.api.regions());
      const { regionId } = this.cart.shipping();
      if (regionId !== null) {
        this.comunas.set(await this.api.comunas(regionId));
      }
      await this.cart.quote();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  setText(field: 'recipient' | 'phone' | 'address', ev: Event) {
    const patch: Partial<ShippingData> = { [field]: String((ev as CustomEvent).detail.value ?? '') };
    this.cart.setShipping(patch);
  }

  async onRegionChange(ev: Event) {
    const regionId = (ev as CustomEvent).detail.value as number;
    if (regionId === this.cart.shipping().regionId) return;
    this.cart.setShipping({ regionId, comunaId: null });
    this.cart.shippingCost.set(null);
    this.comunas.set([]);
    try {
      this.comunas.set(await this.api.comunas(regionId));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  async onComunaChange(ev: Event) {
    const comunaId = (ev as CustomEvent).detail.value as number | null;
    if (comunaId === this.cart.shipping().comunaId) return;
    this.cart.setShipping({ comunaId });
    this.error.set('');
    try {
      await this.cart.quote();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  async checkout() {
    if (this.busy()) return;
    if (!this.auth.isCustomer()) {
      this.toast.show('Inicia sesión o crea tu cuenta para comprar. Tu carrito se conserva.');
      this.cart.close();
      // `/cart` vuelve a la tienda con este panel abierto.
      this.router.navigate(['/entry'], { queryParams: { modo: 'client', volver: '/cart' } });
      return;
    }
    const missing = this.cart.missingShippingField();
    if (missing) {
      this.error.set(missing);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.cart.checkout();
      this.cart.close();
      this.router.navigateByUrl('/pago');
    } catch (error) {
      this.error.set(errorMessage(error));
      if (errorCode(error) === 'STOCK_INSUFICIENTE') {
        // Otro cliente compró antes: el carrito se ajusta a lo que queda.
        await this.products.load();
        this.changes.set(this.cart.sync());
      }
    } finally {
      this.busy.set(false);
    }
  }
}
