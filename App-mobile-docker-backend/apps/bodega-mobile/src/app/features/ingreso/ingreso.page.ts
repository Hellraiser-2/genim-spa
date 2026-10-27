import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonRouterLink,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Ubicacion, VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { add, closeCircleOutline } from 'ionicons/icons';

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { AvisosService } from '../../shared/avisos.service';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { UBICACIONES, enteroDesdeTexto, etiquetaUbicacion, nombreVariante, valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { InventarioApi } from '../inventario/inventario.api';

interface LineaIngreso {
  variante: VarianteStock;
  cantidad: string;
}

@Component({
  selector: 'app-ingreso',
  imports: [
    BuscadorVarianteComponent,
    EstadoEnvioComponent,
    ImagenPrendaComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonRouterLink,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Ingresar producto</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-segment [value]="ubicacion()" [disabled]="bloqueado()" (ionChange)="ubicacion.set($any(valor($event)))">
        @for (opcion of ubicaciones; track opcion.valor) {
          <ion-segment-button [value]="opcion.valor">{{ opcion.etiqueta }}</ion-segment-button>
        }
      </ion-segment>

      @if (!bloqueado()) {
        <app-buscador-variante (seleccionada)="agregar($event)"></app-buscador-variante>
        <div class="rs-acciones">
          <ion-button expand="block" fill="outline" routerLink="/ingreso/producto-nuevo">
            <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
            Ingresar producto nuevo
          </ion-button>
        </div>
      }
      @if (aviso(); as mensaje) {
        <ion-text color="warning">
          <p role="status">{{ mensaje }}</p>
        </ion-text>
      }

      <h2 class="rs-seccion">Prendas recibidas</h2>
      <ion-list>
        @for (linea of lineas(); track linea.variante.idVariante) {
          <ion-item>
            <app-imagen-prenda slot="start" [url]="linea.variante.imagenUrl" style="--tamano: 48px"></app-imagen-prenda>
            <ion-label>
              <h3>{{ nombre(linea.variante) }}</h3>
              <p>{{ linea.variante.sku }}</p>
            </ion-label>
            <ion-input
              slot="end"
              class="cantidad"
              type="number"
              inputmode="numeric"
              min="1"
              label="Cantidad"
              labelPlacement="stacked"
              [value]="linea.cantidad"
              [disabled]="bloqueado()"
              [class.ion-invalid]="cantidadInvalida(linea)"
              [class.ion-touched]="cantidadInvalida(linea)"
              (ionInput)="cambiarCantidad(linea.variante.idVariante, valor($event))"
            ></ion-input>
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              [attr.aria-label]="'Quitar ' + nombre(linea.variante)"
              [disabled]="bloqueado()"
              (click)="quitar(linea.variante.idVariante)"
            >
              <ion-icon slot="icon-only" name="close-circle-outline"></ion-icon>
            </ion-button>
          </ion-item>
        } @empty {
          <ion-item>
            <ion-label class="vacio">Escanea o busca las prendas recibidas.</ion-label>
          </ion-item>
        }
        <ion-item>
          <ion-input
            label="Nota (opcional)"
            labelPlacement="stacked"
            [value]="motivo()"
            [disabled]="bloqueado()"
            (ionInput)="motivo.set(valor($event))"
          ></ion-input>
        </ion-item>
      </ion-list>

      @if (hayCantidadesInvalidas()) {
        <ion-text color="danger">
          <p role="alert">Las cantidades deben ser enteros mayores que cero.</p>
        </ion-text>
      }
      <app-estado-envio [envio]="envio" (reintentar)="confirmar()"></app-estado-envio>

      @if (!envio.reintentable()) {
        <div class="rs-acciones">
          <ion-button expand="block" [disabled]="!puedeConfirmar()" (click)="confirmar()">
            {{ envio.enviando() ? 'Registrando…' : 'Registrar ingreso en ' + etiquetaUbicacion(ubicacion()) }}
          </ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .cantidad {
      max-width: 88px;
    }
    .vacio {
      color: var(--rs-tenue);
    }
  `,
})
export class IngresoPage {
  private readonly api = inject(InventarioApi);
  private readonly avisos = inject(AvisosService);

  readonly envio = new EnvioIdempotente();
  readonly ubicacion = signal<Ubicacion>('BODEGA');
  readonly motivo = signal('');
  readonly lineas = signal<LineaIngreso[]>([]);
  readonly aviso = signal<string | null>(null);

  readonly hayCantidadesInvalidas = computed(() => this.lineas().some((linea) => this.cantidadInvalida(linea)));
  /** Mientras un envío está en curso o sin confirmar, los datos no se pueden cambiar. */
  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());
  readonly puedeConfirmar = computed(
    () => this.lineas().length > 0 && !this.hayCantidadesInvalidas() && !this.envio.enviando(),
  );

  protected readonly ubicaciones = UBICACIONES;
  protected readonly nombre = nombreVariante;
  protected readonly valor = valorDeEvento;
  protected readonly etiquetaUbicacion = etiquetaUbicacion;

  constructor() {
    addIcons({ add, closeCircleOutline });
  }

  /** Agrega la variante al ingreso, o suma una unidad si ya estaba. */
  agregar(variante: VarianteStock): void {
    if (this.bloqueado()) {
      return;
    }
    if (!variante.activo) {
      this.aviso.set(`${nombreVariante(variante)} está desactivado y no admite ingresos.`);
      return;
    }
    this.aviso.set(null);
    this.lineas.update((lineas) => {
      const existente = lineas.find((linea) => linea.variante.idVariante === variante.idVariante);
      if (!existente) {
        return [...lineas, { variante, cantidad: '1' }];
      }
      const cantidad = String((enteroDesdeTexto(existente.cantidad) ?? 0) + 1);
      return lineas.map((linea) => (linea === existente ? { ...linea, cantidad } : linea));
    });
  }

  cambiarCantidad(idVariante: number, cantidad: string): void {
    this.lineas.update((lineas) =>
      lineas.map((linea) => (linea.variante.idVariante === idVariante ? { ...linea, cantidad } : linea)),
    );
  }

  quitar(idVariante: number): void {
    this.lineas.update((lineas) => lineas.filter((linea) => linea.variante.idVariante !== idVariante));
  }

  cantidadInvalida(linea: LineaIngreso): boolean {
    const cantidad = enteroDesdeTexto(linea.cantidad);
    return cantidad === null || cantidad === 0;
  }

  async confirmar(): Promise<void> {
    if (!this.puedeConfirmar()) {
      return;
    }
    const lineas = this.lineas().map((linea) => ({
      idVariante: linea.variante.idVariante,
      cantidad: enteroDesdeTexto(linea.cantidad) ?? 0,
    }));
    const resultado = await this.envio.ejecutar((claveIdempotencia) =>
      this.api.registrarIngreso({
        claveIdempotencia,
        ubicacion: this.ubicacion(),
        motivo: this.motivo().trim() || undefined,
        lineas,
      }),
    );
    if (resultado) {
      const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
      this.lineas.set([]);
      this.motivo.set('');
      await this.avisos.exito(`Ingreso registrado: ${unidades} unidades en ${etiquetaUbicacion(this.ubicacion())}.`);
    }
  }
}
