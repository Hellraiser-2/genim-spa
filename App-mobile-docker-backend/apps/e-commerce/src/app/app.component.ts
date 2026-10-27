import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonRouterOutlet,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonBadge,
  IonButtons,
  IonButton,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  storefrontOutline,
  cubeOutline,
  statsChartOutline,
  cartOutline,
  chatbubblesOutline,
  logOutOutline,
  logInOutline,
  receiptOutline,
  shieldCheckmarkOutline,
  personCircleOutline,
} from 'ionicons/icons';

import { CartDrawerComponent } from './components/cart-drawer.component';
import { CookieBannerComponent } from './components/cookie-banner.component';
import { LoginInviteComponent } from './components/login-invite.component';
import { ShopNavComponent } from './components/shop-nav.component';
import { AuthService } from './services/auth.service';
import { CartService } from './services/cart.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    CartDrawerComponent,
    CookieBannerComponent,
    LoginInviteComponent,
    ShopNavComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonRouterOutlet,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    IonBadge,
    IonButtons,
    IonButton,
    IonMenuButton,
  ],
  template: `
    <ion-app>
      <ion-header *ngIf="showHeader()">
        <ion-toolbar class="rockstar-toolbar">
          <ion-buttons slot="start">
            <ion-button (click)="goHome()">
              <div class="brand-logo" style="width:32px;height:32px;font-size:16px;">♠</div>
            </ion-button>
          </ion-buttons>
          <ion-title>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:900;letter-spacing:0.18em;">Rockstar e-commerce</div>
              <div style="font-size:9px;letter-spacing:0.28em;color:var(--text-faint);text-transform:uppercase;">Rock · Metal · Underground</div>
            </div>
          </ion-title>
          <ion-buttons slot="end">
            <!-- Botón de perfil: con sesión abre el perfil; un invitado va a iniciar sesión. -->
            <button
              type="button"
              class="user-chip profile-button"
              *ngIf="user() as u"
              [class.is-admin]="u.isAdmin"
              [class.current]="onProfile()"
              [attr.aria-label]="isLoggedIn() ? 'Ver mi perfil, ' + u.name : 'Iniciar sesión'"
              (click)="openProfile()"
            >
              <ion-icon name="person-circle-outline" aria-hidden="true"></ion-icon>
              <span class="profile-name">{{ u.name }}</span>
            </button>
            <ion-button *ngIf="!isAdminOnly()" aria-label="Abrir el carrito" (click)="cart.open()">
              <ion-icon name="cart-outline"></ion-icon>
              <ion-badge color="danger" *ngIf="cartCount() > 0">{{ cartCount() }}</ion-badge>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
        <!-- Dentro del encabezado fijo: la barra de categorías acompaña al bajar por la página. -->
        <app-shop-nav *ngIf="showNav()"></app-shop-nav>
      </ion-header>

      <ion-content [fullscreen]="true" class="rockstar-content">
        <router-outlet></router-outlet>
      </ion-content>

      <ion-tab-bar *ngIf="showTabs()" slot="bottom">
        <ion-tab-button routerLink="/shop" routerLinkActive="tab-selected">
          <ion-icon name="storefront-outline"></ion-icon>
          <ion-label>Tienda</ion-label>
        </ion-tab-button>
        <ion-tab-button routerLink="/pedidos" routerLinkActive="tab-selected" *ngIf="isCustomer()">
          <ion-icon name="receipt-outline"></ion-icon>
          <ion-label>Mis pedidos</ion-label>
        </ion-tab-button>
        <ion-tab-button routerLink="/warehouse" routerLinkActive="tab-selected" *ngIf="isAdmin()">
          <ion-icon name="cube-outline"></ion-icon>
          <ion-label>Bodega</ion-label>
        </ion-tab-button>
        <ion-tab-button routerLink="/admin" routerLinkActive="tab-selected" *ngIf="isManager()">
          <ion-icon name="stats-chart-outline"></ion-icon>
          <ion-label>Finanzas</ion-label>
        </ion-tab-button>
        <ion-tab-button routerLink="/support" routerLinkActive="tab-selected">
          <ion-icon name="chatbubbles-outline"></ion-icon>
          <ion-label>Soporte</ion-label>
        </ion-tab-button>
        <ion-tab-button (click)="logout()" *ngIf="isLoggedIn()">
          <ion-icon name="log-out-outline"></ion-icon>
          <ion-label>Salir</ion-label>
        </ion-tab-button>
        <ion-tab-button (click)="login()" *ngIf="!isLoggedIn()">
          <ion-icon name="log-in-outline"></ion-icon>
          <ion-label>Ingresar</ion-label>
        </ion-tab-button>
      </ion-tab-bar>

      <app-cart-drawer *ngIf="!isAdminOnly()"></app-cart-drawer>

      <app-cookie-banner></app-cookie-banner>
      <!-- Invitación a iniciar sesión para los invitados, sin taparles la tienda -->
      <app-login-invite></app-login-invite>

      <!-- Toast global -->
      <div *ngIf="toast.message()" class="app-toast">
        <ion-icon name="shield-checkmark-outline" color="danger"></ion-icon>
        <span>{{ toast.message() }}</span>
      </div>
    </ion-app>
  `,
  styles: [`
    .app-toast {
      position: fixed;
      top: 116px;
      right: 16px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #0c0c0c;
      border: 1px solid #7f1d1d;
      border-radius: 12px;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .profile-button {
      max-width: 42vw; margin-right: 4px;
      color: var(--text); font: inherit; font-size: 12px; cursor: pointer;
    }
    .profile-button ion-icon { flex: none; font-size: 20px; color: var(--text-muted); }
    .profile-button.is-admin ion-icon { color: var(--accent-hover); }
    .profile-button:hover, .profile-button.current { border-color: var(--accent); }
    .profile-button:focus-visible { outline: 2px solid var(--accent-hover); outline-offset: 2px; }
    .profile-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tab-selected {
      color: var(--ion-color-primary);
    }
    ion-tab-bar {
      --background: #0c0c0c;
      --color: var(--text-muted);
      --color-selected: var(--ion-color-primary);
    }
  `],
})
export class AppComponent {
  auth = inject(AuthService);
  cart = inject(CartService);
  toast = inject(ToastService);
  router = inject(Router);

  user = this.auth.user;
  isAdmin = this.auth.isAdmin;
  isCustomer = this.auth.isCustomer;
  isLoggedIn = this.auth.isLoggedIn;
  isManager = computed(() => this.auth.rol() === 'GERENTE');
  cartCount = this.cart.count;

  /** Ruta actual sin parámetros, al día con cada navegación. */
  private readonly path = signal(this.router.url.split('?')[0]);

  showHeader = computed(() => this.auth.entryDismissed() && this.path() !== '/entry');
  showTabs = computed(() => this.auth.entryDismissed() && this.path() !== '/entry');
  onProfile = computed(() => this.path() === '/perfil');
  /** La barra de categorías va en las pantallas de la tienda, no en las del personal. */
  showNav = computed(() => this.showHeader() && !['/warehouse', '/admin', '/inversion'].includes(this.path()));
  /** El personal no compra en la tienda: no ve el carrito. */
  isAdminOnly = computed(() => this.auth.isAdmin());

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.path.set(event.urlAfterRedirects.split('?')[0]);
        // Quien llega directo a una pantalla de la tienda (un enlace compartido, una recarga)
        // sin haber elegido cómo entrar es un invitado: ve la tienda completa, con su barra.
        if (this.path() !== '/entry' && !this.auth.entryDismissed()) {
          this.auth.continueAsGuest();
        }
      }
    });
    addIcons({
      'log-in-outline': logInOutline,
      'receipt-outline': receiptOutline,
      'storefront-outline': storefrontOutline,
      'cube-outline': cubeOutline,
      'stats-chart-outline': statsChartOutline,
      'cart-outline': cartOutline,
      'chatbubbles-outline': chatbubblesOutline,
      'log-out-outline': logOutOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'person-circle-outline': personCircleOutline,
    });
  }

  goHome() {
    this.router.navigateByUrl('/shop');
  }

  login() {
    this.auth.logout();
    this.router.navigateByUrl('/entry');
  }

  openProfile() {
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/perfil');
    } else {
      // Un invitado no tiene perfil: se le ofrece iniciar sesión o crear su cuenta, y luego llega a él.
      this.auth.logout();
      this.router.navigate(['/entry'], { queryParams: { modo: 'client', volver: '/perfil' } });
    }
  }

  logout() {
    this.auth.logout();
    // El carrito y los datos de despacho son de quien cerró la sesión: no quedan en el dispositivo.
    this.cart.reset();
    this.router.navigateByUrl('/shop');
    this.toast.show('Sesión cerrada.');
  }
}
