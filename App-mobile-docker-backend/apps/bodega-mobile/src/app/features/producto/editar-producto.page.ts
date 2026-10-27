import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonText,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import type { Categoria, VarianteEdicionRequest, VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cameraOutline } from 'ionicons/icons';
import { firstValueFrom, forkJoin } from 'rxjs';

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { mensajeDeError } from '../../core/api/errores';
import { AvisosService } from '../../shared/avisos.service';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { ImagenesService } from '../../shared/imagenes.service';
import { SelectorConNuevoComponent } from '../../shared/selector-con-nuevo.component';
import { InventarioApi } from '../inventario/inventario.api';

/** Tallas que se ofrecen para una categoría que aún no existe en el servicio. */
const TALLAS_POR_DEFECTO = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const mismoNombre = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;

/**
 * Edición de una prenda ya registrada: nombre, categoría, banda, talla, color y foto.
 * Llega con el SKU de la prenda (`/producto/editar?sku=RS-0001`), parte con sus datos
 * actuales y envía solo lo que cambió. Las unidades no se editan aquí: el stock cambia
 * con ingresos, mermas, traspasos y conteos, que dejan su registro.
 */
@Component({
  selector: 'app-editar-producto',
  imports: [
    EstadoEnvioComponent,
    ImagenPrendaComponent,
    SelectorConNuevoComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/consulta"></ion-back-button>
        </ion-buttons>
        <ion-title>Editar producto</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (errorDeCarga(); as mensaje) {
        <div class="rs-acciones">
          <ion-text color="danger">
            <p role="alert">{{ mensaje }}</p>
          </ion-text>
          <ion-button expand="block" [disabled]="cargando()" (click)="cargar()">Reintentar</ion-button>
        </div>
      } @else if (original(); as prenda) {
        <p class="rs-ayuda">
          {{ prenda.sku }} · {{ prenda.codigo }}. El nombre, la categoría, la banda y la foto se cambian en todas las tallas y
          colores de este producto. La talla y el color, solo en esta prenda.
        </p>

        <div class="rs-grupo">
          <ion-item>
            <ion-input
              label="Nombre"
              labelPlacement="stacked"
              [value]="nombre()"
              [disabled]="bloqueado()"
              (ionInput)="nombre.set(valor($event))"
            ></ion-input>
          </ion-item>
          <app-selector-con-nuevo
            etiqueta="Categoría"
            textoNueva="Agregar categoría nueva…"
            etiquetaNueva="Nombre de la categoría nueva"
            [opciones]="nombresDeCategorias()"
            [deshabilitado]="bloqueado()"
            [valor]="categoria()"
            (valorChange)="cambiarCategoria($event)"
          ></app-selector-con-nuevo>
          @if (cambiaDeCategoria()) {
            <p role="status">
              Al cambiar la categoría, el producto recibe un espacio nuevo en la bodega. Habrá que moverlo e imprimir la etiqueta
              de ese espacio.
            </p>
          }
          @if (usaBanda()) {
            <app-selector-con-nuevo
              etiqueta="Banda"
              opcionVacia="Sin banda"
              textoNueva="Agregar banda nueva…"
              etiquetaNueva="Nombre de la banda nueva"
              [opciones]="bandas()"
              [deshabilitado]="bloqueado()"
              [(valor)]="banda"
            ></app-selector-con-nuevo>
          }
          <app-selector-con-nuevo
            etiqueta="Talla"
            textoNueva="Agregar talla nueva…"
            etiquetaNueva="Talla nueva"
            [opciones]="tallas()"
            [deshabilitado]="bloqueado()"
            [(valor)]="talla"
          ></app-selector-con-nuevo>
          <app-selector-con-nuevo
            etiqueta="Color"
            textoNueva="Agregar color nuevo…"
            etiquetaNueva="Nombre del color nuevo"
            [opciones]="colores()"
            [deshabilitado]="bloqueado()"
            [(valor)]="color"
          ></app-selector-con-nuevo>
        </div>

        <h2 class="rs-seccion">Foto</h2>
        <div class="foto rs-grupo">
          <app-imagen-prenda [url]="imagen()" [alt]="'Foto de ' + prenda.producto" style="--tamano: 92px"></app-imagen-prenda>
          <div>
            <input #archivo type="file" accept="image/*" hidden (change)="elegirImagen($event)" />
            <ion-button fill="outline" [disabled]="bloqueado()" (click)="archivo.click()">
              <ion-icon slot="start" name="camera-outline" aria-hidden="true"></ion-icon>
              Cambiar foto
            </ion-button>
            @if (imagenNueva()) {
              <ion-button fill="clear" color="medium" [disabled]="bloqueado()" (click)="descartarImagen()">Dejar la anterior</ion-button>
            }
            @if (errorImagen(); as mensaje) {
              <ion-text color="danger">
                <p role="alert">{{ mensaje }}</p>
              </ion-text>
            }
          </div>
        </div>

        <p class="rs-ayuda">Las unidades no se cambian aquí: usa Conteo, Ingreso, Merma o Traspaso, que dejan su registro.</p>

        @if (mostrarErrores() && errores().length > 0) {
          <ion-text color="danger">
            <ul role="alert">
              @for (error of errores(); track error) {
                <li>{{ error }}</li>
              }
            </ul>
          </ion-text>
        }
        <app-estado-envio [envio]="envio" (reintentar)="guardar()"></app-estado-envio>

        @if (!envio.reintentable()) {
          <div class="rs-acciones">
            <ion-button expand="block" [disabled]="envio.enviando() || !hayCambios()" (click)="guardar()">
              {{ envio.enviando() ? 'Guardando…' : hayCambios() ? 'Guardar cambios' : 'Sin cambios' }}
            </ion-button>
          </div>
        }
      } @else {
        <p class="rs-ayuda" role="status">Cargando el producto…</p>
      }
    </ion-content>
  `,
  styles: `
    .foto {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
    }
  `,
})
export class EditarProductoPage {
  private readonly api = inject(InventarioApi);
  private readonly imagenes = inject(ImagenesService);
  private readonly avisos = inject(AvisosService);
  private readonly navegacion = inject(NavController);

  /** SKU de la prenda, tomado de la dirección. */
  readonly sku = input<string>();

  readonly envio = new EnvioIdempotente();
  /** La prenda como está guardada; contra ella se calcula qué cambió. */
  readonly original = signal<VarianteStock | null>(null);
  readonly cargando = signal(false);
  readonly errorDeCarga = signal<string | null>(null);

  readonly nombre = signal('');
  readonly categoria = signal('');
  readonly banda = signal('');
  readonly talla = signal('');
  readonly color = signal('');
  /** Foto nueva elegida, como data URL; `null` si se conserva la actual. */
  readonly imagenNueva = signal<string | null>(null);
  readonly errorImagen = signal<string | null>(null);
  readonly mostrarErrores = signal(false);

  /** La foto que se muestra: la nueva si se eligió una, si no la que ya tiene el producto. */
  readonly imagen = computed(() => this.imagenNueva() ?? this.original()?.imagenUrl ?? null);

  readonly categorias = signal<Categoria[]>([]);
  readonly nombresDeCategorias = computed(() => this.categorias().map((categoria) => categoria.nombre));
  readonly bandas = signal<string[]>([]);
  readonly colores = signal<string[]>([]);

  /** Datos de la categoría elegida; `null` si es una que todavía no existe. */
  readonly categoriaElegida = computed(
    () => this.categorias().find((categoria) => mismoNombre(categoria.nombre, this.categoria())) ?? null,
  );
  readonly tallas = computed(() => this.categoriaElegida()?.tallas ?? TALLAS_POR_DEFECTO);
  /** Las categorías sin bandas, como los pantalones, no muestran ese campo. */
  readonly usaBanda = computed(() => this.categoriaElegida()?.usaBanda ?? true);
  readonly cambiaDeCategoria = computed(() => {
    const original = this.original();
    return original !== null && this.categoria().trim() !== '' && !mismoNombre(original.categoria, this.categoria());
  });

  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());

  /** Solo lo que es distinto de lo guardado: es lo único que se envía. */
  readonly cambios = computed<VarianteEdicionRequest>(() => {
    const original = this.original();
    const cambios: VarianteEdicionRequest = {};
    if (!original) {
      return cambios;
    }
    if (this.nombre().trim() !== original.producto) {
      cambios.nombre = this.nombre().trim();
    }
    if (this.categoria().trim() !== original.categoria) {
      cambios.categoria = this.categoria().trim();
    }
    const banda = this.usaBanda() ? this.banda().trim() || null : null;
    if (banda !== original.banda) {
      cambios.banda = banda;
    }
    if (this.talla().trim() !== original.talla) {
      cambios.talla = this.talla().trim();
    }
    if (this.color().trim() !== original.color) {
      cambios.color = this.color().trim();
    }
    const imagen = this.imagenNueva();
    if (imagen !== null) {
      cambios.imagen = imagen;
    }
    return cambios;
  });
  readonly hayCambios = computed(() => Object.keys(this.cambios()).length > 0);

  readonly errores = computed(() => {
    const errores: string[] = [];
    if (this.nombre().trim() === '') {
      errores.push('El nombre es obligatorio.');
    }
    if (this.categoria().trim() === '') {
      errores.push('La categoría es obligatoria.');
    }
    if (this.talla().trim() === '') {
      errores.push('La talla es obligatoria.');
    }
    if (this.color().trim() === '') {
      errores.push('El color es obligatorio.');
    }
    return errores;
  });

  protected readonly valor = valorDeEvento;

  constructor() {
    addIcons({ cameraOutline });
  }

  /** Ionic lo llama al entrar a la pantalla: trae la prenda y las listas de los campos. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    const sku = this.sku()?.trim();
    if (!sku) {
      this.errorDeCarga.set('Falta indicar qué producto editar. Vuelve a la consulta y elige uno.');
      return;
    }
    this.cargando.set(true);
    this.errorDeCarga.set(null);
    try {
      const [prenda, categorias, bandas, colores] = await firstValueFrom(
        forkJoin([this.api.variantePorCodigo(sku), this.api.categorias(), this.api.bandas(), this.api.colores()]),
      );
      this.categorias.set(categorias);
      this.bandas.set(bandas);
      this.colores.set(colores);
      this.partirDe(prenda);
    } catch (error) {
      this.errorDeCarga.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Deja el formulario con los datos guardados de la prenda. */
  private partirDe(prenda: VarianteStock): void {
    this.original.set(prenda);
    this.nombre.set(prenda.producto);
    this.categoria.set(prenda.categoria);
    this.banda.set(prenda.banda ?? '');
    this.talla.set(prenda.talla);
    this.color.set(prenda.color);
    this.imagenNueva.set(null);
    this.errorImagen.set(null);
    this.mostrarErrores.set(false);
    this.envio.reiniciar();
    this.envio.error.set(null);
  }

  /** La banda depende de la categoría: una sin bandas la descarta. La talla se conserva, porque es la de la prenda. */
  cambiarCategoria(nombre: string): void {
    this.categoria.set(nombre);
    if (!this.usaBanda()) {
      this.banda.set('');
    }
  }

  async elegirImagen(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    // Se limpia el campo para poder volver a elegir el mismo archivo.
    campo.value = '';
    if (archivo) {
      await this.cargarImagen(archivo);
    }
  }

  async cargarImagen(archivo: Blob): Promise<void> {
    this.errorImagen.set(null);
    try {
      this.imagenNueva.set(await this.imagenes.reducir(archivo));
    } catch {
      this.errorImagen.set('No se pudo leer la imagen. Elige otra foto.');
    }
  }

  descartarImagen(): void {
    this.imagenNueva.set(null);
    this.errorImagen.set(null);
  }

  async guardar(): Promise<void> {
    const original = this.original();
    this.mostrarErrores.set(true);
    if (!original || this.errores().length > 0 || !this.hayCambios()) {
      return;
    }
    const cambios = this.cambios();
    // Editar no duplica nada al repetirse, así que la clave de idempotencia no se usa.
    const guardada = await this.envio.ejecutar(() => this.api.editarVariante(original.idVariante, cambios));
    if (guardada) {
      await this.avisos.exito(`${guardada.producto} actualizado.`);
      await this.navegacion.navigateBack('/consulta');
    }
  }
}
