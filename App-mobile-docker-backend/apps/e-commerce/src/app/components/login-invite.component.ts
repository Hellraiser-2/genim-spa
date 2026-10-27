import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, personCircleOutline } from 'ionicons/icons';
import { AuthService } from '../services/auth.service';
import { cookieBannerVisible } from './cookie-banner.component';

/** Si el invitado cerró el recuadro, no vuelve a aparecer mientras siga abierta la pestaña. */
const DISMISSED_KEY = 'rockstar.tienda.aviso-sesion';

/** Pantallas de la tienda donde se ofrece iniciar sesión. */
const STORE_PATHS = ['/shop', '/bandas'];

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Recuadro pequeño que invita a un invitado a iniciar sesión o crear su cuenta, sin
 * taparle la tienda. Al iniciar sesión vuelve a la pantalla donde estaba.
 */
@Component({
  selector: 'app-login-invite',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <aside class="invite" *ngIf="shown()" aria-label="Iniciar sesión">
      <button type="button" class="close" aria-label="Cerrar" (click)="dismiss()">
        <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
      </button>
      <div class="head">
        <ion-icon name="person-circle-outline" aria-hidden="true"></ion-icon>
        <p>¿Tienes cuenta? Inicia sesión para comprar y seguir tus pedidos.</p>
      </div>
      <div class="actions">
        <button type="button" class="primary" (click)="go('client')">Iniciar sesión</button>
        <button type="button" class="secondary" (click)="go('register')">Crear cuenta</button>
      </div>
    </aside>
  `,
  styles: [`
    .invite {
      position: fixed;
      right: 16px;
      bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      z-index: 50;
      width: 300px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 14px 14px 12px;
      background: #0c0c0c;
      border: 1px solid var(--border);
      border-top: 2px solid var(--accent);
      border-radius: 12px;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
      animation: appear 0.25s ease-out;
    }
    @keyframes appear {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: none; }
    }
    .close {
      position: absolute; top: 6px; right: 6px;
      display: grid; place-items: center; width: 28px; height: 28px;
      background: transparent; border: none; border-radius: 8px;
      color: var(--text-faint); font-size: 18px; cursor: pointer;
    }
    .close:hover { color: #fff; background: #18181b; }
    .head { display: flex; gap: 10px; align-items: flex-start; padding-right: 24px; }
    .head ion-icon { flex: none; font-size: 24px; color: var(--accent-hover); }
    .head p { margin: 2px 0 0; font-size: 13px; line-height: 1.4; color: var(--text-muted); }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .actions button {
      flex: 1; padding: 9px 10px; border-radius: 10px;
      font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .primary { background: var(--accent); border: 1px solid var(--accent); color: #fff; }
    .primary:hover { background: var(--accent-hover); }
    .secondary { background: #18181b; border: 1px solid var(--border); color: var(--text); }
    .secondary:hover { border-color: var(--accent); }
    .actions button:focus-visible, .close:focus-visible { outline: 2px solid var(--accent-hover); outline-offset: 2px; }
  `],
})
export class LoginInviteComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly path = signal(this.router.url.split('?')[0]);
  private readonly dismissed = signal(wasDismissed());

  // Espera a que se responda el aviso de cookies: los dos van abajo y se taparían.
  shown = computed(
    () => !cookieBannerVisible() && !this.dismissed() && !this.auth.isLoggedIn() && STORE_PATHS.includes(this.path()),
  );

  constructor() {
    addIcons({ 'close-outline': closeOutline, 'person-circle-outline': personCircleOutline });
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.path.set(event.urlAfterRedirects.split('?')[0]);
      }
    });
  }

  dismiss() {
    this.dismissed.set(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Sin almacenamiento, el recuadro queda cerrado mientras la página siga abierta.
    }
  }

  go(mode: 'client' | 'register') {
    this.router.navigate(['/entry'], { queryParams: { modo: mode, volver: this.router.url } });
  }
}
