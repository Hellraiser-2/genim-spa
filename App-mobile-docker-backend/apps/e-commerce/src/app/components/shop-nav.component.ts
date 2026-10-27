import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline, closeOutline, musicalNotesOutline, searchOutline } from 'ionicons/icons';
import { MAX_QUERY_LENGTH, cleanQuery } from '../data/search';
import { ProductsService } from '../services/products.service';

/** Ancho con que se calcula dónde cabe el menú desplegable; coincide con su `width` en los estilos. */
const MENU_WIDTH = 240;
const MARGIN = 8;

/**
 * Barra de navegación de la tienda. Va dentro del encabezado fijo, así que acompaña al
 * bajar por la página. Cada categoría despliega hacia abajo su menú: ver todo, sus
 * bandas (si las tiene) y sus tallas. Las categorías salen del catálogo. Incluye el
 * buscador de productos; cómo se cuida ese texto está en `data/search.ts`.
 */
@Component({
  selector: 'app-shop-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, IonIcon],
  template: `
    <nav class="shop-nav" aria-label="Categorías de la tienda" (mouseleave)="onLeave()">
     <div class="bar">
      <div class="nav-row" (scroll)="close()">
        <a class="nav-item" routerLink="/shop" [class.active]="showingAll()" (mouseenter)="onLeave()">Todo</a>
        <button
          *ngFor="let c of products.menu()"
          type="button"
          class="nav-item"
          [class.active]="activeCategory() === c.name"
          [class.open]="open() === c.name"
          aria-haspopup="true"
          [attr.aria-expanded]="open() === c.name"
          (click)="toggle(c.name, $event)"
          (mouseenter)="onEnter(c.name, $event)"
        >
          {{ c.name }}
          <ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon>
        </button>
      </div>

      <!-- En pantallas angostas el buscador se despliega con este botón; en las anchas está siempre a la vista. -->
      <button
        type="button"
        class="search-toggle"
        [class.on]="searchShown()"
        aria-label="Buscar productos"
        [attr.aria-expanded]="searchShown()"
        (click)="toggleSearch()"
      >
        <ion-icon name="search-outline" aria-hidden="true"></ion-icon>
      </button>

      <form class="search" role="search" [class.shown]="searchShown()" (submit)="submitSearch($event)" (mouseenter)="onLeave()">
        <ion-icon name="search-outline" aria-hidden="true"></ion-icon>
        <!-- El texto se enlaza con [value] y se muestra con interpolación: Angular lo escapa, nunca se inserta como HTML. -->
        <input
          #box
          type="search"
          name="q"
          placeholder="Buscar productos"
          aria-label="Buscar productos"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
          [attr.maxlength]="maxLength"
          [value]="text()"
          (input)="onSearchInput(box.value)"
        />
        <button type="button" class="search-clear" *ngIf="text() !== ''" aria-label="Borrar la búsqueda" (click)="clearSearch(box)">
          <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
        </button>
      </form>
     </div>

      <div class="menu" *ngIf="openMenu() as m" [style.left.px]="left()" [style.top.px]="top()" role="menu" [attr.aria-label]="m.name">
        <a role="menuitem" class="menu-link" routerLink="/shop" [queryParams]="{ categoria: m.name }">Ver todo en {{ m.name }}</a>
        <a role="menuitem" class="menu-link bands" *ngIf="m.bands.length > 0" routerLink="/bandas" [queryParams]="{ categoria: m.name }">
          <ion-icon name="musical-notes-outline" aria-hidden="true"></ion-icon>
          Bandas
        </a>
        <div class="menu-label">Tallas</div>
        <div class="sizes">
          <a
            role="menuitem"
            class="size"
            *ngFor="let size of m.sizes"
            routerLink="/shop"
            [queryParams]="{ categoria: m.name, talla: size }"
            [attr.aria-label]="'Talla ' + size"
          >
            {{ size }}
          </a>
        </div>
      </div>
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .shop-nav { position: relative; background: #0c0c0c; border-top: 1px solid #18181b; border-bottom: 1px solid var(--border); }
    .bar { display: flex; flex-wrap: wrap; align-items: center; }
    .search-toggle {
      flex: none; display: grid; place-items: center; width: 40px; height: 40px; margin-right: 4px;
      background: transparent; border: none; border-radius: 10px;
      color: var(--text-muted); font-size: 18px; cursor: pointer;
    }
    .search-toggle.on { color: #fff; background: #18181b; }
    .search {
      display: none; flex: 1 0 calc(100% - 16px); align-items: center; gap: 8px;
      margin: 0 8px 8px; padding: 0 10px; height: 38px; box-sizing: border-box;
      background: #18181b; border: 1px solid var(--border); border-radius: 10px;
    }
    .search.shown { display: flex; }
    .search:focus-within { border-color: var(--accent); }
    .search > ion-icon { flex: none; color: var(--text-faint); font-size: 16px; }
    .search input {
      flex: 1; min-width: 0; height: 100%; padding: 0;
      background: transparent; border: none; outline: none;
      color: var(--text); font: inherit; font-size: 14px;
    }
    .search input::placeholder { color: var(--text-faint); }
    .search input::-webkit-search-cancel-button { display: none; }
    .search-clear {
      flex: none; display: grid; place-items: center; width: 24px; height: 24px;
      background: transparent; border: none; border-radius: 6px;
      color: var(--text-muted); font-size: 16px; cursor: pointer;
    }
    .search-clear:hover { color: #fff; }
    @media (min-width: 768px) {
      .search-toggle { display: none; }
      .search { display: flex; flex: 0 0 280px; margin: 0 12px 0 8px; }
    }
    .nav-row {
      flex: 1 1 0; min-width: 0;
      display: flex; gap: 4px; padding: 0 8px;
      overflow-x: auto; scrollbar-width: none;
    }
    .nav-row::-webkit-scrollbar { display: none; }
    .nav-item {
      flex: none;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 12px 12px;
      background: transparent; border: none; border-bottom: 2px solid transparent;
      color: var(--text-muted); font: inherit; font-size: 13px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none;
      cursor: pointer; white-space: nowrap;
    }
    .nav-item ion-icon { font-size: 12px; transition: transform 0.2s; }
    .nav-item:hover, .nav-item.open { color: #fff; }
    .nav-item.open ion-icon { transform: rotate(180deg); }
    .nav-item.active { color: #fff; border-bottom-color: var(--accent); }
    .nav-item:focus-visible, .menu a:focus-visible { outline: 2px solid var(--accent-hover); outline-offset: -2px; }
    .menu {
      position: absolute; top: 100%; z-index: 20;
      width: 240px; padding: 8px;
      background: #0c0c0c; border: 1px solid var(--border); border-top: 2px solid var(--accent);
      border-radius: 0 0 12px 12px;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
    }
    .menu-link {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-radius: 8px;
      color: var(--text); font-size: 14px; font-weight: 600; text-decoration: none;
    }
    .menu-link:hover { background: #18181b; }
    .menu-link.bands ion-icon { color: var(--accent-hover); font-size: 16px; }
    .menu-label {
      margin: 8px 12px 6px; padding-top: 8px; border-top: 1px solid #18181b;
      color: var(--text-faint); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    }
    .sizes { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 6px; }
    .size {
      min-width: 38px; padding: 6px 8px; text-align: center;
      border: 1px solid var(--border); border-radius: 8px;
      color: var(--text-muted); font-size: 12px; font-weight: 700; text-decoration: none;
    }
    .size:hover { border-color: var(--accent); color: #fff; }
  `],
})
export class ShopNavComponent {
  products = inject(ProductsService);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  /** Con mouse, el menú se abre al pasar por encima; en pantallas táctiles, al tocar. */
  private readonly hovers = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

  /** Categoría cuyo menú está desplegado. */
  open = signal<string | null>(null);
  /** Posición del menú: bajo el botón de su categoría. */
  left = signal(MARGIN);
  top = signal(0);

  /** Lo escrito en el buscador, tal como está en el campo. A la dirección va ya limpio. */
  text = signal(cleanQuery(this.router.parseUrl(this.router.url).queryParams['q']));
  /** En pantallas angostas el buscador se despliega con su botón. */
  private readonly searchOpen = signal(false);
  searchShown = computed(() => this.searchOpen() || this.text() !== '');
  maxLength = MAX_QUERY_LENGTH;

  @ViewChild('box') private box?: ElementRef<HTMLInputElement>;
  private searchTimer?: ReturnType<typeof setTimeout>;

  openMenu = computed(() => this.products.menu().find((c) => c.name === this.open()) ?? null);
  activeCategory = computed(() => (this.onShopPages() ? (this.params()?.get('categoria') ?? null) : null));
  showingAll = computed(() => this.path() === '/shop' && this.params()?.keys.length === 0);

  private readonly path = signal(this.router.url.split('?')[0]);
  private readonly onShopPages = computed(() => this.path() === '/shop' || this.path() === '/bandas');

  constructor() {
    addIcons({
      'chevron-down-outline': chevronDownOutline,
      'musical-notes-outline': musicalNotesOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
    });
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        // Elegir una opción navega: el menú se cierra y la barra marca la categoría nueva.
        this.close();
        this.path.set(event.url.split('?')[0]);
      } else if (event instanceof NavigationEnd && document.activeElement !== this.box?.nativeElement) {
        // El campo sigue a la dirección (un enlace con búsqueda, "Quitar filtros"), salvo mientras se escribe en él.
        this.text.set(cleanQuery(this.router.parseUrl(event.urlAfterRedirects).queryParams['q']));
      }
    });
    // La barra se ve en todas las pantallas de la tienda, también al llegar directo a una sin catálogo cargado.
    if (!this.products.loaded() && !this.products.loading()) {
      void this.products.load();
    }
  }

  toggle(category: string, event: Event) {
    // Con mouse el menú ya se abrió al pasar por encima: el clic no debe cerrarlo.
    if (this.open() === category && !this.hovers) {
      this.close();
    } else {
      this.show(category, event.currentTarget as HTMLElement);
    }
  }

  onEnter(category: string, event: Event) {
    if (this.hovers) {
      this.show(category, event.currentTarget as HTMLElement);
    }
  }

  onLeave() {
    if (this.hovers) {
      this.close();
    }
  }

  close() {
    this.open.set(null);
  }

  private show(category: string, button: HTMLElement) {
    const nav = this.host.nativeElement.getBoundingClientRect();
    const place = button.getBoundingClientRect();
    // El menú queda bajo su botón, sin salirse de la pantalla.
    this.left.set(Math.max(MARGIN, Math.min(place.left - nav.left, nav.width - MENU_WIDTH - MARGIN)));
    this.top.set(place.bottom - nav.top);
    this.open.set(category);
  }

  // --- Búsqueda ---

  toggleSearch() {
    const opening = !this.searchShown();
    this.searchOpen.set(opening);
    if (opening) {
      // El campo aparece con el cambio: se enfoca cuando ya está en pantalla.
      setTimeout(() => this.box?.nativeElement.focus(), 50);
    } else {
      this.text.set('');
      this.search('', 0);
    }
  }

  /** Busca mientras se escribe, con una pausa breve para no navegar en cada tecla. */
  onSearchInput(value: string) {
    this.text.set(value);
    this.search(value, 250);
  }

  submitSearch(event: Event) {
    event.preventDefault();
    this.search(this.text(), 0);
    // En un teléfono, quitar el foco esconde el teclado y deja ver los resultados.
    this.box?.nativeElement.blur();
  }

  clearSearch(box: HTMLInputElement) {
    this.text.set('');
    this.search('', 0);
    box.focus();
  }

  private search(value: string, delayMs: number) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(cleanQuery(value)), delayMs);
  }

  /**
   * Lleva la búsqueda a la dirección de la tienda (`/shop?q=...`), junto a la categoría,
   * banda o talla ya elegidas. El enrutador codifica el texto: no se arma la dirección a mano.
   */
  private applySearch(query: string) {
    const onShop = this.path() === '/shop';
    if (!onShop && query === '') {
      return;
    }
    void this.router.navigate(['/shop'], {
      queryParams: { q: query === '' ? null : query },
      queryParamsHandling: onShop ? 'merge' : null,
      // Cada letra no debe dejar una entrada en el historial del navegador.
      replaceUrl: onShop,
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.open() !== null && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }
}
