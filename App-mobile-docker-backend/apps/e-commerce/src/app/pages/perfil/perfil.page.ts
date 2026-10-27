import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import type { CompraPendiente, PedidoCliente, PerfilUsuario } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { callOutline, cardOutline, locationOutline, logOutOutline, mailOutline, personCircleOutline, receiptOutline, timeOutline } from 'ionicons/icons';
import { OrderCardComponent } from '../../components/order-card.component';
import { errorMessage } from '../../core/api';
import { formatCLP, formatDate, formatPhone, roleLabel } from '../../data/models';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { ShopApi } from '../../services/shop.api';
import { ToastService } from '../../services/toast.service';

const DATE_ONLY = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' });

/**
 * Perfil de la cuenta con sesión iniciada: sus datos y, si es de un cliente, sus compras.
 * Las pendientes son las que aún esperan pago, y se pueden retomar; las hechas son las
 * pagadas, con el estado de su pedido.
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon, OrderCardComponent],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="person-circle-outline"></ion-icon> Mi cuenta</div>
          <h1>Perfil</h1>
        </div>

        <div class="load-error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <!-- Datos de la cuenta -->
        <div class="account" *ngIf="auth.user() as u">
          <div class="avatar" aria-hidden="true">{{ initial(u.name) }}</div>
          <div class="account-data">
            <div class="account-name">{{ profile()?.nombre ?? u.name }}</div>
            <div class="account-row">
              <ion-icon name="mail-outline" aria-hidden="true"></ion-icon>
              <span>{{ profile()?.email ?? u.email }}</span>
            </div>
            <ng-container *ngIf="profile() as p">
              <div class="account-row" *ngIf="p.telefono">
                <ion-icon name="call-outline" aria-hidden="true"></ion-icon>
                <span>{{ formatPhone(p.telefono) }}</span>
              </div>
              <div class="account-row" *ngIf="p.direccion">
                <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
                <span>{{ p.direccion }}</span>
              </div>
              <div class="account-row">
                <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
                <span>Cuenta creada el {{ dateOnly(p.creadoEn) }}</span>
              </div>
            </ng-container>
            <span class="role">{{ u.role }}</span>
          </div>
        </div>

        <ng-container *ngIf="auth.isCustomer()">
          <div class="summary">
            <div class="summary-item">
              <div class="summary-value">{{ pending().length }}</div>
              <div class="summary-label">Por pagar</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">{{ orders().length }}</div>
              <div class="summary-label">Compras hechas</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">{{ formatCLP(spent()) }}</div>
              <div class="summary-label">Total comprado</div>
            </div>
          </div>

          <!-- Compras pendientes: iniciadas y sin pagar -->
          <h2 class="group-title"><ion-icon name="card-outline"></ion-icon> Compras pendientes</h2>
          <p class="group-note" *ngIf="pending().length > 0">
            Tus productos están reservados hasta la hora indicada. Si no pagas a tiempo, la compra se anula sola y no se cobra nada.
          </p>
          <div class="pending" *ngFor="let c of pending()">
            <div class="pending-head">
              <div>
                <div class="order-number">Compra #{{ c.idVenta }}</div>
                <div class="order-date">Iniciada el {{ formatDate(c.fecha) }}</div>
              </div>
              <span class="badge-pending">Por pagar</span>
            </div>
            <div class="line" *ngFor="let l of c.lineas">
              <span class="line-qty">{{ l.cantidad }}×</span>
              <span class="line-name">{{ l.producto }} · {{ l.talla }} · {{ l.color }}</span>
              <span class="line-price">{{ formatCLP(l.precioUnitario * l.cantidad) }}</span>
            </div>
            <div class="pending-foot">
              <div class="pending-info">
                <div>Despacho a {{ c.comuna }} · {{ formatCLP(c.flete) }}</div>
                <div>Reservada hasta las {{ timeOnly(c.expiraEn) }}</div>
              </div>
              <div class="pending-pay">
                <strong>{{ formatCLP(c.total) }}</strong>
                <ion-button class="btn-rockstar" size="small" (click)="pay(c)">Pagar ahora</ion-button>
              </div>
            </div>
          </div>
          <p class="empty" *ngIf="!loading() && pending().length === 0">No tienes compras por pagar.</p>

          <!-- Compras hechas: pagadas, con el estado de su pedido -->
          <h2 class="group-title"><ion-icon name="receipt-outline"></ion-icon> Compras hechas</h2>
          <app-order-card *ngFor="let o of orders()" [order]="o"></app-order-card>
          <div class="empty" *ngIf="!loading() && orders().length === 0">
            <p>Todavía no tienes compras.</p>
            <ion-button routerLink="/shop" class="btn-rockstar">Ir a la tienda</ion-button>
          </div>
          <p class="empty" *ngIf="loading() && orders().length === 0 && pending().length === 0">Cargando tus compras…</p>
        </ng-container>

        <p class="group-note" *ngIf="auth.isAdmin()">
          Esta es una cuenta del personal: no tiene compras. Sus operaciones están en las pestañas del panel.
        </p>

        <div class="logout-row">
          <ion-button class="btn-outline" (click)="logout()">
            <ion-icon slot="start" name="log-out-outline"></ion-icon>
            Cerrar sesión
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 16px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; }
    .load-error { text-align: center; padding: 16px; color: var(--text-muted); }
    .account {
      display: flex; gap: 16px; align-items: center;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 20px;
    }
    .avatar {
      flex: none; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%;
      background: var(--accent); color: #fff; font-size: 28px; font-weight: 900;
      box-shadow: 0 8px 20px rgba(220, 38, 38, 0.35);
    }
    .account-data { min-width: 0; }
    .account-name { font-size: 20px; font-weight: 900; overflow-wrap: anywhere; }
    .account-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
    .account-row ion-icon { flex: none; color: var(--accent-hover); font-size: 15px; }
    .role {
      display: inline-block; margin-top: 10px; padding: 2px 10px; border-radius: 999px;
      background: rgba(127, 29, 29, 0.3); color: #fca5a5; font-size: 11px; font-weight: 700;
    }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .summary-item { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; text-align: center; }
    .summary-value { font-size: 18px; font-weight: 900; }
    .summary-label { margin-top: 2px; font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.08em; }
    .group-title {
      display: flex; align-items: center; gap: 8px;
      margin: 28px 0 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent-hover);
    }
    .group-note { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--text-faint); }
    .pending { background: var(--bg-card); border: 1px solid #854d0e; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
    .pending-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .order-number { font-weight: 900; font-size: 16px; }
    .order-date { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .badge-pending { flex: none; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: rgba(133, 77, 14, 0.3); color: #fde68a; }
    .line { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid #27272a; font-size: 13px; }
    .line-qty { color: var(--accent-hover); font-weight: 700; min-width: 24px; }
    .line-name { flex: 1; min-width: 0; }
    .line-price { color: var(--text-muted); white-space: nowrap; }
    .pending-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-top: 1px solid #27272a; padding-top: 10px; }
    .pending-info { font-size: 12px; line-height: 1.6; color: var(--text-muted); }
    .pending-pay { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .pending-pay strong { font-size: 16px; }
    .pending-pay .btn-rockstar { margin: 0; --padding-top: 8px; --padding-bottom: 8px; }
    .empty { text-align: center; padding: 16px; color: var(--text-faint); font-size: 14px; }
    .empty p { margin: 0 0 12px; }
    .logout-row { display: flex; justify-content: center; margin: 28px 0 8px; }
  `],
})
export class PerfilPage {
  auth = inject(AuthService);
  cart = inject(CartService);
  api = inject(ShopApi);
  toast = inject(ToastService);
  router = inject(Router);

  profile = signal<PerfilUsuario | null>(null);
  pending = signal<CompraPendiente[]>([]);
  orders = signal<PedidoCliente[]>([]);
  loading = signal(false);
  error = signal('');

  /** Lo pagado en todas las compras hechas. */
  spent = computed(() => this.orders().reduce((sum, o) => sum + o.total, 0));

  formatCLP = formatCLP;
  formatDate = formatDate;
  formatPhone = formatPhone;
  roleLabel = roleLabel;

  constructor() {
    addIcons({
      'call-outline': callOutline,
      'card-outline': cardOutline,
      'location-outline': locationOutline,
      'log-out-outline': logOutOutline,
      'mail-outline': mailOutline,
      'person-circle-outline': personCircleOutline,
      'receipt-outline': receiptOutline,
      'time-outline': timeOutline,
    });
    // El perfil es de una cuenta: un invitado pasa primero por el inicio de sesión y vuelve aquí.
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/entry'], { queryParams: { modo: 'client', volver: '/perfil' } });
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      // Solo los clientes compran; el backend rechaza estas consultas para el personal.
      const customer = this.auth.isCustomer();
      const [profile, pending, orders] = await Promise.all([
        this.api.profile(),
        customer ? this.api.pendingPurchases() : Promise.resolve([]),
        customer ? this.api.myOrders() : Promise.resolve([]),
      ]);
      this.profile.set(profile);
      this.pending.set(pending);
      this.orders.set(orders);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Retoma el pago de una compra que quedó pendiente. */
  pay(purchase: CompraPendiente) {
    this.cart.resume(purchase);
    this.router.navigateByUrl('/pago');
  }

  logout() {
    this.auth.logout();
    this.cart.reset();
    this.router.navigateByUrl('/shop');
    this.toast.show('Sesión cerrada.');
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  dateOnly(iso: string): string {
    return DATE_ONLY.format(new Date(iso));
  }

  timeOnly(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
}
