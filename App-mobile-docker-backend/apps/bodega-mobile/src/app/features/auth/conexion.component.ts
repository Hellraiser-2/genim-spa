import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonInput, IonSegment, IonSegmentButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { serverOutline } from 'ionicons/icons';

import { ServidorService, normalizarDireccion } from '../../core/api/servidor.service';
import { valorDeEvento } from '../../shared/formato';

type Modo = 'SERVIDOR' | 'DEMO';

/**
 * Elección de a qué se conecta la app: al servidor de la tienda o al modo demostración,
 * que funciona sin servidor con datos de ejemplo. Vive en la pantalla de inicio de sesión
 * porque cambiar de servidor solo tiene sentido sin una sesión abierta.
 *
 * Se abre sola cuando la app no tiene servidor o el guardado no responde: la IP del equipo
 * servidor cambia con la red (el Wi-Fi del local o la zona Wi-Fi de un celular).
 */
@Component({
  selector: 'app-conexion',
  imports: [IonButton, IonIcon, IonInput, IonSegment, IonSegmentButton],
  template: `
    @if (!abierto()) {
      <ion-button class="resumen" fill="clear" size="small" color="medium" (click)="abrir()">
        <ion-icon slot="start" name="server-outline" aria-hidden="true"></ion-icon>
        {{ resumen() }}
      </ion-button>
    } @else {
      <div class="rs-grupo panel">
        <h2 class="rs-seccion">Conexión</h2>
        <ion-segment [value]="modo()" (ionChange)="cambiarModo(valor($event))">
          <ion-segment-button value="SERVIDOR">Servidor</ion-segment-button>
          <ion-segment-button value="DEMO">Demostración</ion-segment-button>
        </ion-segment>
        @if (modo() === 'SERVIDOR') {
          <ion-input
            class="direccion"
            fill="outline"
            label="IP del servidor"
            labelPlacement="stacked"
            placeholder="192.168.43.10"
            inputmode="url"
            autocapitalize="off"
            [value]="direccion()"
            (ionInput)="escribir(valor($event))"
          ></ion-input>
          <p class="rs-ayuda">
            La IP del equipo donde corre el sistema (con <code>:puerto</code> si no es el 3000). El teléfono y ese
            equipo deben estar en la misma red: el Wi-Fi del local o la zona Wi-Fi de un celular.
          </p>
        } @else {
          <p class="rs-ayuda">Funciona sin servidor, con datos de ejemplo que se reinician al cerrar la app.</p>
        }
        @if (mensaje(); as texto) {
          <p [class.rs-exito]="exito()" [attr.role]="exito() ? 'status' : 'alert'">{{ texto }}</p>
        }
        <div class="acciones">
          @if (modo() === 'SERVIDOR') {
            <ion-button fill="outline" [disabled]="ocupado()" (click)="probar()">
              {{ ocupado() ? 'Probando…' : 'Probar' }}
            </ion-button>
          }
          <ion-button [disabled]="ocupado()" (click)="guardar()">Guardar</ion-button>
          @if (!servidor.sinServidor()) {
            <ion-button fill="clear" color="medium" [disabled]="ocupado()" (click)="abierto.set(false)">Cancelar</ion-button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 12px;
      text-align: center;
    }
    .resumen {
      max-width: 100%;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
    }
    .panel {
      margin: 0;
      padding: 4px 14px 12px;
      text-align: start;
    }
    .panel .rs-seccion {
      margin: 12px 4px 0;
    }
    ion-segment {
      margin: 12px 0;
    }
    .direccion {
      --border-radius: var(--rs-radio-chico);
      --border-color: var(--rs-borde-fuerte);
    }
    .rs-ayuda,
    p[role] {
      margin: 10px 4px;
    }
    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class ConexionComponent implements OnInit {
  protected readonly servidor = inject(ServidorService);

  readonly abierto = signal(false);
  readonly modo = signal<Modo>('SERVIDOR');
  readonly direccion = signal('');
  readonly mensaje = signal<string | null>(null);
  readonly exito = signal(false);
  readonly ocupado = signal(false);

  /** A qué está conectada la app ahora, en una línea. */
  readonly resumen = computed(() => {
    if (this.servidor.modoDemo()) {
      return 'Modo demostración';
    }
    return `Servidor: ${this.servidor.direccion().replace(/^https?:\/\//, '') || 'sin configurar'}`;
  });

  protected readonly valor = valorDeEvento;

  constructor() {
    addIcons({ serverOutline });
  }

  ngOnInit(): void {
    void this.revisar();
  }

  /** Pide la IP si la app no tiene servidor, y comprueba que el guardado siga respondiendo. */
  async revisar(): Promise<void> {
    if (!this.servidor.configurable || this.servidor.modoDemo()) {
      return;
    }
    if (this.servidor.sinServidor()) {
      this.abrir();
      this.informar('Escribe la IP del equipo servidor para conectarte.', false);
      return;
    }
    const direccion = this.servidor.direccion();
    if (!(await this.servidor.probar(direccion))) {
      this.abrir();
      this.informar(
        `El servidor ${direccion.replace(/^https?:\/\//, '')} no responde. Si cambiaste de red, escribe la IP actual del equipo servidor.`,
        false,
      );
    }
  }

  abrir(): void {
    this.modo.set(this.servidor.modoDemo() ? 'DEMO' : 'SERVIDOR');
    this.direccion.set(this.servidor.direccion());
    this.mensaje.set(null);
    this.abierto.set(true);
  }

  cambiarModo(modo: string): void {
    this.modo.set(modo === 'DEMO' ? 'DEMO' : 'SERVIDOR');
    this.mensaje.set(null);
  }

  escribir(direccion: string): void {
    this.direccion.set(direccion);
    this.mensaje.set(null);
  }

  /** Comprueba que el servidor responde, sin guardar nada. */
  async probar(): Promise<boolean> {
    const direccion = this.direccionValida();
    if (direccion === null) {
      return false;
    }
    this.ocupado.set(true);
    try {
      const responde = await this.servidor.probar(direccion);
      this.informar(
        responde ? 'Conexión correcta.' : 'No se pudo conectar. Revisa la dirección y que el servidor esté encendido.',
        responde,
      );
      return responde;
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Guarda la elección. Un servidor que no responde no se guarda, para no dejar la app sin poder entrar. */
  async guardar(): Promise<void> {
    if (this.modo() === 'DEMO') {
      await this.servidor.guardar({ modoDemo: true, direccion: this.servidor.direccion() });
      this.abierto.set(false);
      return;
    }
    const direccion = this.direccionValida();
    if (direccion !== null && (await this.probar())) {
      await this.servidor.guardar({ modoDemo: false, direccion });
      this.abierto.set(false);
    }
  }

  private direccionValida(): string | null {
    const direccion = normalizarDireccion(this.direccion());
    if (direccion === null) {
      this.informar('Escribe la dirección del servidor, por ejemplo 192.168.43.10 o http://192.168.1.20:3000.', false);
      return null;
    }
    this.direccion.set(direccion);
    return direccion;
  }

  private informar(texto: string, exito: boolean): void {
    this.mensaje.set(texto);
    this.exito.set(exito);
  }
}
