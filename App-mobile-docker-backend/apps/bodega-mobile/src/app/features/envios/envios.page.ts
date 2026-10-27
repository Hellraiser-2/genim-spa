import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Pedido } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cubeOutline, locationOutline, timeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { codigoDeError, mensajeDeError } from '../../core/api/errores';
import { AvisosService } from '../../shared/avisos.service';
import { valorDeEvento } from '../../shared/formato';
import {
  GRUPOS_DE_ENVIO,
  GrupoDeEnvio,
  agruparEnvios,
  esUrgente,
  etiquetaDeEstado,
  grupoDeEnvio,
  momentoDelPedido,
} from './envios';
import { LogisticaApi } from './logistica.api';

/**
 * Pedidos del e-commerce separados en por enviar, en camino y enviados. Desde un pedido
 * por enviar se genera su despacho, que le da el código de seguimiento.
 */
@Component({
  selector: 'app-envios',
  imports: [
    IonBackButton,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Envíos</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="grupo()" (ionChange)="grupo.set($any(valor($event)))">
          @for (opcion of grupos; track opcion.valor) {
            <ion-segment-button [value]="opcion.valor">
              {{ opcion.etiqueta }} ({{ envios()[opcion.valor].length }})
            </ion-segment-button>
          }
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (error(); as mensaje) {
        <div class="rs-acciones">
          <ion-text color="danger">
            <p role="alert">{{ mensaje }}</p>
          </ion-text>
          <ion-button expand="block" [disabled]="cargando()" (click)="cargar()">Reintentar</ion-button>
        </div>
      }
      @for (pedido of visibles(); track pedido.idPedido) {
        <ion-card class="pedido" [class.urgente]="urgente(pedido)">
          <div class="cabecera">
            <span class="numero">Pedido #{{ pedido.idPedido }}</span>
            <span class="estados">
              @if (urgente(pedido)) {
                <ion-badge color="danger">Urgente</ion-badge>
              }
              <ion-badge [color]="colorDe(pedido)">{{ etiquetaDeEstado(pedido.estado) }}</ion-badge>
            </span>
          </div>
          <h2>{{ pedido.destinatario }}</h2>
          <p class="dato">
            <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
            <span>{{ pedido.direccion }}, {{ pedido.comuna }}, {{ pedido.region }}</span>
          </p>
          <ul>
            @for (linea of pedido.lineas; track linea.idVariante) {
              <li>
                <strong>{{ linea.cantidad }}×</strong>
                <span>
                  {{ linea.producto }} · {{ linea.talla }} · {{ linea.color }}
                  <small>{{ linea.sku }}</small>
                </span>
              </li>
            }
          </ul>
          <p class="dato">
            <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
            <span>{{ momento(pedido) }}</span>
          </p>
          @if (pedido.trackingStarken) {
            <p class="dato">
              <ion-icon name="cube-outline" aria-hidden="true"></ion-icon>
              <span>
                Seguimiento Starken
                <span class="rs-codigo">{{ pedido.trackingStarken }}</span>
              </span>
            </p>
          }
          @if (porDespachar(pedido)) {
            <div class="despacho">
              @if (fallaDe(pedido); as mensaje) {
                <ion-text color="danger">
                  <p role="alert">{{ mensaje }}</p>
                </ion-text>
              }
              @if (porConfirmar() === pedido.idPedido) {
                <p class="pregunta">
                  Se emitirá la orden en Starken y las prendas saldrán del stock. No se puede deshacer.
                </p>
                <div class="botones">
                  <ion-button fill="outline" color="medium" [disabled]="ocupado()" (click)="porConfirmar.set(null)">
                    Cancelar
                  </ion-button>
                  <ion-button [disabled]="ocupado()" (click)="despachar(pedido)">
                    {{ despachando() === pedido.idPedido ? 'Generando…' : 'Confirmar despacho' }}
                  </ion-button>
                </div>
              } @else {
                <ion-button expand="block" [disabled]="ocupado()" (click)="pedirConfirmacion(pedido)">
                  Generar despacho
                </ion-button>
              }
            </div>
          }
        </ion-card>
      } @empty {
        @if (!error()) {
          <p role="status">{{ cargando() ? 'Cargando envíos…' : 'No hay envíos en este estado.' }}</p>
        }
      }
    </ion-content>
  `,
  styles: `
    .pedido {
      padding: 16px;
    }
    .urgente {
      border-color: rgba(255, 92, 92, 0.4);
    }
    .cabecera,
    .estados,
    .dato {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cabecera {
      justify-content: space-between;
    }
    .numero {
      color: var(--rs-tenue);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h2 {
      margin: 8px 0 6px;
      font-family: var(--rs-fuente-titulo);
      font-size: 1.45rem;
      font-weight: 600;
      line-height: 1.15;
    }
    .dato {
      align-items: flex-start;
      margin: 6px 0 0;
      color: var(--rs-tenue);
      font-size: 0.88rem;
      line-height: 1.4;
    }
    .dato ion-icon {
      flex: none;
      margin-top: 1px;
      color: var(--ion-color-primary);
      font-size: 17px;
    }
    ul {
      margin: 12px 0;
      padding: 4px 12px;
      border-radius: var(--rs-radio-chico);
      background: var(--rs-superficie-alta);
      list-style: none;
    }
    li {
      display: flex;
      gap: 10px;
      padding: 8px 0;
      font-size: 0.92rem;
      line-height: 1.35;
    }
    li + li {
      border-top: 1px solid var(--rs-borde);
    }
    li strong {
      min-width: 26px;
      color: var(--ion-color-primary);
    }
    small {
      display: block;
      color: var(--rs-tenue);
    }
    .despacho {
      margin-top: 14px;
    }
    .despacho p {
      margin: 0 0 10px;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .pregunta {
      color: var(--rs-tenue);
    }
    .botones {
      display: flex;
      gap: 8px;
    }
    .botones ion-button {
      flex: 1;
      margin: 0;
    }
  `,
})
export class EnviosPage {
  private readonly api = inject(LogisticaApi);
  private readonly avisos = inject(AvisosService);

  private readonly pedidos = signal<Pedido[]>([]);
  readonly grupo = signal<GrupoDeEnvio>('POR_ENVIAR');
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Pedido cuyo despacho espera la confirmación del usuario. */
  readonly porConfirmar = signal<number | null>(null);
  /** Pedido cuyo despacho se está generando. */
  readonly despachando = signal<number | null>(null);
  /** Falla del último despacho que no se pudo generar. */
  readonly errorDespacho = signal<{ idPedido: number; mensaje: string } | null>(null);

  readonly envios = computed(() => agruparEnvios(this.pedidos()));
  readonly visibles = computed(() => this.envios()[this.grupo()]);
  /** Mientras se genera un despacho no se inicia otro. */
  readonly ocupado = computed(() => this.despachando() !== null);

  protected readonly grupos = GRUPOS_DE_ENVIO;
  protected readonly etiquetaDeEstado = etiquetaDeEstado;
  protected readonly valor = valorDeEvento;
  protected readonly urgente = (pedido: Pedido) => esUrgente(pedido);
  protected readonly momento = (pedido: Pedido) => momentoDelPedido(pedido);
  protected readonly porDespachar = (pedido: Pedido) => grupoDeEnvio(pedido.estado) === 'POR_ENVIAR';
  protected readonly fallaDe = (pedido: Pedido) => {
    const falla = this.errorDespacho();
    return falla?.idPedido === pedido.idPedido ? falla.mensaje : null;
  };

  constructor() {
    addIcons({ cubeOutline, locationOutline, timeOutline });
  }

  /** Ionic lo llama cada vez que se entra a la pantalla, de modo que los envíos estén al día. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.pedidos.set(await firstValueFrom(this.api.pedidos()));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Un despacho no se deshace: antes de generarlo se pide confirmarlo en el mismo pedido. */
  pedirConfirmacion(pedido: Pedido): void {
    this.errorDespacho.set(null);
    this.porConfirmar.set(pedido.idPedido);
  }

  /**
   * Genera el despacho y deja el pedido en camino con su código de seguimiento. Si la
   * respuesta se pierde, se puede repetir: el servidor responde el despacho que ya existe.
   */
  async despachar(pedido: Pedido): Promise<void> {
    if (this.ocupado()) {
      return;
    }
    this.despachando.set(pedido.idPedido);
    this.errorDespacho.set(null);
    try {
      const despachado = await firstValueFrom(this.api.generarDespacho(pedido.idPedido));
      this.pedidos.update((pedidos) => pedidos.map((p) => (p.idPedido === despachado.idPedido ? despachado : p)));
      this.porConfirmar.set(null);
      await this.avisos.exito(`Pedido #${despachado.idPedido} despachado. Seguimiento ${despachado.trackingStarken}.`);
    } catch (error) {
      const mensaje =
        codigoDeError(error) === 'STOCK_INSUFICIENTE'
          ? 'No hay existencia suficiente de las prendas del pedido. Revisa el stock antes de despacharlo.'
          : mensajeDeError(error);
      this.errorDespacho.set({ idPedido: pedido.idPedido, mensaje });
    } finally {
      this.despachando.set(null);
    }
  }

  protected colorDe(pedido: Pedido): string {
    switch (pedido.estado) {
      case 'ENTREGADO':
        return 'success';
      case 'DESPACHADO':
        return 'primary';
      case 'ATENCION_MANUAL':
        return 'danger';
      default:
        return 'warning';
    }
  }
}
