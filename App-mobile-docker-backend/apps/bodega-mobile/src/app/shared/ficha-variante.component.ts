import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonCard, IonIcon, IonRouterLinkWithHref } from '@ionic/angular';
import type { VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { locationOutline, qrCodeOutline } from 'ionicons/icons';

import { etiquetaUbicacion } from './formato';
import { ImagenPrendaComponent } from './imagen-prenda.component';

/** Datos de una variante con sus existencias por ubicación. */
@Component({
  selector: 'app-ficha-variante',
  imports: [ImagenPrendaComponent, IonBadge, IonCard, IonIcon, IonRouterLinkWithHref, RouterLink],
  template: `
    <ion-card>
      <div class="encabezado">
        <app-imagen-prenda
          [url]="variante().imagenUrl"
          [alt]="'Foto de ' + variante().producto"
          style="--tamano: 92px"
        ></app-imagen-prenda>
        <div>
          <p class="sku">
            <!-- El SKU lleva a la etiqueta QR de la prenda. -->
            <a
              routerLink="/etiquetas"
              [queryParams]="{ sku: variante().sku }"
              [attr.aria-label]="'Ver la etiqueta QR de ' + variante().sku"
            >
              {{ variante().sku }}
              <ion-icon name="qr-code-outline" aria-hidden="true"></ion-icon>
            </a>
            · {{ variante().codigo }}
          </p>
          <h2>{{ variante().producto }}</h2>
          <div class="rs-chips">
            <span class="rs-chip">{{ variante().categoria }}</span>
            @if (variante().banda; as banda) {
              <span class="rs-chip">{{ banda }}</span>
            }
            <span class="rs-chip">Talla {{ variante().talla }}</span>
            <span class="rs-chip">{{ variante().color }}</span>
          </div>
        </div>
      </div>
      <div class="ubicacion">
        <span>
          <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
          Ubicación en bodega
          <!-- El código lleva a la etiqueta QR de ese espacio. -->
          <a
            class="rs-codigo"
            routerLink="/espacios"
            [queryParams]="{ codigo: variante().codigoUbicacion }"
            [attr.aria-label]="'Ver la etiqueta QR del espacio ' + variante().codigoUbicacion"
          >
            {{ variante().codigoUbicacion }}
            <ion-icon name="qr-code-outline" aria-hidden="true"></ion-icon>
          </a>
        </span>
        @if (variante().activo) {
          <ion-badge color="success">Activo</ion-badge>
        } @else {
          <ion-badge color="medium">Desactivado</ion-badge>
        }
      </div>
      <dl class="rs-datos">
        @for (existencia of variante().existencias; track existencia.ubicacion) {
          <div>
            <dt>{{ etiqueta(existencia.ubicacion) }}</dt>
            <dd>{{ existencia.cantidad }}</dd>
          </div>
        }
        <div>
          <dt>Reservado</dt>
          <dd>{{ variante().reservado }}</dd>
        </div>
        <div class="rs-destacado">
          <dt>Disponible</dt>
          <dd>{{ variante().disponible }}</dd>
        </div>
      </dl>
    </ion-card>
  `,
  styles: `
    ion-card {
      padding: 16px;
    }
    .encabezado {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .sku {
      margin: 0;
      color: var(--rs-tenue);
      font-size: 0.78rem;
      letter-spacing: 0.04em;
    }
    h2 {
      margin: 2px 0 8px;
      font-family: var(--rs-fuente-titulo);
      font-size: 1.5rem;
      font-weight: 600;
      line-height: 1.15;
    }
    .ubicacion {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 14px 0;
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
    .ubicacion span {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .ubicacion ion-icon {
      color: var(--ion-color-primary);
      font-size: 18px;
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .ubicacion a ion-icon {
      font-size: 15px;
    }
    .sku a {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
  `,
})
export class FichaVarianteComponent {
  readonly variante = input.required<VarianteStock>();

  protected readonly etiqueta = etiquetaUbicacion;

  constructor() {
    addIcons({ locationOutline, qrCodeOutline });
  }
}
