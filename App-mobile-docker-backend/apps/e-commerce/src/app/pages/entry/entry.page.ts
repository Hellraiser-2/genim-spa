import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonButton, IonItem, IonInput, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bagHandleOutline, personAddOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { errorMessage } from '../../core/api';
import { CurrentUser, PHONE_DIGITS, PHONE_PREFIX, phoneDigits } from '../../data/models';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

type Mode = 'choose' | 'client' | 'register' | 'admin';

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonItem, IonInput, IonIcon],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="entry-bg">
        <div class="entry-card">
          <div class="brand-logo">♠</div>
          <h1>Rockstar e-commerce</h1>
          <p class="subtitle">Rock · Metal · Underground</p>

          <ng-container *ngIf="mode() === 'choose'">
            <p class="prompt">¿Deseas iniciar sesión o continuar como invitado?</p>
            <ion-button expand="block" class="btn-rockstar" (click)="setMode('client')">Iniciar sesión</ion-button>
            <ion-button expand="block" class="btn-outline" (click)="continueAsGuest()">Continuar como invitado</ion-button>
            <div class="divider"></div>
            <button class="admin-link" (click)="setMode('admin')">
              <ion-icon name="shield-checkmark-outline"></ion-icon>
              Acceso administrador
            </button>
          </ng-container>

          <ng-container *ngIf="mode() === 'client'">
            <div class="mode-icon"><ion-icon name="bag-handle-outline" color="danger"></ion-icon></div>
            <p class="section-title">Acceso para clientes</p>
            <p class="prompt">Inicia sesión para comprar y hacer seguimiento de tus pedidos.</p>
            <form class="admin-form" (ngSubmit)="login()">
              <label class="lbl">Correo</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="email" name="email" type="email" autocomplete="username" placeholder="tu@correo.cl"></ion-input>
              </ion-item>
              <label class="lbl">Contraseña</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••"></ion-input>
              </ion-item>
              <p class="error-msg" *ngIf="error()">{{ error() }}</p>
              <ion-button expand="block" class="btn-rockstar" type="submit" [disabled]="busy()">
                {{ busy() ? 'Ingresando…' : 'Iniciar sesión' }}
              </ion-button>
            </form>
            <p class="muted-text">¿No tienes cuenta? <a (click)="setMode('register')">Crear cuenta</a></p>
            <button class="back-link" (click)="setMode('choose')">← Volver</button>
          </ng-container>

          <ng-container *ngIf="mode() === 'register'">
            <div class="mode-icon"><ion-icon name="person-add-outline" color="danger"></ion-icon></div>
            <p class="section-title">Crear cuenta</p>
            <p class="prompt">Con tu cuenta puedes comprar y ver el seguimiento de tus pedidos.</p>
            <form class="admin-form" (ngSubmit)="register()">
              <label class="lbl">Nombre</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="name" name="name" autocomplete="name" placeholder="Nombre y apellido"></ion-input>
              </ion-item>
              <label class="lbl">Correo</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="email" name="email" type="email" autocomplete="username" placeholder="tu@correo.cl"></ion-input>
              </ion-item>
              <label class="lbl">Teléfono</label>
              <ion-item lines="none" class="input-item">
                <!-- El prefijo de Chile va fijo: se escribe solo el número, y así se guarda siempre completo. -->
                <span class="prefix" slot="start" aria-hidden="true">{{ phonePrefix }}</span>
                <ion-input
                  #phoneInput
                  [value]="phone"
                  name="phone"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  placeholder="9 1234 5678"
                  [attr.aria-label]="'Teléfono, sin el prefijo ' + phonePrefix"
                  (ionInput)="onPhoneInput($event, phoneInput)"
                ></ion-input>
              </ion-item>
              <label class="lbl">Dirección</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="address" name="address" autocomplete="street-address" maxlength="200" placeholder="Calle, número, depto. y comuna"></ion-input>
              </ion-item>
              <label class="lbl">Contraseña</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="password" name="password" type="password" autocomplete="new-password" placeholder="Al menos 8 caracteres"></ion-input>
              </ion-item>
              <p class="error-msg" *ngIf="error()">{{ error() }}</p>
              <ion-button expand="block" class="btn-rockstar" type="submit" [disabled]="busy()">
                {{ busy() ? 'Creando cuenta…' : 'Crear cuenta' }}
              </ion-button>
            </form>
            <p class="muted-text">¿Ya tienes cuenta? <a (click)="setMode('client')">Iniciar sesión</a></p>
            <button class="back-link" (click)="setMode('choose')">← Volver</button>
          </ng-container>

          <ng-container *ngIf="mode() === 'admin'">
            <div class="mode-icon admin"><ion-icon name="shield-checkmark-outline" color="danger"></ion-icon></div>
            <p class="section-title admin">Solo personal autorizado</p>
            <p class="prompt">Este panel es exclusivo para el personal de la tienda.</p>
            <form class="admin-form" (ngSubmit)="login()">
              <label class="lbl">Correo</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="email" name="email" type="email" autocomplete="username" placeholder="nombre@rockstar.cl"></ion-input>
              </ion-item>
              <label class="lbl">Contraseña</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••"></ion-input>
              </ion-item>
              <p class="error-msg" *ngIf="error()">{{ error() }}</p>
              <ion-button expand="block" class="btn-rockstar" type="submit" [disabled]="busy()">
                {{ busy() ? 'Ingresando…' : 'Ingresar al panel' }}
              </ion-button>
            </form>
            <button class="back-link" (click)="setMode('choose')">← Volver</button>
          </ng-container>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .entry-bg {
      min-height: 100%;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(8px);
      padding: 20px;
    }
    .entry-card {
      width: 100%;
      max-width: 420px;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, #0c0c0c, #1a0a0d, #000);
      padding: 32px 24px;
      text-align: center;
    }
    .entry-card .brand-logo {
      margin: 0 auto 24px;
      width: 64px;
      height: 64px;
      font-size: 32px;
    }
    .entry-card h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }
    .subtitle {
      margin: 0 0 32px;
      font-size: 13px;
      color: var(--text-faint);
    }
    .prompt {
      margin: 0 0 20px;
      font-size: 14px;
      color: var(--text-muted);
    }
    .btn-rockstar { margin: 0 0 12px; }
    .btn-outline {
      --background: #18181b;
      --color: var(--text-muted);
      --border-radius: 12px;
      --padding-top: 14px;
      --padding-bottom: 14px;
      font-weight: 700;
      text-transform: none;
    }
    .divider {
      margin: 24px 0 16px;
      border-top: 1px solid #27272a;
    }
    .admin-link {
      background: transparent;
      border: none;
      color: var(--text-faint);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .admin-link:hover { color: var(--accent); }
    .mode-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #18181b;
      margin: 0 auto 12px;
      display: grid;
      place-items: center;
    }
    .mode-icon.admin { background: rgba(185, 28, 28, 0.15); border: 1px solid #7f1d1d; }
    .mode-icon ion-icon { font-size: 28px; }
    .section-title { color: var(--accent); margin: 0 0 8px; }
    .section-title.admin { font-size: 11px; }
    .muted-text { color: var(--text-faint); font-size: 12px; }
    .muted-text a { color: var(--accent); cursor: pointer; }
    .muted-text.center { text-align: center; }
    .back-link {
      background: transparent; border: none; color: var(--text-faint);
      font-size: 12px; margin-top: 16px; cursor: pointer;
    }
    .admin-form {
      background: rgba(9, 9, 11, 0.6);
      border: 1px solid #18181b;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
    }
    .admin-form .lbl {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      margin-top: 8px;
    }
    .input-item {
      --background: #0c0c0c;
      --border-radius: 12px;
      --border: 1px solid var(--border);
      --padding-start: 12px;
      margin-top: 4px;
    }
    .prefix { margin-right: 8px; padding-right: 8px; border-right: 1px solid var(--border); color: var(--text-muted); font-weight: 700; }
    .error-msg {
      margin: 8px 0 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(127, 29, 29, 0.3);
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      font-size: 12px;
    }
  `],
})
export class EntryPage {
  auth = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);

  route = inject(ActivatedRoute);

  mode = signal<Mode>('choose');
  name = '';
  email = '';
  /** Dígitos del teléfono, sin el prefijo. */
  phone = '';
  address = '';
  password = '';
  phonePrefix = PHONE_PREFIX;
  error = signal<string>('');
  busy = signal(false);

  /** Pantalla a la que volver tras iniciar sesión, por ejemplo el carrito. */
  private readonly returnTo: string | null;

  constructor() {
    addIcons({
      'bag-handle-outline': bagHandleOutline,
      'person-add-outline': personAddOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
    });
    const params = this.route.snapshot.queryParamMap;
    const volver = params.get('volver');
    this.returnTo = volver?.startsWith('/') ? volver : null;
    const modo = params.get('modo');
    if (modo === 'client' || modo === 'register' || modo === 'admin') {
      this.mode.set(modo);
    }
    // Con una sesión guardada no hace falta pasar por esta pantalla.
    const user = this.auth.isLoggedIn() ? this.auth.user() : null;
    if (user) {
      this.enter(user);
    }
  }

  setMode(mode: Mode) {
    this.error.set('');
    this.password = '';
    this.mode.set(mode);
  }

  continueAsGuest() {
    this.auth.continueAsGuest();
    this.toast.show('Continuando como invitado.');
    this.router.navigateByUrl('/shop');
  }

  async login() {
    if (this.busy()) return;
    if (!this.email.trim() || !this.password) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login(this.email.trim(), this.password);
      if (this.mode() === 'admin' && !user.isAdmin) {
        this.auth.logout();
        this.error.set('Esta cuenta no es del personal de la tienda.');
        return;
      }
      this.toast.show(`Bienvenido, ${user.name}.`);
      this.enter(user);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Deja en el campo solo los dígitos del número: ni letras, ni signos, ni el prefijo repetido. */
  onPhoneInput(event: Event, input: IonInput) {
    this.phone = phoneDigits(String((event as CustomEvent<{ value?: string | null }>).detail.value ?? ''));
    input.value = this.phone;
  }

  async register() {
    if (this.busy()) return;
    if (!this.name.trim() || !this.email.trim() || !this.address.trim() || !this.password) {
      this.error.set('Completa tu nombre, tu correo, tu teléfono, tu dirección y una contraseña.');
      return;
    }
    if (this.phone.length !== PHONE_DIGITS) {
      this.error.set(`Escribe los ${PHONE_DIGITS} dígitos de tu teléfono, sin el ${PHONE_PREFIX}.`);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const user = await this.auth.register(this.name.trim(), this.email.trim(), this.password, `${PHONE_PREFIX}${this.phone}`, this.address.trim());
      this.toast.show(`Cuenta creada. Bienvenido, ${user.name}.`);
      this.enter(user);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** El personal entra a su panel; un cliente vuelve a donde estaba o a la tienda. */
  private enter(user: CurrentUser) {
    if (user.isAdmin) {
      this.router.navigateByUrl(user.rol === 'GERENTE' ? '/admin' : '/warehouse');
    } else {
      this.router.navigateByUrl(this.returnTo ?? '/shop');
    }
  }
}
