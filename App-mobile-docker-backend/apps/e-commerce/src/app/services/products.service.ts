import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { ArticuloCatalogo, BandaCatalogo, ConciertoBanda, GuiaDeTallas, MedidaDeTalla } from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL, errorMessage } from '../core/api';
import { Product, compareSizes, discountPercent, isWithinNextYear, toProduct } from '../data/models';

export interface CartItem extends Product {
  qty: number;
}

/** Lo que ofrece el menú de una categoría en la barra de navegación. */
export interface CategoryMenu {
  name: string;
  /** Tallas en que hay prendas publicadas de la categoría. */
  sizes: string[];
  /** Bandas con prendas en la categoría; vacío en las categorías sin bandas. */
  bands: string[];
}

/** Banda con lo necesario para mostrarla como tarjeta. */
export interface BandCard {
  name: string;
  /** Foto de la banda; si aún no tiene, la de una de sus prendas. */
  image: string;
  /** Autor y licencia de la foto de la banda, para mostrarlos junto a ella. */
  credit: string | null;
  /** Cantidad de productos distintos de la banda. */
  products: number;
  categories: string[];
  /** Próximo concierto en Chile tal como está registrado; puede ser una fecha ya pasada. */
  concert: ConciertoBanda | null;
  /** El concierto es dentro de los próximos doce meses. */
  upcoming: boolean;
}

/** Polera de una banda que viene a Chile, para el cartel de la portada. */
export interface TourShirt {
  productId: number;
  name: string;
  band: string;
  category: string;
  image: string;
  price: number;
  /** Día del concierto, `AAAA-MM-DD`. */
  date: string;
  place: string | null;
}

/** Categoría cuyas prendas destaca el cartel de la portada. */
const SHIRTS_CATEGORY = 'Poleras';

/** Producto en oferta este mes, con lo necesario para mostrarlo en el carrusel de la portada. */
export interface Offer {
  productId: number;
  name: string;
  band: string | null;
  category: string;
  image: string;
  /** Precio de oferta, que es el que se cobra. */
  price: number;
  /** Precio normal del producto. */
  listPrice: number;
  /** Porcentaje de rebaja. */
  discount: number;
  /** Tallas con unidades para comprar. */
  sizes: string[];
}

const byName = (a: string, b: string) => a.localeCompare(b, 'es');

/** Catálogo de la tienda: las prendas con precio que publica el backend, con su disponibilidad. */
@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  private readonly productsSig = signal<Product[]>([]);
  readonly products = this.productsSig.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Falso hasta que el catálogo se cargó al menos una vez. */
  readonly loaded = signal(false);
  /** Lo que el backend guarda de cada banda (foto y próximo concierto), por nombre de banda. */
  private readonly bandInfo = signal(new Map<string, BandaCatalogo>());

  /** Guía de tallas de cada categoría: cuánto mide cada talla, por nombre de categoría. */
  private readonly sizeGuides = signal(new Map<string, MedidaDeTalla[]>());

  /** Categorías que tienen al menos una prenda publicada, en orden alfabético. */
  readonly categories = computed(() => [...new Set(this.productsSig().map((p) => p.category))].sort(byName));

  /** El menú de la tienda sale del catálogo: cada categoría con sus tallas y sus bandas. */
  readonly menu = computed<CategoryMenu[]>(() =>
    this.categories().map((name) => {
      const items = this.productsSig().filter((p) => p.category === name);
      return {
        name,
        sizes: [...new Set(items.map((p) => p.size))].sort(compareSizes),
        bands: [...new Set(items.flatMap((p) => (p.band ? [p.band] : [])))].sort(byName),
      };
    }),
  );

  /**
   * Las ofertas del mes: un producto por oferta, con las tallas que aún se pueden comprar.
   * Las agotadas no se anuncian. Primero las de mayor rebaja.
   */
  readonly offers = computed<Offer[]>(() => {
    const offers = new Map<number, Offer>();
    for (const product of this.productsSig()) {
      if (product.listPrice === null || product.stock <= 0) {
        continue;
      }
      const offer = offers.get(product.productId) ?? {
        productId: product.productId,
        name: product.name,
        band: product.band,
        category: product.category,
        image: product.image,
        price: product.price,
        listPrice: product.listPrice,
        discount: discountPercent(product.price, product.listPrice),
        sizes: [],
      };
      if (!offer.sizes.includes(product.size)) {
        offer.sizes.push(product.size);
      }
      offers.set(product.productId, offer);
    }
    return [...offers.values()]
      .map((offer) => ({ ...offer, sizes: [...offer.sizes].sort(compareSizes) }))
      .sort((a, b) => b.discount - a.discount || byName(a.name, b.name));
  });

  /**
   * Poleras de las bandas con concierto en Chile dentro de los próximos doce meses: una
   * por producto con unidades para comprar, del concierto más próximo al más lejano.
   */
  readonly tourShirts = computed<TourShirt[]>(() => {
    const bands = this.bandInfo();
    const shirts = new Map<number, TourShirt>();
    for (const product of this.productsSig()) {
      const concert = product.band ? bands.get(product.band)?.concierto : null;
      if (!concert || !isWithinNextYear(concert.fecha) || product.category !== SHIRTS_CATEGORY || product.stock <= 0 || shirts.has(product.productId)) {
        continue;
      }
      shirts.set(product.productId, {
        productId: product.productId,
        name: product.name,
        band: product.band!,
        category: product.category,
        image: product.image,
        price: product.price,
        date: concert.fecha,
        place: concert.lugar,
      });
    }
    return [...shirts.values()].sort((a, b) => a.date.localeCompare(b.date) || byName(a.name, b.name));
  });

  /** Bandas con prendas publicadas, en orden alfabético. `category` las limita a las de esa categoría. */
  bands(category: string | null): BandCard[] {
    const cards = new Map<string, { image: string; products: Set<number>; categories: Set<string> }>();
    for (const product of this.productsSig()) {
      if (!product.band || (category !== null && product.category !== category)) {
        continue;
      }
      const card = cards.get(product.band) ?? { image: product.image, products: new Set(), categories: new Set() };
      card.products.add(product.productId);
      card.categories.add(product.category);
      cards.set(product.band, card);
    }
    const bands = this.bandInfo();
    return [...cards]
      .map(([name, card]) => {
        const info = bands.get(name);
        const concert = info?.concierto ?? null;
        return {
          name,
          image: info?.imagenUrl ?? card.image,
          credit: info?.credito ?? null,
          products: card.products.size,
          categories: [...card.categories].sort(byName),
          concert,
          upcoming: concert !== null && isWithinNextYear(concert.fecha),
        };
      })
      .sort((a, b) => byName(a.name, b.name));
  }

  /** Las tallas y colores de un producto que están publicadas, de la talla menor a la mayor. */
  variantsOf(productId: number): Product[] {
    return this.productsSig()
      .filter((p) => p.productId === productId)
      .sort((a, b) => compareSizes(a.size, b.size) || byName(a.color, b.color));
  }

  /** Las medidas registradas de las tallas de una categoría; vacío si no hay ninguna. */
  sizeGuide(category: string): MedidaDeTalla[] {
    return (this.sizeGuides().get(category) ?? []).filter((size) => size.anchoCm !== null || size.largoCm !== null);
  }

  /** Próximo concierto de la banda en Chile, si es dentro de los próximos doce meses. */
  upcomingConcert(band: string | null): ConciertoBanda | null {
    const concert = band ? (this.bandInfo().get(band)?.concierto ?? null) : null;
    return concert && isWithinNextYear(concert.fecha) ? concert : null;
  }

  /** Trae la guía de tallas. Si falla, las páginas de producto se muestran sin medidas. */
  private async loadSizeGuides(): Promise<void> {
    try {
      const guias = await firstValueFrom(this.http.get<GuiaDeTallas[]>(`${API_URL}/inventario/catalogo/guias-tallas`));
      this.sizeGuides.set(new Map(guias.map((g) => [g.categoria, g.tallas])));
    } catch {
      // Sin la guía de tallas la tienda funciona igual.
    }
  }

  /**
   * Trae las fotos y los conciertos de las bandas. Si falla, las bandas se muestran con la
   * foto de una de sus prendas y la portada no destaca poleras.
   */
  private async loadBands(): Promise<void> {
    try {
      const bandas = await firstValueFrom(this.http.get<BandaCatalogo[]>(`${API_URL}/inventario/catalogo/bandas`));
      this.bandInfo.set(new Map(bandas.map((b) => [b.nombre, b])));
    } catch {
      // Sin los datos de las bandas la tienda funciona igual.
    }
  }

  /** Trae el catálogo actual. La disponibilidad cambia con cada venta, así que se pide al entrar a cada pantalla. */
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [catalogo] = await Promise.all([
        firstValueFrom(this.http.get<ArticuloCatalogo[]>(`${API_URL}/inventario/catalogo`)),
        this.loadBands(),
        this.loadSizeGuides(),
      ]);
      this.productsSig.set(catalogo.map(toProduct));
      this.loaded.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
