import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import type { PedidoCliente } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { receiptOutline } from 'ionicons/icons';
import { OrderCardComponent } from '../../components/order-card.component';
import { errorMessage } from '../../core/api';
import { AuthService } from '../../services/auth.service';
import { ShopApi } from '../../services/shop.api';

/** Pedidos del cliente, del más reciente al más antiguo, con su estado y su código de seguimiento. */
@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon, OrderCardComponent],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="receipt-outline"></ion-icon> Compras</div>
          <h1>Mis pedidos</h1>
        </div>

        <div class="empty" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <app-order-card *ngFor="let o of orders()" [order]="o"></app-order-card>

        <div class="empty" *ngIf="!error() && orders().length === 0">
          <p>{{ loading() ? 'Cargando tus pedidos…' : 'Todavía no tienes pedidos.' }}</p>
          <ion-button *ngIf="!loading()" routerLink="/shop" class="btn-rockstar">Ir a la tienda</ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 20px; }
    .page-title h1 { margin: 8px 0; font-size: 24px; font-weight: 900; }
    .empty { text-align: center; padding: 40px 20px; color: var(--text-faint); }
  `],
})
export class PedidosPage {
  api = inject(ShopApi);
  auth = inject(AuthService);
  router = inject(Router);

  orders = signal<PedidoCliente[]>([]);
  loading = signal(false);
  error = signal('');

  constructor() {
    addIcons({ 'receipt-outline': receiptOutline });
    if (!this.auth.isCustomer()) {
      this.router.navigate(['/entry'], { queryParams: { modo: 'client', volver: '/pedidos' } });
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.orders.set(await this.api.myOrders());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
