import { Component, inject, signal } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import type { VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { createOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { FichaVarianteComponent } from '../../shared/ficha-variante.component';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { InventarioApi } from '../inventario/inventario.api';

@Component({
  selector: 'app-consulta',
  imports: [
    BuscadorVarianteComponent,
    FichaVarianteComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Buscar producto</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-buscador-variante (seleccionada)="variante.set($event)"></app-buscador-variante>
      @if (variante(); as seleccionada) {
        <app-ficha-variante [variante]="seleccionada"></app-ficha-variante>
        <div class="rs-acciones">
          <ion-button expand="block" fill="outline" (click)="editar(seleccionada)">
            <ion-icon slot="start" name="create-outline" aria-hidden="true"></ion-icon>
            Editar producto
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class ConsultaPage {
  private readonly api = inject(InventarioApi);
  private readonly navegacion = inject(NavController);

  readonly variante = signal<VarianteStock | null>(null);

  constructor() {
    addIcons({ createOutline });
  }

  /**
   * Ionic lo llama cada vez que se entra a la pantalla, también al volver de la edición:
   * la ficha se vuelve a pedir para mostrar el producto como quedó.
   */
  ionViewWillEnter(): void {
    void this.refrescar();
  }

  async refrescar(): Promise<void> {
    const actual = this.variante();
    if (!actual) {
      return;
    }
    try {
      // El SKU no cambia al editar, así que identifica a la misma prenda.
      this.variante.set(await firstValueFrom(this.api.variantePorCodigo(actual.sku)));
    } catch {
      // Sin conexión se conserva la ficha que ya estaba en pantalla.
    }
  }

  async editar(variante: VarianteStock): Promise<void> {
    await this.navegacion.navigateForward('/producto/editar', { queryParams: { sku: variante.sku } });
  }
}
