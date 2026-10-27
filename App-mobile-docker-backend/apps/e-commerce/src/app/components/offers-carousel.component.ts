import { Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { currentMonthName, formatCLP, usePlaceholder } from '../data/models';
import { Offer } from '../services/products.service';

/** Tiempo que cada oferta queda a la vista antes de pasar sola a la siguiente. */
const AUTOPLAY_MS = 6000;

/**
 * Carrusel de las ofertas del mes, una por diapositiva. Avanza solo, y también con las
 * flechas, los puntos o deslizando con el dedo: las diapositivas son un desplazamiento
 * horizontal del navegador que se detiene en cada una, sin librerías. Se queda quieto
 * mientras el visitante lo mira de cerca (puntero encima o foco dentro) y cuando el
 * sistema pide menos movimiento.
 */
@Component({
  selector: 'app-offers-carousel',
  standalone: true,
  imports: [CommonModule, RouterLink, IonIcon],
  template: `
    <section
      class="offers"
      aria-roledescription="carrusel"
      [attr.aria-label]="'Ofertas de ' + month"
      (pointerenter)="paused = true"
      (pointerleave)="paused = false"
      (focusin)="paused = true"
      (focusout)="paused = false"
    >
      <div class="track" #track (scroll)="onScroll()">
        <article
          class="slide"
          *ngFor="let offer of offers(); let i = index"
          role="group"
          aria-roledescription="diapositiva"
          [attr.aria-label]="i + 1 + ' de ' + offers().length"
        >
          <div class="slide-text">
            <div class="section-title">Ofertas de {{ month }}</div>
            <h2>{{ offer.name }}</h2>
            <p class="detail">{{ offer.band ? offer.band + ' · ' : '' }}{{ offer.category }}</p>
            <div class="prices">
              <span class="price">{{ formatCLP(offer.price) }}</span>
              <s class="list-price">{{ formatCLP(offer.listPrice) }}</s>
              <span class="discount">-{{ offer.discount }}%</span>
            </div>
            <p class="sizes">{{ offer.sizes.length === 1 ? 'Talla' : 'Tallas' }} {{ offer.sizes.join(' · ') }}</p>
            <a class="cta" [routerLink]="['/producto', offer.productId]">Ver oferta</a>
          </div>
          <img class="slide-img" [src]="offer.image" [alt]="offer.name" (error)="usePlaceholder($event)" />
        </article>
      </div>

      <ng-container *ngIf="offers().length > 1">
        <button class="arrow prev" aria-label="Oferta anterior" (click)="go(active() - 1)">
          <ion-icon name="chevron-back-outline"></ion-icon>
        </button>
        <button class="arrow next" aria-label="Oferta siguiente" (click)="go(active() + 1)">
          <ion-icon name="chevron-forward-outline"></ion-icon>
        </button>
        <div class="dots">
          <button
            class="dot"
            *ngFor="let offer of offers(); let i = index"
            [class.active]="i === active()"
            [attr.aria-label]="'Ir a la oferta ' + (i + 1) + ': ' + offer.name"
            [attr.aria-current]="i === active() ? 'true' : null"
            (click)="go(i)"
          ></button>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .offers { position: relative; margin: 0 16px; }
    .track {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      border: 1px solid var(--border);
      border-radius: 24px;
      background: linear-gradient(135deg, #1a0a0d, #0c0c0c 55%, #000);
    }
    .track::-webkit-scrollbar { display: none; }
    .slide {
      flex: 0 0 100%;
      scroll-snap-align: start;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 108px;
      align-items: center;
      gap: 16px;
      padding: 20px 20px 40px;
    }
    .slide-text { min-width: 0; }
    .section-title { font-size: 11px; }
    h2 { margin: 0; font-size: 22px; font-weight: 900; text-transform: uppercase; line-height: 1.05; overflow-wrap: anywhere; }
    .detail { margin: 6px 0 0; font-size: 12px; color: var(--text-muted); }
    .prices { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 12px; }
    .price { font-size: 24px; font-weight: 900; }
    .list-price { font-size: 13px; color: var(--text-faint); }
    .discount { padding: 3px 10px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 800; }
    .sizes { margin: 8px 0 0; font-size: 12px; color: var(--text-muted); }
    .cta {
      display: inline-block; margin-top: 14px; padding: 10px 18px; border-radius: 12px;
      background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; text-decoration: none;
    }
    .cta:hover, .cta:focus-visible { background: var(--accent-hover); }
    .slide-img { width: 100%; aspect-ratio: 4/5; object-fit: cover; border-radius: 16px; border: 1px solid var(--border); background: #18181b; }
    .arrow {
      position: absolute; top: 50%; transform: translateY(-50%);
      display: none; place-items: center; width: 36px; height: 36px; padding: 0;
      border: 1px solid var(--border); border-radius: 50%;
      background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 18px; cursor: pointer;
    }
    .arrow:hover, .arrow:focus-visible { border-color: var(--accent); }
    .arrow.prev { left: 12px; }
    .arrow.next { right: 12px; }
    .dots { position: absolute; left: 0; right: 0; bottom: 14px; display: flex; justify-content: center; gap: 6px; }
    .dot { width: 8px; height: 8px; padding: 0; border: none; border-radius: 999px; background: var(--border); cursor: pointer; transition: width 0.2s, background 0.2s; }
    .dot.active { width: 22px; background: var(--accent); }
    @media (min-width: 640px) {
      /* Con puntero hay flechas a los lados; en el teléfono se desliza con el dedo. */
      .arrow { display: grid; }
      .slide { grid-template-columns: minmax(0, 1fr) 200px; gap: 32px; padding: 28px 68px 44px; }
      .section-title { font-size: 13px; }
      h2 { font-size: 38px; }
      .detail, .sizes { font-size: 14px; }
      .price { font-size: 34px; }
      .list-price { font-size: 16px; }
    }
  `],
})
export class OffersCarouselComponent {
  offers = input.required<Offer[]>();

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  /** Diapositiva en que quedó el desplazamiento. */
  private readonly position = signal(0);
  /** Diapositiva a la vista. Si la lista se acorta, no apunta más allá de la última. */
  active = computed(() => Math.min(this.position(), Math.max(0, this.offers().length - 1)));
  paused = false;

  month = currentMonthName();
  formatCLP = formatCLP;
  usePlaceholder = usePlaceholder;

  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({ 'chevron-back-outline': chevronBackOutline, 'chevron-forward-outline': chevronForwardOutline });
    this.schedule();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Muestra la diapositiva pedida; pasada la última vuelve a la primera, y al revés. */
  go(index: number): void {
    const count = this.offers().length;
    const track = this.track().nativeElement;
    track.scrollTo({ left: ((index + count) % count) * track.clientWidth, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  /** El desplazamiento manda: con flechas, puntos o el dedo, la diapositiva activa sale de dónde quedó. */
  onScroll(): void {
    const track = this.track().nativeElement;
    if (track.clientWidth > 0) {
      this.position.set(Math.round(track.scrollLeft / track.clientWidth));
    }
    this.schedule();
  }

  /**
   * Empieza de nuevo la cuenta para avanzar solo. Cada movimiento la reinicia: la oferta
   * que el visitante eligió con las flechas o el dedo se queda a la vista su tiempo completo.
   */
  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.reducedMotion) {
      this.timer = setTimeout(() => {
        this.advance();
        this.schedule();
      }, AUTOPLAY_MS);
    }
  }

  private advance(): void {
    // `offsetParent` es nulo mientras la portada no está a la vista, por ejemplo con otra pantalla encima.
    if (this.paused || document.hidden || this.offers().length < 2 || this.track().nativeElement.offsetParent === null) {
      return;
    }
    this.go(this.active() + 1);
  }
}
