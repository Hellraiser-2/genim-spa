import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, calendarOutline } from 'ionicons/icons';
import { Product, discountPercent, formatCLP, formatDay, usePlaceholder } from '../../data/models';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { ProductsService } from '../../services/products.service';
import { ToastService } from '../../services/toast.service';

/** Con estas unidades o menos, una talla se marca como "últimas unidades". */
const LOW_STOCK = 3;

/**
 * Página de un producto (`/producto/:id`): su foto, su precio, sus tallas y lo que hay
 * que saber antes de comprarlo. Cada talla es un cuadro cuyo color dice si se puede
 * comprar: verde con unidades, amarillo con las últimas y gris agotada. Las medidas salen
 * de la guía de tallas de la categoría, y el tipo de estampado, del producto.
 */
@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded" *ngIf="product() as p; else missing">
        <nav class="crumbs" aria-label="Ruta">
          <a routerLink="/shop">Tienda</a>
          <span aria-hidden="true">/</span>
          <a routerLink="/shop" [queryParams]="{ categoria: p.category }">{{ p.category }}</a>
          <ng-container *ngIf="p.band">
            <span aria-hidden="true">/</span>
            <a routerLink="/shop" [queryParams]="{ banda: p.band }">{{ p.band }}</a>
          </ng-container>
        </nav>

        <div class="layout">
          <div class="photo">
            <img [src]="p.image" [alt]="p.name" (error)="usePlaceholder($event)" />
            <div class="badge-offer" *ngIf="p.listPrice">Oferta -{{ discountPercent(p.price, p.listPrice) }}%</div>
          </div>

          <div class="info">
            <div class="section-title">{{ p.band ?? p.category }}</div>
            <h1>{{ p.name }}</h1>

            <div class="prices">
              <span class="price">{{ formatCLP(p.price) }}</span>
              <s class="list-price" *ngIf="p.listPrice">{{ formatCLP(p.listPrice) }}</s>
            </div>

            <p class="concert" *ngIf="concert() as c">
              <ion-icon name="calendar-outline" aria-hidden="true"></ion-icon>
              {{ p.band }} toca en Chile el {{ formatDay(c.fecha) }}{{ c.lugar ? ' · ' + c.lugar : '' }}
            </p>

            <ng-container *ngIf="colors().length > 1">
              <h2>Color</h2>
              <div class="colors">
                <button class="color" *ngFor="let color of colors()" [class.selected]="color === p.color" [attr.aria-pressed]="color === p.color" (click)="pickColor(color)">
                  {{ color }}
                </button>
              </div>
            </ng-container>

            <h2>Tallas</h2>
            <div class="sizes">
              <button
                class="size"
                *ngFor="let v of sizes()"
                [class.low]="v.stock > 0 && v.stock <= lowStock"
                [class.out]="v.stock <= 0"
                [class.selected]="v.id === p.id"
                [disabled]="v.stock <= 0"
                [attr.aria-pressed]="v.id === p.id"
                [attr.aria-label]="'Talla ' + v.size + ': ' + sizeStatus(v)"
                (click)="picked.set(v.id)"
              >
                {{ v.size }}
              </button>
            </div>
            <div class="legend" aria-hidden="true">
              <span><i class="dot ok"></i>Disponible</span>
              <span><i class="dot low"></i>Últimas unidades</span>
              <span><i class="dot out"></i>Agotada</span>
            </div>
            <p class="stock" role="status">Talla {{ p.size }}: {{ sizeStatus(p) }}</p>

            <ion-button *ngIf="!isAdmin()" expand="block" class="btn-rockstar" [disabled]="p.stock <= 0" (click)="addToCart(p)">
              <ion-icon slot="start" name="add-outline"></ion-icon>
              {{ p.stock > 0 ? 'Agregar talla ' + p.size + ' al carrito' : 'Talla agotada' }}
            </ion-button>
          </div>
        </div>

        <div class="details">
          <section class="card-rockstar block">
            <h2>Descripción</h2>
            <p class="description" *ngIf="p.description">{{ p.description }}</p>
            <dl>
              <div><dt>Categoría</dt><dd>{{ p.category }}</dd></div>
              <div *ngIf="p.band"><dt>Banda</dt><dd>{{ p.band }}</dd></div>
              <div><dt>Color</dt><dd>{{ p.color }}</dd></div>
              <div><dt>Tipo de estampado</dt><dd>{{ p.printType ?? 'Sin información' }}</dd></div>
              <div><dt>Código</dt><dd class="mono">{{ p.sku }}</dd></div>
            </dl>
          </section>

          <section class="card-rockstar block">
            <h2>Medidas</h2>
            <ng-container *ngIf="guide().length > 0; else noGuide">
              <table class="guide">
                <thead>
                  <tr><th scope="col">Talla</th><th scope="col">Ancho</th><th scope="col">Largo</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let size of guide()" [class.current]="size.talla === p.size">
                    <th scope="row">{{ size.talla }}</th>
                    <td>{{ size.anchoCm === null ? '—' : size.anchoCm + ' cm' }}</td>
                    <td>{{ size.largoCm === null ? '—' : size.largoCm + ' cm' }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="note">
                Medidas de la prenda extendida. El ancho va de lado a lado, a la altura del pecho o de la cintura según la prenda. Pueden variar
                1 o 2 cm.
              </p>
            </ng-container>
            <ng-template #noGuide><p class="note">Aún no hay medidas registradas para esta prenda.</p></ng-template>
          </section>
        </div>
      </div>

      <ng-template #missing>
        <div class="empty">
          <p *ngIf="products.error() as message">{{ message }}</p>
          <p *ngIf="!products.error()">{{ products.loaded() ? 'Este producto ya no está en la tienda.' : 'Cargando el producto…' }}</p>
          <ion-button *ngIf="products.error()" class="btn-rockstar" [disabled]="products.loading()" (click)="products.load()">Reintentar</ion-button>
          <ion-button *ngIf="products.loaded() && !products.error()" class="btn-rockstar" routerLink="/shop">Ver toda la tienda</ion-button>
        </div>
      </ng-template>
    </ion-content>
  `,
  styles: [`
    .crumbs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; font-size: 12px; color: var(--text-faint); }
    .crumbs a { color: var(--text-muted); text-decoration: none; }
    .crumbs a:hover, .crumbs a:focus-visible { color: #fff; text-decoration: underline; }
    .layout { display: grid; gap: 20px; }
    @media (min-width: 900px) { .layout { grid-template-columns: minmax(0, 440px) minmax(0, 1fr); gap: 36px; align-items: start; } }
    .photo { position: relative; border: 1px solid var(--border); border-radius: 20px; overflow: hidden; background: #18181b; }
    .photo img { display: block; width: 100%; aspect-ratio: 4/5; object-fit: cover; }
    .badge-offer {
      position: absolute; top: 14px; right: 14px; padding: 5px 12px; border-radius: 999px;
      background: #fff; color: var(--accent); font-size: 12px; font-weight: 800; text-transform: uppercase;
    }
    .info { min-width: 0; }
    .section-title { font-size: 12px; margin-bottom: 6px; }
    h1 { margin: 0; font-size: 28px; font-weight: 900; text-transform: uppercase; line-height: 1.1; overflow-wrap: anywhere; }
    @media (min-width: 900px) { h1 { font-size: 38px; } }
    .prices { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; }
    .price { font-size: 30px; font-weight: 900; }
    .list-price { font-size: 16px; color: var(--text-faint); }
    .concert { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; font-size: 13px; font-weight: 700; color: #fca5a5; }
    .concert ion-icon { flex: none; font-size: 16px; }
    h2 { margin: 22px 0 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); }
    .colors, .sizes { display: flex; flex-wrap: wrap; gap: 8px; }
    .color {
      padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px;
      background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .color.selected { border-color: #fff; color: #fff; }
    /* Cada talla es un cuadro; el color dice si se puede comprar. */
    .size {
      display: grid; place-items: center; min-width: 52px; height: 52px; padding: 0 10px;
      border: 2px solid #16a34a; border-radius: 10px;
      background: rgba(22, 163, 74, 0.18); color: #86efac;
      font-size: 15px; font-weight: 800; cursor: pointer; transition: transform 0.1s;
    }
    .size.low { border-color: #ca8a04; background: rgba(202, 138, 4, 0.18); color: #fde68a; }
    .size.out { border-color: #3f3f46; background: #18181b; color: #52525b; text-decoration: line-through; cursor: not-allowed; }
    .size:not(.out):hover { transform: translateY(-2px); }
    .size.selected { background: #16a34a; color: #fff; box-shadow: 0 0 0 2px #0a0a0a, 0 0 0 4px #fff; }
    .size.low.selected { background: #ca8a04; }
    .size:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px; font-size: 11px; color: var(--text-faint); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 3px; }
    .dot.ok { background: #16a34a; }
    .dot.low { background: #ca8a04; }
    .dot.out { background: #3f3f46; }
    .stock { margin: 12px 0 0; font-size: 13px; color: var(--text-muted); }
    .btn-rockstar { margin-top: 16px; }
    .details { display: grid; gap: 16px; margin-top: 28px; }
    @media (min-width: 900px) { .details { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
    .block { padding: 20px; }
    .block h2 { margin-top: 0; }
    .description { margin: 0 0 16px; font-size: 14px; line-height: 1.7; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
    dl { margin: 0; }
    dl > div { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-top: 1px solid #27272a; font-size: 13px; }
    dt { color: var(--text-faint); }
    dd { margin: 0; text-align: right; font-weight: 600; overflow-wrap: anywhere; }
    .mono { font-family: monospace; }
    .guide { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    .guide th, .guide td { padding: 9px 10px; border-bottom: 1px solid #27272a; }
    .guide thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
    .guide tbody th { font-weight: 800; }
    .guide tr.current { background: rgba(22, 163, 74, 0.15); }
    .guide tr.current th { color: #86efac; }
    .note { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-faint); }
    .empty { text-align: center; padding: 60px 20px; color: var(--text-faint); }
  `],
})
export class ProductPage {
  products = inject(ProductsService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  isAdmin = inject(AuthService).isAdmin;
  lowStock = LOW_STOCK;

  private readonly params = toSignal(this.route.paramMap);
  private readonly query = toSignal(this.route.queryParamMap);
  private readonly productId = computed(() => Number(this.params()?.get('id')));

  /** Todas las tallas y colores publicados del producto. */
  private readonly variants = computed(() => this.products.variantsOf(this.productId()));
  /** Talla que eligió el visitante en esta página. */
  picked = signal<number | null>(null);

  /**
   * La talla a la vista. Si el visitante no ha elegido, es la de la tarjeta desde la que
   * llegó (`?talla=`), y si esa no tiene unidades, la primera que sí tenga.
   */
  product = computed<Product | null>(() => {
    const variants = this.variants();
    const cameFrom = variants.find((v) => v.size === this.query()?.get('talla') && v.stock > 0);
    return variants.find((v) => v.id === this.picked()) ?? cameFrom ?? variants.find((v) => v.stock > 0) ?? variants[0] ?? null;
  });

  colors = computed(() => [...new Set(this.variants().map((v) => v.color))]);
  /** Las tallas del color a la vista. */
  sizes = computed(() => this.variants().filter((v) => v.color === this.product()?.color));

  /** Medidas de las tallas en que viene este producto. */
  guide = computed(() => {
    const product = this.product();
    const sizes = new Set(this.variants().map((v) => v.size));
    return product ? this.products.sizeGuide(product.category).filter((size) => sizes.has(size.talla)) : [];
  });

  concert = computed(() => this.products.upcomingConcert(this.product()?.band ?? null));

  formatCLP = formatCLP;
  formatDay = formatDay;
  discountPercent = discountPercent;
  usePlaceholder = usePlaceholder;

  constructor() {
    addIcons({ 'add-outline': addOutline, 'calendar-outline': calendarOutline });
    // La disponibilidad cambia con cada venta: el catálogo se pide al entrar.
    void this.products.load();
  }

  sizeStatus(variant: Product): string {
    if (variant.stock <= 0) return 'agotada';
    return variant.stock <= LOW_STOCK ? `últimas ${variant.stock} unidades` : `${variant.stock} unidades disponibles`;
  }

  /** Al cambiar de color queda a la vista una talla de ese color, con unidades si la hay. */
  pickColor(color: string) {
    const ofColor = this.variants().filter((v) => v.color === color);
    this.picked.set((ofColor.find((v) => v.stock > 0) ?? ofColor[0])?.id ?? null);
  }

  addToCart(product: Product) {
    const result = this.cart.add(product);
    this.toast.show(result.ok ? `${product.name} talla ${product.size} agregado al carrito.` : result.reason || 'No se pudo agregar.');
  }
}
