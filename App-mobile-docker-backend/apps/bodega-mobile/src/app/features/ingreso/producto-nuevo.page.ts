import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import type { Categoria, Ubicacion, VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cameraOutline, checkmark } from 'ionicons/icons';
import { Observable, firstValueFrom, forkJoin } from 'rxjs';

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { mensajeDeError } from '../../core/api/errores';
import { CodigoQrComponent } from '../../shared/codigo-qr.component';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { UBICACIONES, enteroDesdeTexto, etiquetaUbicacion, valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { ImagenesService } from '../../shared/imagenes.service';
import { SelectorConNuevoComponent } from '../../shared/selector-con-nuevo.component';
import { InventarioApi } from '../inventario/inventario.api';

/** Tallas que se ofrecen para una categoría que aún no existe en el servicio. */
const TALLAS_POR_DEFECTO = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const mismoNombre = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;

/**
 * Alta de un producto que aún no existe en el catálogo junto con el ingreso de sus
 * primeras unidades. El servicio genera su SKU, su código escaneable y su código de ubicación.
 */
@Component({
  selector: 'app-producto-nuevo',
  imports: [
    CodigoQrComponent,
    EstadoEnvioComponent,
    ImagenPrendaComponent,
    SelectorConNuevoComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
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
          <ion-back-button defaultHref="/ingreso"></ion-back-button>
        </ion-buttons>
        <ion-title>Producto nuevo</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (creada(); as variante) {
        <ion-card class="creado">
          <div class="logro">
            <span aria-hidden="true"><ion-icon name="checkmark"></ion-icon></span>
            <h2>Producto creado</h2>
          </div>
          <div class="resumen">
            <app-imagen-prenda
              [url]="variante.imagenUrl"
              [alt]="'Foto de ' + variante.producto"
              style="--tamano: 92px"
            ></app-imagen-prenda>
            <div>
              <p class="nombre">{{ variante.producto }}</p>
              <div class="rs-chips">
                <span class="rs-chip">{{ variante.categoria }}</span>
                @if (variante.banda) {
                  <span class="rs-chip">{{ variante.banda }}</span>
                }
                <span class="rs-chip">Talla {{ variante.talla }}</span>
                <span class="rs-chip">{{ variante.color }}</span>
              </div>
            </div>
          </div>
          <!-- El servicio le asignó un espacio en la bodega: esta es su etiqueta. -->
          <div class="espacio">
            <app-codigo-qr [texto]="variante.codigoUbicacion" style="--tamano: 104px"></app-codigo-qr>
            <div>
              <p class="rotulo">Espacio asignado en la bodega</p>
              <p class="numero">{{ variante.codigoUbicacion }}</p>
              <ion-button fill="outline" size="small" (click)="verEtiqueta(variante.codigoUbicacion)">Ver etiqueta</ion-button>
            </div>
          </div>
          <!-- Y esta es la etiqueta de la prenda, la que se lee al contarla o venderla. -->
          <div class="espacio">
            <app-codigo-qr [texto]="variante.sku" style="--tamano: 104px"></app-codigo-qr>
            <div>
              <p class="rotulo">Etiqueta de la prenda (SKU)</p>
              <p class="numero">{{ variante.sku }}</p>
              <ion-button fill="outline" size="small" (click)="verEtiquetaDePrenda(variante.sku)">Ver etiqueta</ion-button>
            </div>
          </div>
          <dl class="rs-datos codigos">
            <div>
              <dt>Código de barras</dt>
              <dd>{{ variante.codigo }}</dd>
            </div>
            <div>
              <dt>Cantidad ingresada</dt>
              <dd>{{ resumenIngreso(variante) }}</dd>
            </div>
          </dl>
        </ion-card>
        <div class="rs-acciones">
          <ion-button expand="block" (click)="otro()">Crear otro producto</ion-button>
          <ion-button expand="block" fill="outline" (click)="volver()">Volver al ingreso</ion-button>
        </div>
      } @else {
        <div class="rs-grupo">
          <ion-item>
            <ion-input
              label="Nombre"
              labelPlacement="stacked"
              placeholder="Ej.: Polera Calavera"
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
            (nueva)="agregarCategoria($event)"
          ></app-selector-con-nuevo>
          @if (avisoCatalogo(); as aviso) {
            <p role="status">{{ aviso }}</p>
          }
          @if (categoria().trim() === '') {
            <p class="rs-ayuda ayuda">Elige la categoría para ver sus tallas y los demás datos.</p>
          } @else {
            @if (usaBanda()) {
              <app-selector-con-nuevo
                etiqueta="Banda"
                opcionVacia="Sin banda"
                textoNueva="Agregar banda nueva…"
                etiquetaNueva="Nombre de la banda nueva"
                [opciones]="bandas()"
                [deshabilitado]="bloqueado()"
                [(valor)]="banda"
                (nueva)="agregarBanda($event)"
              ></app-selector-con-nuevo>
              @if (avisoBanda(); as aviso) {
                <p role="status">{{ aviso }}</p>
              }
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
              (nueva)="agregarColor($event)"
            ></app-selector-con-nuevo>
            @if (avisoColor(); as aviso) {
              <p role="status">{{ aviso }}</p>
            }
          }
          <ion-item lines="none">
            <ion-input
              label="Cantidad"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              min="1"
              placeholder="Unidades recibidas"
              [value]="cantidad()"
              [disabled]="bloqueado()"
              (ionInput)="cantidad.set(valor($event))"
            ></ion-input>
          </ion-item>
        </div>

        <h2 class="rs-seccion">Ingresa en</h2>
        <ion-segment [value]="ubicacion()" [disabled]="bloqueado()" (ionChange)="ubicacion.set($any(valor($event)))">
          @for (opcion of ubicaciones; track opcion.valor) {
            <ion-segment-button [value]="opcion.valor">{{ opcion.etiqueta }}</ion-segment-button>
          }
        </ion-segment>

        <h2 class="rs-seccion">Foto</h2>
        <div class="foto rs-grupo">
          <app-imagen-prenda [url]="imagen()" alt="Foto del producto" style="--tamano: 92px"></app-imagen-prenda>
          <div>
            <input #archivo type="file" accept="image/*" hidden (change)="elegirImagen($event)" />
            <ion-button fill="outline" [disabled]="bloqueado()" (click)="archivo.click()">
              <ion-icon slot="start" name="camera-outline" aria-hidden="true"></ion-icon>
              {{ imagen() ? 'Cambiar foto' : 'Elegir foto' }}
            </ion-button>
            @if (errorImagen(); as mensaje) {
              <ion-text color="danger">
                <p role="alert">{{ mensaje }}</p>
              </ion-text>
            }
          </div>
        </div>

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
            <ion-button expand="block" [disabled]="envio.enviando()" (click)="guardar()">
              {{ envio.enviando() ? 'Creando…' : 'Crear producto' }}
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
  styles: `
    .foto,
    .resumen,
    .logro,
    .espacio {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .espacio {
      margin-bottom: 12px;
    }
    .espacio p {
      margin: 0;
    }
    .rotulo {
      color: var(--rs-tenue);
      font-size: 0.8rem;
    }
    .numero {
      color: var(--ion-color-primary);
      font-family: var(--rs-fuente-titulo);
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.2;
    }
    .foto {
      padding: 14px;
    }
    .creado {
      padding: 18px 16px 16px;
    }
    .logro span {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(61, 220, 151, 0.16);
      color: var(--ion-color-success);
      font-size: 24px;
    }
    .logro h2,
    .nombre {
      font-family: var(--rs-fuente-titulo);
      font-weight: 600;
    }
    .logro h2 {
      font-size: 1.4rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .resumen {
      margin: 16px 0;
    }
    .nombre {
      margin: 0 0 8px;
      font-size: 1.35rem;
      line-height: 1.15;
    }
    .codigos {
      grid-template-columns: 1fr;
    }
    .codigos dd {
      font-size: 1.35rem;
    }
  `,
})
export class ProductoNuevoPage {
  private readonly api = inject(InventarioApi);
  private readonly imagenes = inject(ImagenesService);
  private readonly navegacion = inject(NavController);

  readonly envio = new EnvioIdempotente();
  readonly nombre = signal('');
  readonly categoria = signal('');
  readonly banda = signal('');
  readonly talla = signal('');
  readonly color = signal('');
  /** Unidades recibidas, tal como se escriben en el campo. */
  readonly cantidad = signal('');
  /** Ubicación donde ingresan las unidades. */
  readonly ubicacion = signal<Ubicacion>('BODEGA');
  /** Foto elegida, como data URL. */
  readonly imagen = signal<string | null>(null);
  readonly errorImagen = signal<string | null>(null);
  readonly mostrarErrores = signal(false);
  /** Variante creada, con los códigos que generó el servicio. */
  readonly creada = signal<VarianteStock | null>(null);

  /** Categorías y bandas registradas, tengan o no productos. */
  readonly categorias = signal<Categoria[]>([]);
  readonly nombresDeCategorias = computed(() => this.categorias().map((categoria) => categoria.nombre));
  readonly bandas = signal<string[]>([]);
  /** Avisos del último intento de registrar una categoría o una banda nueva. */
  readonly avisoCatalogo = signal<string | null>(null);
  readonly avisoBanda = signal<string | null>(null);

  /** Datos de la categoría elegida; `null` si aún no se elige o si es una que todavía no existe. */
  readonly categoriaElegida = computed(
    () => this.categorias().find((categoria) => mismoNombre(categoria.nombre, this.categoria())) ?? null,
  );
  /** Tallas que admite la categoría elegida: 38 a 50 en pantalones, XS a XXL en poleras, etc. */
  readonly tallas = computed(() => this.categoriaElegida()?.tallas ?? TALLAS_POR_DEFECTO);
  /** Las categorías sin bandas, como los pantalones, no muestran ese campo. */
  readonly usaBanda = computed(() => this.categoriaElegida()?.usaBanda ?? true);
  /** Colores registrados, tengan o no productos. */
  readonly colores = signal<string[]>([]);
  /** Aviso del último intento de registrar un color nuevo; se muestra junto a ese campo. */
  readonly avisoColor = signal<string | null>(null);

  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());

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
    if (!enteroDesdeTexto(this.cantidad())) {
      errores.push('La cantidad debe ser un entero mayor que cero.');
    }
    if (this.imagen() === null) {
      errores.push('Elige una foto del producto.');
    }
    return errores;
  });

  protected readonly valor = valorDeEvento;
  protected readonly ubicaciones = UBICACIONES;

  /** Unidades y ubicación con que quedó el producto recién creado, p. ej. "12 unidades en Bodega". */
  protected resumenIngreso(variante: VarianteStock): string {
    const ingreso = variante.existencias.find((existencia) => existencia.cantidad > 0);
    return ingreso ? `${ingreso.cantidad} unidades en ${etiquetaUbicacion(ingreso.ubicacion)}` : 'Sin unidades';
  }

  constructor() {
    addIcons({ cameraOutline, checkmark });
  }

  /** Ionic lo llama al entrar a la pantalla; trae las sugerencias de los campos. */
  ionViewWillEnter(): void {
    void this.cargarSugerencias();
  }

  async cargarSugerencias(): Promise<void> {
    try {
      const [categorias, bandas, colores] = await firstValueFrom(
        forkJoin([this.api.categorias(), this.api.bandas(), this.api.colores()]),
      );
      this.categorias.set(categorias);
      this.bandas.set(bandas);
      this.colores.set(colores);
    } catch {
      // Sin sugerencias el formulario sigue siendo utilizable escribiendo los valores.
    }
  }

  /**
   * Aplica la categoría elegida. La talla y la banda dependen de la categoría, así que
   * se descartan las que ya no corresponden.
   */
  cambiarCategoria(nombre: string): void {
    this.categoria.set(nombre);
    if (!this.tallas().includes(this.talla())) {
      this.talla.set('');
    }
    if (!this.usaBanda()) {
      this.banda.set('');
    }
  }

  /** Registra la banda de inmediato, sin esperar a que se cree el producto. */
  async agregarBanda(nombre: string): Promise<void> {
    await this.registrarEnCatalogo(nombre, {
      lista: this.bandas,
      elegido: this.banda,
      aviso: this.avisoBanda,
      registrar: (n) => this.api.crearBanda(n),
      confirmacion: (n) => `Banda "${n}" guardada.`,
    });
  }

  /** Registra la categoría de inmediato, sin esperar a que se cree el producto. */
  async agregarCategoria(nombre: string): Promise<void> {
    this.avisoCatalogo.set(null);
    try {
      const categorias = await firstValueFrom(this.api.crearCategoria(nombre));
      this.categorias.set(categorias);
      // El servicio conserva el nombre ya registrado si solo difiere en mayúsculas o tildes.
      this.cambiarCategoria(categorias.find((c) => mismoNombre(c.nombre, nombre))?.nombre ?? nombre);
      this.avisoCatalogo.set(`Categoría "${this.categoria()}" guardada.`);
    } catch (error) {
      this.avisoCatalogo.set(`${mensajeDeError(error)} Se guardará al crear el producto.`);
    }
  }

  /** Registra el color de inmediato, sin esperar a que se cree el producto. */
  async agregarColor(nombre: string): Promise<void> {
    await this.registrarEnCatalogo(nombre, {
      lista: this.colores,
      elegido: this.color,
      aviso: this.avisoColor,
      registrar: (n) => this.api.crearColor(n),
      confirmacion: (n) => `Color "${n}" guardado.`,
    });
  }

  private async registrarEnCatalogo(
    nombre: string,
    catalogo: {
      lista: WritableSignal<string[]>;
      elegido: WritableSignal<string>;
      aviso: WritableSignal<string | null>;
      registrar: (nombre: string) => Observable<string[]>;
      confirmacion: (nombre: string) => string;
    },
  ): Promise<void> {
    catalogo.aviso.set(null);
    try {
      const nombres = await firstValueFrom(catalogo.registrar(nombre));
      catalogo.lista.set(nombres);
      // El servicio conserva el nombre ya registrado si solo difiere en mayúsculas o tildes.
      catalogo.elegido.set(
        nombres.find((n) => n.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0) ?? nombre,
      );
      catalogo.aviso.set(catalogo.confirmacion(catalogo.elegido()));
    } catch (error) {
      catalogo.aviso.set(`${mensajeDeError(error)} Se guardará al crear el producto.`);
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
      this.imagen.set(await this.imagenes.reducir(archivo));
    } catch {
      this.errorImagen.set('No se pudo leer la imagen. Elige otra foto.');
    }
  }

  async guardar(): Promise<void> {
    const imagen = this.imagen();
    const cantidad = enteroDesdeTexto(this.cantidad());
    this.mostrarErrores.set(true);
    if (imagen === null || !cantidad || this.errores().length > 0) {
      return;
    }
    const creada = await this.envio.ejecutar((claveIdempotencia) =>
      this.api.crearProducto({
        claveIdempotencia,
        nombre: this.nombre().trim(),
        categoria: this.categoria().trim(),
        banda: this.usaBanda() ? this.banda().trim() || null : null,
        talla: this.talla().trim(),
        color: this.color().trim(),
        cantidad,
        ubicacion: this.ubicacion(),
        imagen,
      }),
    );
    if (creada) {
      this.creada.set(creada);
      // La banda o categoría recién agregada debe aparecer en las listas del próximo producto.
      await this.cargarSugerencias();
    }
  }

  /** Vuelve a la pantalla de ingreso dejando el formulario limpio. */
  /** Abre la etiqueta QR del espacio, lista para imprimir. El producto creado sigue en pantalla al volver. */
  async verEtiqueta(codigo: string): Promise<void> {
    await this.navegacion.navigateForward('/espacios', { queryParams: { codigo } });
  }

  async verEtiquetaDePrenda(sku: string): Promise<void> {
    await this.navegacion.navigateForward('/etiquetas', { queryParams: { sku } });
  }

  async volver(): Promise<void> {
    this.otro();
    await this.navegacion.navigateBack('/ingreso');
  }

  /** Limpia el formulario para crear otro producto. */
  otro(): void {
    this.creada.set(null);
    this.nombre.set('');
    this.categoria.set('');
    this.banda.set('');
    this.talla.set('');
    this.color.set('');
    this.cantidad.set('');
    this.ubicacion.set('BODEGA');
    this.imagen.set(null);
    this.errorImagen.set(null);
    this.avisoCatalogo.set(null);
    this.avisoBanda.set(null);
    this.avisoColor.set(null);
    this.mostrarErrores.set(false);
  }
}
