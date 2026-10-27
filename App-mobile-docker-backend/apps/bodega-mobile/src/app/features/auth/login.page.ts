import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonInputPasswordToggle, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { flash } from 'ionicons/icons';

import { mensajeDeError } from '../../core/api/errores';
import { ServidorService } from '../../core/api/servidor.service';
import { SesionService } from '../../core/sesion/sesion.service';
import { valorDeEvento } from '../../shared/formato';
import { ConexionComponent } from './conexion.component';

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-login',
  imports: [ConexionComponent, IonButton, IonContent, IonIcon, IonInput, IonInputPasswordToggle, IonText],
  template: `
    <ion-content>
      <div class="marco">
        <div class="marca">
          <span class="sello" aria-hidden="true"><ion-icon name="flash"></ion-icon></span>
          <h1>Rockstar</h1>
          <p>Bodega</p>
        </div>
        @if (sesion.aviso(); as aviso) {
          <ion-text color="warning">
            <p role="status">{{ aviso }}</p>
          </ion-text>
        }
        @if (servidor.sinServidor()) {
          <!-- Sin servidor no hay a dónde enviar el inicio de sesión: primero se pide la IP. -->
          <app-conexion></app-conexion>
        } @else {
          <form (submit)="$event.preventDefault(); ingresar()">
            <ion-input
              class="campo"
              fill="outline"
              label="Correo"
              labelPlacement="floating"
              type="email"
              autocomplete="username"
              [value]="email()"
              [errorText]="errorEmail() ?? ''"
              [class.ion-invalid]="errorEmail() !== null"
              [class.ion-touched]="errorEmail() !== null"
              (ionInput)="email.set(valor($event))"
            ></ion-input>
            <ion-input
              class="campo"
              fill="outline"
              label="Contraseña"
              labelPlacement="floating"
              type="password"
              autocomplete="current-password"
              [value]="password()"
              [errorText]="errorPassword() ?? ''"
              [class.ion-invalid]="errorPassword() !== null"
              [class.ion-touched]="errorPassword() !== null"
              (ionInput)="password.set(valor($event))"
            >
              <ion-input-password-toggle slot="end" color="medium"></ion-input-password-toggle>
            </ion-input>
            @if (error(); as mensaje) {
              <ion-text color="danger">
                <p role="alert">{{ mensaje }}</p>
              </ion-text>
            }
            <ion-button type="submit" expand="block" [disabled]="enviando()">
              {{ enviando() ? 'Ingresando…' : 'Iniciar sesión' }}
            </ion-button>
          </form>
          @if (servidor.configurable) {
            <app-conexion></app-conexion>
          }
        }
        <p class="pie">Inventario único para bodega y sala de ventas</p>
      </div>
    </ion-content>
  `,
  styles: `
    .marco {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: calc(env(safe-area-inset-top) + 32px) 24px 32px;
    }
    .marca {
      margin-bottom: 36px;
      text-align: center;
    }
    .sello {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 84px;
      height: 84px;
      border-radius: 26px;
      background: linear-gradient(145deg, #ffd666, #ffb300);
      box-shadow: 0 18px 48px -12px rgba(255, 194, 46, 0.55);
      color: #15120a;
      font-size: 44px;
      transform: rotate(-6deg);
    }
    h1 {
      margin-top: 22px;
      font-family: var(--rs-fuente-titulo);
      font-size: 3.2rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      line-height: 1;
      text-transform: uppercase;
    }
    .marca p {
      margin: 8px 0 0;
      padding-inline-start: 0.5em;
      color: var(--ion-color-primary);
      font-family: var(--rs-fuente-titulo);
      font-size: 0.95rem;
      letter-spacing: 0.5em;
      text-transform: uppercase;
    }
    .campo {
      --border-radius: var(--rs-radio-chico);
      --border-color: var(--rs-borde-fuerte);
      min-height: 60px;
      margin-bottom: 14px;
    }
    form p[role],
    .marco > ion-text p[role] {
      margin-inline: 0;
    }
    .pie {
      margin: 28px 0 0;
      color: var(--rs-tenue);
      font-size: 0.82rem;
      text-align: center;
    }
  `,
})
export class LoginPage {
  protected readonly sesion = inject(SesionService);
  protected readonly servidor = inject(ServidorService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly errorEmail = signal<string | null>(null);
  readonly errorPassword = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  protected readonly valor = valorDeEvento;

  constructor() {
    addIcons({ flash });
  }

  async ingresar(): Promise<void> {
    if (this.enviando() || !this.validar()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.sesion.iniciar(this.email().trim(), this.password());
      this.password.set('');
      await this.router.navigateByUrl('/inicio', { replaceUrl: true });
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.enviando.set(false);
    }
  }

  private validar(): boolean {
    this.errorEmail.set(FORMATO_EMAIL.test(this.email().trim()) ? null : 'Ingresa un correo válido.');
    this.errorPassword.set(this.password() === '' ? 'Ingresa tu contraseña.' : null);
    return this.errorEmail() === null && this.errorPassword() === null;
  }
}
