import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import {
  IonBackButton,
  IonBadge,
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
import { existenciaEn, valorDeEvento } from '../../shared/formato';
import { ImpresionService } from '../../shared/impresion.service';
import { InventarioApi } from '../inventario/inventario.api';

/** Tope de copias de una misma etiqueta en una impresión, para no mandar cientos de hojas por error. */
export const MAXIMO_DE_COPIAS = 60;

/** Unidades físicas de la variante, entre bodega y sala de ventas. */
export function unidadesDe(variante: VarianteStock): number {
  return existenciaEn(variante, 'BODEGA') + existenciaEn(variante, 'SALA_VENTAS');
}

/** Variantes cuyo SKU, producto, categoría, banda, talla o color contienen el texto. */
export function filtrarVariantes(variantes: VarianteStock[], texto: string): VarianteStock[] {
  const consulta = texto.trim().toLowerCase();
  if (consulta === '') {
    return variantes;
  }
  return variantes.filter((variante) =>
    [variante.sku, variante.producto, variante.categoria, variante.banda ?? '', variante.talla, variante.color].some(
      (campo) => campo.toLowerCase().includes(consulta),
    ),
  );
}

/**
 * Etiquetas QR de las prendas, una por SKU. El código lleva el SKU: al leerlo, la app
 * de bodega y el punto de venta identifican la talla y el color exactos de la prenda,
 * para contarla o descontarla del stock sin escribir nada.
 */
@Component({
  selector: 'app-etiquetas',
  imports: [
    CodigoQrComponent,
    IonBackButton,
    IonBadge,
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
        <ion-title>Etiquetas de prendas</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (elegida(); as variante) {
        <div class="detalle">
          <div #etiqueta class="rs-etiqueta">
            <app-codigo-qr [texto]="variante.sku" style="--tamano: 220px"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ variante.sku }}</p>
            <p class="rs-etiqueta-producto">{{ variante.producto }}</p>
            <p class="rs-etiqueta-detalle">Talla {{ variante.talla }} · {{ variante.color }}</p>
          </div>
        </div>
        <dl class="rs-datos datos">
          <div>
            <dt>Bodega</dt>
            <dd>{{ enUbicacion(variante, 'BODEGA') }}</dd>
          </div>
          <div>
            <dt>Sala de ventas</dt>
            <dd>{{ enUbicacion(variante, 'SALA_VENTAS') }}</dd>
          </div>
          <div class="rs-destacado">
            <dt>Disponible</dt>
            <dd>{{ variante.disponible }}</dd>
          </div>
          <div>
            <dt>Espacio</dt>
            <dd>{{ variante.codigoUbicacion }}</dd>
          </div>
        </dl>
        <div class="rs-acciones">
          @if (impresion.disponible) {
            <ion-button expand="block" (click)="imprimirElegida()">
              <ion-icon slot="start" name="print-outline" aria-hidden="true"></ion-icon>
              Imprimir etiqueta
            </ion-button>
            @if (copias() > 1) {
              <ion-button expand="block" fill="outline" (click)="imprimirCopias()">
                Imprimir {{ copias() }}, una por unidad
              </ion-button>
            }
          } @else {
            <p class="rs-ayuda">Para imprimir las etiquetas, abre esta pantalla desde el computador.</p>
          }
          <ion-button expand="block" fill="clear" (click)="skuElegido.set(null)">Ver todas las prendas</ion-button>
        </div>
      } @else {
        <ion-searchbar
          placeholder="SKU, producto, talla o color"
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
        @for (variante of visibles(); track variante.idVariante) {
          <ion-card button (click)="skuElegido.set(variante.sku)">
            <!-- La fila va en un contenedor propio: la tarjeta envuelve su contenido en un botón interno. -->
            <div class="prenda">
              <app-codigo-qr [texto]="variante.sku" style="--tamano: 84px"></app-codigo-qr>
              <div>
                <h2>{{ variante.sku }}</h2>
                <p>{{ variante.producto }}</p>
                <p class="tenue">Talla {{ variante.talla }} · {{ variante.color }} · {{ unidades(variante) }} unidades</p>
                @if (!variante.activo) {
                  <ion-badge color="medium">Desactivado</ion-badge>
                }
              </div>
            </div>
          </ion-card>
        } @empty {
          @if (!mensaje()) {
            <p role="status">{{ cargando() ? 'Cargando prendas…' : 'No se encontraron prendas.' }}</p>
          }
        }
      }
      @if (mensaje(); as texto) {
        <ion-text color="danger">
          <p role="alert">{{ texto }}</p>
        </ion-text>
      }

      <!-- Hojas que solo existen para copiarlas al imprimir: una etiqueta por prenda visible,
           y las copias de la prenda elegida. -->
      <div #hoja class="rs-etiquetas">
        @for (variante of visibles(); track variante.idVariante) {
          <div class="rs-etiqueta">
            <app-codigo-qr [texto]="variante.sku"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ variante.sku }}</p>
            <p class="rs-etiqueta-producto">{{ variante.producto }}</p>
            <p class="rs-etiqueta-detalle">Talla {{ variante.talla }} · {{ variante.color }}</p>
          </div>
        }
      </div>
      <div #hojaDeCopias class="rs-etiquetas">
        @if (elegida(); as variante) {
          @for (copia of numerosDeCopia(); track copia) {
            <div class="rs-etiqueta">
              <app-codigo-qr [texto]="variante.sku"></app-codigo-qr>
              <p class="rs-etiqueta-codigo">{{ variante.sku }}</p>
              <p class="rs-etiqueta-producto">{{ variante.producto }}</p>
              <p class="rs-etiqueta-detalle">Talla {{ variante.talla }} · {{ variante.color }}</p>
            </div>
          }
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
    .prenda {
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
    .prenda p {
      margin: 4px 0 0;
      line-height: 1.3;
    }
    .tenue {
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
    ion-badge {
      margin-top: 6px;
    }
  `,
})
export class EtiquetasPage {
  private readonly api = inject(InventarioApi);
  protected readonly impresion = inject(ImpresionService);

  /** SKU pedido en la dirección (`/etiquetas?sku=RS-0004`), para abrir directo su etiqueta. */
  readonly sku = input<string>();
  private skuPedidoAtendido = false;

  readonly variantes = signal<VarianteStock[]>([]);
  readonly filtro = signal('');
  readonly cargando = signal(false);
  readonly mensaje = signal<string | null>(null);

  readonly visibles = computed(() => filtrarVariantes(this.variantes(), this.filtro()));

  readonly skuElegido = signal<string | null>(null);
  readonly elegida = computed(() => this.variantes().find((variante) => variante.sku === this.skuElegido()) ?? null);

  /** Etiquetas para rotular cada unidad de la prenda elegida, con un tope razonable. */
  readonly copias = computed(() => {
    const elegida = this.elegida();
    return elegida ? Math.min(unidadesDe(elegida), MAXIMO_DE_COPIAS) : 0;
  });
  protected readonly numerosDeCopia = computed(() => Array.from({ length: this.copias() }, (_, indice) => indice));

  private readonly etiqueta = viewChild<ElementRef<HTMLElement>>('etiqueta');
  private readonly hoja = viewChild<ElementRef<HTMLElement>>('hoja');
  private readonly hojaDeCopias = viewChild<ElementRef<HTMLElement>>('hojaDeCopias');

  protected readonly valor = valorDeEvento;
  protected readonly enUbicacion = existenciaEn;
  protected readonly unidades = unidadesDe;

  constructor() {
    addIcons({ printOutline });
  }

  /** Ionic lo llama cada vez que se entra a la pantalla, de modo que el stock mostrado esté al día. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.mensaje.set(null);
    try {
      this.variantes.set(await firstValueFrom(this.api.buscarVariantes('')));
      const pedido = this.sku();
      if (pedido && !this.skuPedidoAtendido) {
        this.skuPedidoAtendido = true;
        this.skuElegido.set(pedido);
      }
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  imprimirElegida(): void {
    this.imprimir(this.etiqueta());
  }

  /** Una etiqueta por cada unidad en stock de la prenda elegida. */
  imprimirCopias(): void {
    this.imprimir(this.hojaDeCopias());
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
