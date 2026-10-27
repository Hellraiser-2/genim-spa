import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { TipoMerma, Ubicacion, VarianteStock } from '@rockstar/contracts';

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { AvisosService } from '../../shared/avisos.service';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { FichaVarianteComponent } from '../../shared/ficha-variante.component';
import { TIPOS_MERMA, UBICACIONES, enteroDesdeTexto, existenciaEn, valorDeEvento } from '../../shared/formato';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { InventarioApi } from '../inventario/inventario.api';

@Component({
  selector: 'app-merma',
  imports: [
    BuscadorVarianteComponent,
    EstadoEnvioComponent,
    FichaVarianteComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Ingreso de merma</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (!bloqueado()) {
        <app-buscador-variante (seleccionada)="seleccionar($event)"></app-buscador-variante>
      }
      @if (variante(); as seleccionada) {
        <app-ficha-variante [variante]="seleccionada"></app-ficha-variante>

        <h2 class="rs-seccion">Sale de</h2>
        <ion-segment [value]="ubicacion()" [disabled]="bloqueado()" (ionChange)="ubicacion.set($any(valor($event)))">
          @for (opcion of ubicaciones; track opcion.valor) {
            <ion-segment-button [value]="opcion.valor">{{ opcion.etiqueta }}</ion-segment-button>
          }
        </ion-segment>
        <ion-list>
          <ion-item>
            <ion-select
              label="Tipo de merma"
              labelPlacement="stacked"
              placeholder="Selecciona"
              interface="action-sheet"
              [value]="tipo()"
              [disabled]="bloqueado()"
              (ionChange)="tipo.set($any(valor($event)))"
            >
              @for (opcion of tipos; track opcion.valor) {
                <ion-select-option [value]="opcion.valor">{{ opcion.etiqueta }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              label="Cantidad"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              [value]="cantidad()"
              [disabled]="bloqueado()"
              (ionInput)="cantidad.set(valor($event))"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-textarea
              label="Motivo"
              labelPlacement="stacked"
              [autoGrow]="true"
              [value]="motivo()"
              [disabled]="bloqueado()"
              (ionInput)="motivo.set(valor($event))"
            ></ion-textarea>
          </ion-item>
        </ion-list>

        @if (mostrarErrores() && errores().length > 0) {
          <ion-text color="danger">
            <ul role="alert">
              @for (error of errores(); track error) {
                <li>{{ error }}</li>
              }
            </ul>
          </ion-text>
        }
        <app-estado-envio [envio]="envio" (reintentar)="confirmar()"></app-estado-envio>

        @if (!envio.reintentable()) {
          <div class="rs-acciones">
            <ion-button expand="block" color="danger" [disabled]="envio.enviando()" (click)="confirmar()">
              {{ envio.enviando() ? 'Registrando…' : 'Registrar merma' }}
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
})
export class MermaPage {
  private readonly api = inject(InventarioApi);
  private readonly avisos = inject(AvisosService);

  readonly envio = new EnvioIdempotente();
  readonly variante = signal<VarianteStock | null>(null);
  readonly ubicacion = signal<Ubicacion>('BODEGA');
  readonly tipo = signal<TipoMerma | null>(null);
  readonly cantidad = signal('');
  readonly motivo = signal('');
  readonly mostrarErrores = signal(false);

  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());

  readonly errores = computed(() => {
    const variante = this.variante();
    const cantidad = enteroDesdeTexto(this.cantidad());
    const errores: string[] = [];
    if (variante && !variante.activo) {
      errores.push('El producto está desactivado y no admite mermas.');
    }
    if (this.tipo() === null) {
      errores.push('Selecciona el tipo de merma: dañado, muestra o cambio.');
    }
    if (cantidad === null || cantidad === 0) {
      errores.push('La cantidad debe ser un entero mayor que cero.');
    } else if (variante && cantidad > existenciaEn(variante, this.ubicacion())) {
      errores.push('La cantidad supera la existencia de la ubicación.');
    }
    if (this.motivo().trim() === '') {
      errores.push('El motivo es obligatorio.');
    }
    return errores;
  });

  protected readonly ubicaciones = UBICACIONES;
  protected readonly tipos = TIPOS_MERMA;
  protected readonly valor = valorDeEvento;

  seleccionar(variante: VarianteStock): void {
    this.variante.set(variante);
    this.mostrarErrores.set(false);
    this.envio.error.set(null);
  }

  async confirmar(): Promise<void> {
    const variante = this.variante();
    const tipoMerma = this.tipo();
    this.mostrarErrores.set(true);
    if (!variante || tipoMerma === null || this.errores().length > 0) {
      return;
    }
    const cantidad = enteroDesdeTexto(this.cantidad()) ?? 0;
    const resultado = await this.envio.ejecutar((claveIdempotencia) =>
      this.api.registrarMerma({
        claveIdempotencia,
        idVariante: variante.idVariante,
        ubicacion: this.ubicacion(),
        cantidad,
        tipoMerma,
        motivo: this.motivo().trim(),
      }),
    );
    if (resultado) {
      this.variante.set(resultado.variantes[0] ?? null);
      this.tipo.set(null);
      this.cantidad.set('');
      this.motivo.set('');
      this.mostrarErrores.set(false);
      await this.avisos.exito(`Merma registrada: ${cantidad} unidades.`);
    }
  }
}
