import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon, IonGrid, IonRow, IonCol, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, bodyOutline } from 'ionicons/icons';
import { ProductsService } from '../../services/products.service';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';
import { OffersCarouselComponent } from '../../components/offers-carousel.component';
import { Product, discountPercent, formatCLP, formatDay, usePlaceholder } from '../../data/models';
import { cleanQuery, matchesQuery } from '../../data/search';
import { tipoDePrenda } from '../../data/probador';
import { ProbadorComponent, PruebaDePrenda } from '../../components/probador.component';

/** Productos que la portada muestra de cada categoría; el resto se ve entrando a ella. */
const PRODUCTS_PER_CATEGORY = 4;

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon, IonGrid, IonRow, IonCol, OffersCarouselComponent],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <!-- Hero: solo en la portada, sin filtros -->
      <div class="hero" [class.with-tour]="products.tourShirts().length > 0" *ngIf="!hasFilters()">
        <div class="hero-glow"></div>
        <div class="hero-content">
          <div class="section-title">Nueva colección · 2026</div>
          <h1 class="hero-title">Viste el <span class="text-accent">ruido.</span></h1>
          <p class="hero-subtitle">
            Poleras, chaquetas y polerones para quienes prefieren guitarras
            pesadas, amplificadores al máximo y cero compromisos.
          </p>
        </div>

        <!-- Poleras de las bandas con concierto en Chile dentro de los próximos doce meses -->
        <div class="tour" *ngIf="products.tourShirts().length > 0">
          <div class="tour-title">Vienen a Chile · llega al concierto con su polera</div>
          <div class="tour-strip">
            <a class="tour-card" *ngFor="let s of products.tourShirts()" [routerLink]="['/producto', s.productId]">
              <img [src]="s.image" [alt]="s.name" loading="lazy" (error)="usePlaceholder($event)" />
              <div class="tour-info">
                <div class="tour-band">{{ s.band }}</div>
                <div class="tour-name">{{ s.name }}</div>
                <div class="tour-date">{{ formatDay(s.date) }}{{ s.place ? ' · ' + s.place : '' }}</div>
                <div class="tour-price">{{ formatCLP(s.price) }}</div>
              </div>
            </a>
          </div>
        </div>
      </div>

      <!-- Ofertas del mes: también solo en la portada, y solo si este mes hay alguna -->
      <app-offers-carousel *ngIf="!hasFilters() && products.offers().length > 0" [offers]="products.offers()"></app-offers-carousel>

      <!-- Lo elegido en la barra de navegación -->
      <div class="selection" *ngIf="hasFilters()">
        <div class="selection-text">
          <div class="section-title">{{ category() ?? 'Toda la tienda' }}</div>
          <h1>{{ title() }}</h1>
          <!-- Lo buscado se muestra con interpolación: Angular lo escapa y se ve como texto, sea lo que sea. -->
          <p class="searching" *ngIf="query()">
            Buscando <q>{{ query() }}</q> · {{ filtered().length }} {{ filtered().length === 1 ? 'resultado' : 'resultados' }}
          </p>
        </div>
        <a class="clear" routerLink="/shop">Quitar filtros</a>
      </div>

      <!-- Portada: una sección por categoría, con unos pocos productos y el enlace a todos -->
      <ng-container *ngIf="!hasFilters()">
        <section class="category" *ngFor="let section of sections()">
          <div class="category-head">
            <h2>{{ section.name }}</h2>
            <a class="clear" routerLink="/shop" [queryParams]="{ categoria: section.name }">Ver todos ({{ section.total }})</a>
          </div>
          <ion-grid class="products-grid">
            <ion-row>
              <ion-col size="6" size-md="3" *ngFor="let p of section.products">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: p }"></ng-container>
              </ion-col>
            </ion-row>
          </ion-grid>
        </section>
      </ng-container>

      <!-- Con una categoría, banda, talla o búsqueda: todo lo que calza -->
      <ion-grid class="products-grid" *ngIf="hasFilters()">
        <ion-row>
          <ion-col size="6" size-md="4" size-lg="3" *ngFor="let p of filtered()">
            <ng-container *ngTemplateOutlet="card; context: { $implicit: p }"></ng-container>
          </ion-col>
        </ion-row>
      </ion-grid>

      <ng-template #card let-p>
            <div class="product-card" [class.is-anime]="p.category === 'Anime'">
              <!-- El botón Probar va fuera del enlace: un botón no puede ir dentro de un enlace. -->
              <div class="product-img-wrap">
                <a class="product-img-link" [routerLink]="['/producto', p.productId]" [queryParams]="{ talla: p.size }" [attr.aria-label]="'Ver ' + p.name">
                  <img [src]="p.image" [alt]="p.name" class="product-card-img" loading="lazy" (error)="usePlaceholder($event)" />
                  <div class="badge" [class.badge-anime]="p.category === 'Anime'" [class.badge-rock]="p.category !== 'Anime'">
                    {{ p.category }}
                  </div>
                  <div class="badge badge-low-stock" *ngIf="p.stock <= 3">Últimas unidades</div>
                  <div class="badge badge-offer" *ngIf="p.listPrice">Oferta -{{ discountPercent(p.price, p.listPrice) }}%</div>
                </a>
                <button
                  *ngIf="!isAdmin() && sePuedeProbar(p)"
                  type="button"
                  class="probar"
                  [attr.aria-label]="'Probar ' + p.name + ' en el maniquí 3D'"
                  (click)="probar(p)"
                >
                  <ion-icon name="body-outline"></ion-icon><span>Probar</span>
                </button>
              </div>
              <div class="product-body">
                <h3><a [routerLink]="['/producto', p.productId]" [queryParams]="{ talla: p.size }">{{ p.name }}</a></h3>
                <div class="detail">{{ p.band ? p.band + ' · ' : '' }}{{ p.color }}</div>
                <div class="row-between">
                  <span class="price">
                    {{ formatCLP(p.price) }}
                    <s class="list-price" *ngIf="p.listPrice">{{ formatCLP(p.listPrice) }}</s>
                  </span>
                  <span class="size">Talla {{ p.size }}</span>
                </div>
                <div class="stock">{{ p.stock > 0 ? 'Stock disponible: ' + p.stock : 'Agotado' }}</div>
                <ion-button
                  *ngIf="!isAdmin()"
                  expand="block"
                  [disabled]="p.stock <= 0"
                  class="add-btn"
                  [class.anime]="p.category === 'Anime'"
                  (click)="addToCart(p)"
                >
                  <ion-icon slot="start" name="add-outline"></ion-icon>
                  Agregar
                </ion-button>
              </div>
            </div>
      </ng-template>

      <div class="empty" *ngIf="products.error() as message">
        <p>{{ message }}</p>
        <ion-button class="btn-rockstar" [disabled]="products.loading()" (click)="products.load()">Reintentar</ion-button>
      </div>
      <div class="empty" *ngIf="!products.error() && filtered().length === 0">
        <p>{{ products.loaded() ? 'No se encontraron productos.' : 'Cargando la tienda…' }}</p>
      </div>    </ion-content>
  `,
  styles: [`
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: linear-gradient(135deg, #0c0c0c, #1a0a0d, #000);
      padding: 28px 24px;
      margin: 16px;
    }
    .hero-glow {
      position: absolute;
      right: -80px;
      top: -100px;
      width: 300px;
      height: 300px;
      background: rgba(185, 28, 28, 0.2);
      border-radius: 50%;
      filter: blur(60px);
    }
    .hero-content { position: relative; max-width: 600px; }
    .hero-title {
      margin: 0;
      font-size: 36px;
      font-weight: 900;
      text-transform: uppercase;
      line-height: 1;
    }
    @media (min-width: 640px) { .hero-title { font-size: 56px; } }
    .hero-subtitle {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-muted);
      max-width: 540px;
    }
    .tour { position: relative; min-width: 0; margin-top: 20px; }
    .tour-title {
      margin-bottom: 10px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;
      color: var(--text-muted);
    }
    .tour-strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
    .tour-card {
      flex: 0 0 132px;
      display: flex; flex-direction: column;
      background: rgba(9, 9, 11, 0.6); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
      color: inherit; text-decoration: none; transition: border-color 0.2s;
    }
    .tour-card:hover, .tour-card:focus-visible { border-color: var(--accent); outline: none; }
    .tour-card img { width: 100%; aspect-ratio: 1; object-fit: cover; background: #18181b; }
    .tour-info { padding: 8px 10px 10px; }
    .tour-band { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
    .tour-name { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tour-date { margin-top: 4px; font-size: 10px; font-weight: 700; line-height: 1.3; color: #fca5a5; }
    .tour-price { margin-top: 4px; font-size: 13px; font-weight: 900; }
    @media (min-width: 900px) {
      /* Con espacio a lo ancho, las poleras van al lado del texto del cartel. */
      .hero.with-tour { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 32px; align-items: center; }
      .hero.with-tour .tour { margin-top: 0; }
      .tour-card { flex-basis: 150px; }
    }
    .filters {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .selection {
      display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;
      padding: 20px 16px 4px;
    }
    .selection-text { min-width: 0; }
    .selection h1 { margin: 0; font-size: 26px; font-weight: 900; text-transform: uppercase; line-height: 1.1; }
    .searching { margin: 6px 0 0; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
    .searching q { color: var(--text); }
    .selection .section-title { margin-bottom: 4px; font-size: 11px; }
    .clear {
      flex: none; padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px;
      color: var(--text-muted); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap;
    }
    .clear:hover { border-color: var(--accent); color: #fff; }
    .products-grid { padding: 16px; }
    .category-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 24px 16px 0; }
    .category-head h2 { margin: 0; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
    .category .products-grid { padding-top: 8px; padding-bottom: 0; }
    .category:last-of-type { padding-bottom: 16px; }
    .product-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 0.2s;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .product-card.is-anime {
      border-color: rgba(147, 51, 234, 0.5);
      background: linear-gradient(180deg, #0c0c0c, #1a0a1f, #000);
    }
    .product-card:hover { border-color: var(--accent); }
    .product-img-wrap {
      display: block;
      position: relative;
      aspect-ratio: 4/5;
      background: #18181b;
      overflow: hidden;
    }
    .badge {
      position: absolute;
      top: 10px;
      left: 10px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 8px;
      border-radius: 999px;
    }
    .probar {
      position: absolute; top: 8px; right: 8px;
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.65); color: #fff; font-size: 11px; font-weight: 700; cursor: pointer;
      backdrop-filter: blur(4px);
    }
    .probar:hover { background: var(--accent); border-color: var(--accent); }
    .probar ion-icon { font-size: 14px; }
    @media (max-width: 600px) { .probar { padding: 6px; } .probar span { display: none; } }
    .badge-low-stock {
      bottom: 10px;
      left: 10px;
      top: auto;
      background: var(--accent);
      color: #fff;
    }
    .product-img-link { display: block; width: 100%; height: 100%; }
    /* Abajo a la derecha: arriba a la derecha va el botón Probar. */
    .badge-offer {
      left: auto;
      right: 10px;
      top: auto;
      bottom: 10px;
      background: #fff;
      color: var(--accent);
    }
    .list-price { display: block; font-size: 11px; font-weight: 400; color: var(--text-faint); }
    .product-body { padding: 12px; display: flex; flex-direction: column; flex: 1; }
    .product-body h3 a { color: inherit; text-decoration: none; }
    .product-body h3 a:hover, .product-body h3 a:focus-visible { color: var(--accent-hover); }
    .product-body h3 {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.3;
      min-height: 36px;
      margin: 0 0 8px;
    }
    .row-between { display: flex; justify-content: space-between; align-items: center; }
    .price { font-size: 16px; font-weight: 900; }
    .size { flex: none; font-size: 10px; color: var(--text-faint); background: #18181b; padding: 2px 6px; border-radius: 4px; }
    .stock { font-size: 11px; color: var(--text-faint); margin: 4px 0 8px; }
    .detail { font-size: 11px; color: var(--text-faint); margin: -4px 0 8px; }
    .add-btn {
      --background: #18181b;
      --color: var(--text-muted);
      --border-radius: 12px;
      --border: 1px solid var(--border);
      --padding-top: 8px;
      --padding-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: none;
      margin-top: auto;
    }
    .add-btn:hover, .add-btn.anime {
      --background: var(--accent);
      --color: #fff;
      --border-color: var(--accent);
    }
    .empty { text-align: center; padding: 40px; color: var(--text-faint); }
  `],
})
export class ShopPage {
  products = inject(ProductsService);
  cart = inject(CartService);
  toast = inject(ToastService);
  router = inject(Router);

  auth = inject(AuthService);

  isAdmin = this.auth.isAdmin;

  /** Lo elegido en la barra de navegación llega en la dirección: `?categoria=Poleras&banda=Misfits&talla=M`. */
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  category = computed(() => this.params()?.get('categoria') || null);
  band = computed(() => this.params()?.get('banda') || null);
  size = computed(() => this.params()?.get('talla') || null);
  /**
   * Lo buscado en la barra (`?q=`). La dirección la puede escribir cualquiera, así que el
   * texto se limpia y se acorta aquí también, no solo en el campo.
   */
  query = computed(() => cleanQuery(this.params()?.get('q')));
  hasFilters = computed(() => this.category() !== null || this.band() !== null || this.size() !== null || this.query() !== '');

  /** Título de la selección: la banda si se eligió una, si no la categoría, con la talla al final. */
  title = computed(() => {
    const main = this.band() ?? this.category() ?? (this.query() ? 'Búsqueda' : 'Prendas');
    return this.size() ? `${main} · Talla ${this.size()}` : main;
  });

  filtered = computed(() => {
    const category = this.category();
    const band = this.band();
    const size = this.size();
    const query = this.query();
    return this.products.products().filter(
      (p) =>
        (category === null || p.category === category) &&
        (band === null || p.band === band) &&
        (size === null || p.size === size) &&
        matchesQuery(p, query),
    );
  });

  private readonly modales = inject(ModalController);

  sePuedeProbar(p: Product): boolean {
    return tipoDePrenda(p.category) !== null;
  }

  /**
   * Abre el probador 3D sobre toda la app (un modal dentro de la página quedaría bajo la barra
   * de pestañas), con las tallas del mismo producto en el mismo color.
   */
  async probar(p: Product): Promise<void> {
    const prueba: PruebaDePrenda = {
      producto: p,
      variantes: this.products.products().filter((v) => v.productId === p.productId && v.color === p.color),
    };
    const modal = await this.modales.create({ component: ProbadorComponent, componentProps: { prueba }, cssClass: 'modal-probador' });
    await modal.present();
  }
  /**
   * La portada: cada categoría con sus primeros productos. Un producto aparece una sola
   * vez, con una talla que tenga unidades, y los agotados van al final.
   */
  sections = computed(() =>
    this.products.categories().map((name) => {
      const shown = new Map<number, Product>();
      for (const product of this.products.products()) {
        const current = shown.get(product.productId);
        if (product.category === name && (!current || (current.stock <= 0 && product.stock > 0))) {
          shown.set(product.productId, product);
        }
      }
      const all = [...shown.values()];
      const available = all.filter((p) => p.stock > 0);
      const soldOut = all.filter((p) => p.stock <= 0);
      return { name, total: all.length, products: [...available, ...soldOut].slice(0, PRODUCTS_PER_CATEGORY) };
    }),
  );

  constructor() {
    addIcons({ 'add-outline': addOutline, 'body-outline': bodyOutline });
    // La disponibilidad cambia con cada venta: el catálogo se pide cada vez que se entra a la tienda.
    void this.products.load();
  }

  formatCLP = formatCLP;
  discountPercent = discountPercent;
  formatDay = formatDay;
  usePlaceholder = usePlaceholder;

  addToCart(p: Product) {
    const result = this.cart.add(p);
    if (result.ok) this.toast.show('Producto agregado al carrito.');
    else this.toast.show(result.reason || 'No se pudo agregar.');
  }
}
