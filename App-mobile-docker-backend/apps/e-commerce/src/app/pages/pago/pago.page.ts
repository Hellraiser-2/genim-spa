import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import type { CheckoutResponse, ResultadoPago } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cardOutline, checkmarkCircleOutline, closeCircleOutline, timeOutline } from 'ionicons/icons';
import { errorMessage } from '../../core/api';
import { formatCLP } from '../../data/models';
import { CartService } from '../../services/cart.service';
import { ProductsService } from '../../services/products.service';
import { ShopApi } from '../../services/shop.api';

/**
 * Pago de la compra. Hoy hace de pasarela simulada: no pide tarjeta ni cobra, y quien
 * prueba elige si el pago se aprueba o se rechaza. Con Webpay real, aquí se redirige al
 * banco y al volver se informa el resultado al mismo endpoint.
 */
@Component({
  selector: 'app-pago',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="pay-card" *ngIf="!result() && purchase() as p">
          <div class="section-title"><ion-icon name="card-outline"></ion-icon> Pago</div>
          <h1>Compra #{{ p.idVenta }}</h1>
          <div class="rows">
            <div class="row"><span>Productos</span><span>{{ formatCLP(p.subtotal) }}</span></div>
            <div class="row"><span>Despacho</span><span>{{ formatCLP(p.flete) }}</span></div>
            <div class="row grand"><span>Total a pagar</span><span class="text-accent">{{ formatCLP(p.total) }}</span></div>
          </div>
          <p class="sim-note">
            Pasarela de pago simulada: no se pide tarjeta ni se cobra dinero. Elige cómo termina el pago.
          </p>
          <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>
          <ion-button expand="block" class="btn-rockstar" [disabled]="busy()" (click)="pay(true)">
            {{ busy() ? 'Procesando…' : 'Aprobar pago' }}
          </ion-button>
          <ion-button expand="block" class="btn-outline" [disabled]="busy()" (click)="pay(false)">Rechazar pago</ion-button>
          <p class="hold-note">
            <ion-icon name="time-outline"></ion-icon>
            Tus productos están reservados hasta las {{ holdUntil(p) }}.
          </p>
        </div>

        <div class="pay-card center" *ngIf="result() as r">
          <ng-container *ngIf="r.estado === 'PAGADA'">
            <ion-icon class="big ok" name="checkmark-circle-outline"></ion-icon>
            <h1>¡Compra confirmada!</h1>
            <p class="text-muted">Tu pedido es el <strong>#{{ r.idPedido }}</strong>. Pagaste {{ formatCLP(r.total) }}.</p>
            <p class="text-faint small">Código de autorización {{ r.codigoAutorizacion }}</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/pedidos">Ver mis pedidos</ion-button>
            <ion-button expand="block" class="btn-outline" routerLink="/shop">Seguir comprando</ion-button>
          </ng-container>
          <ng-container *ngIf="r.estado === 'RECHAZADA'">
            <ion-icon class="big bad" name="close-circle-outline"></ion-icon>
            <h1>Pago rechazado</h1>
            <p class="text-muted">{{ r.motivo }}</p>
            <p class="text-faint small">No se hizo ningún cobro. Tu carrito conserva sus productos.</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/cart">Volver al carrito</ion-button>
          </ng-container>
          <ng-container *ngIf="r.estado === 'EXPIRADA'">
            <ion-icon class="big bad" name="time-outline"></ion-icon>
            <h1>La reserva venció</h1>
            <p class="text-muted">Pasaron más de 15 minutos sin pagar y los productos volvieron a la tienda.</p>
            <p class="text-faint small">No se hizo ningún cobro. Tu carrito conserva sus productos.</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/cart">Volver al carrito</ion-button>
          </ng-container>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .pay-card {
      max-width: 480px; margin: 24px auto;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 24px;
    }
    .pay-card.center { text-align: center; }
    h1 { margin: 8px 0 16px; font-size: 24px; font-weight: 900; }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); }
    .row.grand { font-size: 18px; font-weight: 900; color: var(--text); padding-top: 10px; border-top: 1px solid var(--border); }
    .sim-note {
      margin: 20px 0 4px; padding: 12px; border-radius: 12px;
      border: 1px dashed var(--border); color: var(--text-muted); font-size: 13px; line-height: 1.5;
    }
    .btn-rockstar { margin-top: 12px; }
    .btn-outline { margin-top: 8px; }
    .hold-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 16px 0 0; font-size: 12px; color: var(--text-faint); }
    .error-msg {
      margin: 12px 0 0; padding: 10px 12px; border-radius: 8px;
      background: rgba(127, 29, 29, 0.3); border: 1px solid #7f1d1d; color: #fca5a5; font-size: 13px;
    }
    .big { font-size: 64px; }
    .big.ok { color: var(--success); }
    .big.bad { color: var(--accent-hover); }
    .small { font-size: 12px; }
  `],
})
export class PagoPage {
  cart = inject(CartService);
  products = inject(ProductsService);
  api = inject(ShopApi);
  router = inject(Router);

  purchase = this.cart.pending;
  result = signal<ResultadoPago | null>(null);
  busy = signal(false);
  error = signal('');
  formatCLP = formatCLP;

  constructor() {
    addIcons({
      'card-outline': cardOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'time-outline': timeOutline,
    });
    if (!this.purchase()) {
      this.router.navigateByUrl('/cart');
    }
  }

  holdUntil(purchase: CheckoutResponse): string {
    return new Date(purchase.expiraEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  /** Informa al backend cómo terminó el pago. Repetirlo responde lo ya resuelto, así que se puede reintentar. */
  async pay(approve: boolean) {
    const purchase = this.purchase();
    if (!purchase || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.resolvePayment(purchase.tokenPago, approve);
      this.result.set(result);
      this.cart.finishPayment(result.estado === 'PAGADA');
      // Lo vendido, o lo liberado, cambia la disponibilidad que muestra la tienda.
      void this.products.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
