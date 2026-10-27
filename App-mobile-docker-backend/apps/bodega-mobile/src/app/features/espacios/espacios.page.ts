import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { printOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { CodigoQrComponent } from '../../shared/codigo-qr.component';
import { valorDeEvento } from '../../shared/formato';
import { ImpresionService } from '../../shared/impresion.service';
import { InventarioApi } from '../inventario/inventario.api';
import { Espacio, agruparEspacios, filtrarEspacios } from './espacios';

/**
 * Espacios de la bodega con su código QR. Cada etiqueta lleva el número del espacio
 * para pegarla en la repisa: al escanearla desde cualquier pantalla de la app se llega
 * a las prendas que se guardan ahí.
 */
@Component({
  selector: 'app-espacios',
  imports: [
    CodigoQrComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
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
        <ion-title>Ubicaciones</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (elegido(); as espacio) {
        <div class="detalle">
          <div #etiqueta class="rs-etiqueta">
            <app-codigo-qr [texto]="espacio.codigo" style="--tamano: 220px"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ espacio.codigo }}</p>
            <p class="rs-etiqueta-producto">{{ espacio.producto }}</p>
          </div>
        </div>
        <dl class="rs-datos datos">
          <div>
            <dt>Zona</dt>
            <dd>{{ espacio.zona }}</dd>
          </div>
          <div class="rs-destacado">
            <dt>Número</dt>
            <dd>{{ espacio.numero }}</dd>
          </div>
          <div>
            <dt>Tallas y colores</dt>
            <dd>{{ espacio.variantes }}</dd>
          </div>
          <div>
            <dt>Unidades en bodega</dt>
            <dd>{{ espacio.unidadesEnBodega }}</dd>
          </div>
        </dl>
        <div class="rs-acciones">
          @if (impresion.disponible) {
            <ion-button expand="block" (click)="imprimirElegido()">
              <ion-icon slot="start" name="print-outline" aria-hidden="true"></ion-icon>
              Imprimir etiqueta
            </ion-button>
          } @else {
            <p class="rs-ayuda">Para imprimir las etiquetas, abre esta pantalla desde el computador.</p>
          }
          <ion-button expand="block" fill="outline" (click)="codigoElegido.set(null)">Ver todos los espacios</ion-button>
        </div>
      } @else {
        <ion-searchbar
          placeholder="Código, producto o categoría"
          [value]="filtro()"
          (ionInput)="filtro.set(valor($event))"
        ></ion-searchbar>
        @if (impresion.disponible && visibles().length > 0) {
          <div class="rs-acciones">
            <ion-button expand="block" fill="outline" (click)="imprimirVisibles()">
              <ion-icon slot="start" name="print-outline" aria-hidden="true"></ion-icon>
              Imprimir {{ visibles().length === 1 ? '1 etiqueta' : visibles().length + ' etiquetas' }}
            </ion-button>
          </div>
        }
        @for (espacio of visibles(); track espacio.codigo) {
          <ion-card button (click)="codigoElegido.set(espacio.codigo)">
            <!-- La fila va en un contenedor propio: la tarjeta envuelve su contenido en un botón interno. -->
            <div class="espacio">
              <app-codigo-qr [texto]="espacio.codigo" style="--tamano: 84px"></app-codigo-qr>
              <div>
                <h2>{{ espacio.codigo }}</h2>
                <p>{{ espacio.producto }}</p>
                <p class="tenue">
                  {{ espacio.categoria }}
                  @if (espacio.banda) {
                    · {{ espacio.banda }}
                  }
                  · {{ espacio.unidadesEnBodega }} en bodega
                </p>
              </div>
            </div>
          </ion-card>
        } @empty {
          @if (!mensaje()) {
            <p role="status">{{ cargando() ? 'Cargando espacios…' : 'No se encontraron espacios.' }}</p>
          }
        }
      }
      @if (mensaje(); as texto) {
        <ion-text color="danger">
          <p role="alert">{{ texto }}</p>
        </ion-text>
      }

      <!-- Hoja con todas las etiquetas visibles; solo existe para copiarla al imprimir. -->
      <div #hoja class="rs-etiquetas">
        @for (espacio of visibles(); track espacio.codigo) {
          <div class="rs-etiqueta">
            <app-codigo-qr [texto]="espacio.codigo"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ espacio.codigo }}</p>
            <p class="rs-etiqueta-producto">{{ espacio.producto }}</p>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .detalle {
      padding: 12px 16px 4px;
    }
    .datos {
      margin: 12px 16px;
    }
    .espacio {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px;
      text-align: start;
    }
    h2 {
      font-family: var(--rs-fuente-titulo);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      line-height: 1.1;
    }
    .espacio p {
      margin: 4px 0 0;
      line-height: 1.3;
    }
    .tenue {
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
  `,
})
export class EspaciosPage {
  private readonly api = inject(InventarioApi);
  protected readonly impresion = inject(ImpresionService);

  /** Código de espacio pedido en la dirección (`/espacios?codigo=B-POL-03`), para abrir directo su etiqueta. */
  readonly codigo = input<string>();
  private codigoPedidoAtendido = false;

  private readonly variantes = signal<VarianteStock[]>([]);
  readonly filtro = signal('');
  readonly cargando = signal(false);
  readonly mensaje = signal<string | null>(null);

  readonly espacios = computed(() => agruparEspacios(this.variantes()));
  readonly visibles = computed(() => filtrarEspacios(this.espacios(), this.filtro()));

  readonly codigoElegido = signal<string | null>(null);
  readonly elegido = computed<Espacio | null>(
    () => this.espacios().find((espacio) => espacio.codigo === this.codigoElegido()) ?? null,
  );

  private readonly etiqueta = viewChild<ElementRef<HTMLElement>>('etiqueta');
  private readonly hoja = viewChild<ElementRef<HTMLElement>>('hoja');

  protected readonly valor = valorDeEvento;

  constructor() {
    addIcons({ printOutline });
  }

  /** Ionic lo llama cada vez que se entra a la pantalla, de modo que los espacios estén al día. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.mensaje.set(null);
    try {
      this.variantes.set(await firstValueFrom(this.api.buscarVariantes('')));
      const pedido = this.codigo();
      if (pedido && !this.codigoPedidoAtendido) {
        this.codigoPedidoAtendido = true;
        this.codigoElegido.set(pedido);
      }
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  imprimirElegido(): void {
    this.imprimir(this.etiqueta());
  }

  imprimirVisibles(): void {
    this.imprimir(this.hoja());
  }

  private imprimir(referencia: ElementRef<HTMLElement> | undefined): void {
    if (referencia) {
      this.impresion.imprimir(referencia.nativeElement);
    }
  }
}
