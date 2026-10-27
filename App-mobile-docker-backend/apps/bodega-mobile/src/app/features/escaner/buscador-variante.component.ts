import { Component, inject, input, output, signal } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSearchbar, IonText } from '@ionic/angular';
import type { VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { scanOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { codigoDeError, mensajeDeError } from '../../core/api/errores';
import { nombreVariante, valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { esCodigoDeEspacio } from '../espacios/espacios';
import { InventarioApi } from '../inventario/inventario.api';
import { EscanerService } from './escaner.service';

/**
 * Selección de una variante escaneando su código o, como alternativa siempre
 * disponible, buscándola por SKU o nombre.
 */
@Component({
  selector: 'app-buscador-variante',
  imports: [ImagenPrendaComponent, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSearchbar, IonText],
  template: `
    @if (conEscaner()) {
      <div class="rs-acciones">
        <ion-button expand="block" [disabled]="ocupado()" (click)="escanear()">
          <ion-icon slot="start" name="scan-outline" aria-hidden="true"></ion-icon>
          Escanear código
        </ion-button>
      </div>
    }
    @if (aviso(); as mensaje) {
      <ion-text color="warning">
        <p role="status">{{ mensaje }}</p>
      </ion-text>
    }
    <ion-searchbar
      placeholder="SKU, nombre o espacio"
      [debounce]="300"
      [value]="texto()"
      (ionInput)="buscar(valor($event))"
    ></ion-searchbar>
    @if (resultados().length > 0) {
      <ion-list>
        @for (variante of resultados(); track variante.idVariante) {
          <ion-item button (click)="elegir(variante)">
            <app-imagen-prenda slot="start" [url]="variante.imagenUrl" style="--tamano: 48px"></app-imagen-prenda>
            <ion-label>
              <h3>{{ nombre(variante) }}</h3>
              <p>{{ variante.sku }}</p>
            </ion-label>
            <ion-note slot="end" class="disponible">
              <strong>{{ variante.disponible }}</strong> disp.
            </ion-note>
          </ion-item>
        }
      </ion-list>
    } @else if (sinResultados()) {
      <p class="rs-ayuda">No se encontraron productos.</p>
    }
  `,
  styles: `
    .disponible strong {
      color: var(--ion-color-primary);
      font-size: 1.05rem;
    }
  `,
})
export class BuscadorVarianteComponent {
  private readonly api = inject(InventarioApi);
  private readonly escaner = inject(EscanerService);

  /** Si es falso, solo se ofrece la búsqueda por texto. */
  readonly conEscaner = input(true);
  readonly seleccionada = output<VarianteStock>();

  protected readonly texto = signal('');
  protected readonly resultados = signal<VarianteStock[]>([]);
  protected readonly sinResultados = signal(false);
  readonly aviso = signal<string | null>(null);
  protected readonly ocupado = signal(false);

  protected readonly nombre = nombreVariante;
  protected readonly valor = valorDeEvento;

  constructor() {
    addIcons({ scanOutline });
  }

  async escanear(): Promise<void> {
    this.aviso.set(null);
    this.ocupado.set(true);
    try {
      const resultado = await this.escaner.escanear();
      if (resultado.estado === 'leido') {
        await this.resolverCodigo(resultado.codigo);
      } else if (resultado.estado === 'no-disponible') {
        this.aviso.set(resultado.motivo);
      }
    } finally {
      this.ocupado.set(false);
    }
  }

  async buscar(texto: string): Promise<void> {
    this.texto.set(texto);
    this.aviso.set(null);
    if (texto.trim() === '') {
      this.resultados.set([]);
      this.sinResultados.set(false);
      return;
    }
    try {
      const resultados = await firstValueFrom(this.api.buscarVariantes(texto));
      // Se descarta la respuesta si el usuario siguió escribiendo mientras llegaba.
      if (this.texto() === texto) {
        this.resultados.set(resultados);
        this.sinResultados.set(resultados.length === 0);
      }
    } catch (error) {
      this.aviso.set(mensajeDeError(error));
    }
  }

  protected elegir(variante: VarianteStock): void {
    this.texto.set('');
    this.resultados.set([]);
    this.sinResultados.set(false);
    this.seleccionada.emit(variante);
  }

  private async resolverCodigo(codigo: string): Promise<void> {
    try {
      if (esCodigoDeEspacio(codigo)) {
        await this.resolverEspacio(codigo.trim());
        return;
      }
      this.seleccionada.emit(await firstValueFrom(this.api.variantePorCodigo(codigo)));
    } catch (error) {
      this.aviso.set(
        codigoDeError(error) === 'NO_ENCONTRADO'
          ? `El código ${codigo} no está registrado.`
          : mensajeDeError(error),
      );
    }
  }

  /**
   * La etiqueta escaneada es la de un espacio de la bodega, no la de una prenda: se
   * muestran las tallas y colores guardados ahí. Si hay una sola, queda elegida.
   */
  private async resolverEspacio(codigo: string): Promise<void> {
    const encontradas = await firstValueFrom(this.api.buscarVariantes(codigo));
    const delEspacio = encontradas.filter((variante) => variante.codigoUbicacion.toLowerCase() === codigo.toLowerCase());
    if (delEspacio.length === 0) {
      this.aviso.set(`El espacio ${codigo} no tiene productos registrados.`);
    } else if (delEspacio.length === 1) {
      this.seleccionada.emit(delEspacio[0]);
    } else {
      this.texto.set(codigo);
      this.resultados.set(delEspacio);
      this.sinResultados.set(false);
      this.aviso.set(`Espacio ${codigo}: elige la talla y el color.`);
    }
  }
}
