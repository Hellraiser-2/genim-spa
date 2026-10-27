import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import type { AccionRecomendada, Recomendaciones } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { alertCircleOutline, trendingUpOutline } from 'ionicons/icons';
import { errorMessage } from '../core/api';
import { formatDate } from '../data/models';
import { AdminService } from '../services/admin.service';

const ACTION_LABELS: Record<AccionRecomendada, string> = {
  INVERTIR: 'Invertir',
  MANTENER: 'Mantener',
  NO_PRIORIZAR: 'No priorizar',
};

/** Bandas a la vista antes de pedir "ver todas": las de mayor puntaje. */
const BANDS_SHOWN = 6;
/** Con menos ventas que estas, se avisa que las ventas aún pesan poco en el cálculo. */
const FEW_SALES = 10;

/**
 * Recomendaciones de inversión del Gerente: en qué bandas y tipos de producto conviene
 * poner el presupuesto. Las calcula el backend con reglas, a partir de las ventas, el
 * stock y los conciertos registrados de la tienda y de la popularidad de las bandas en
 * Deezer. No usa IA ni tiene costo, y cada recomendación trae sus motivos.
 */
@Component({
  selector: 'app-investment-advice',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="advice card-rockstar">
      <div class="head">
        <ion-icon name="trending-up-outline" color="danger"></ion-icon>
        <div>
          <h3>Recomendaciones de inversión</h3>
          <p class="text-faint">
            En qué bandas y tipos de producto conviene poner el presupuesto, según las ventas, el stock y los conciertos registrados en la
            tienda, y la popularidad de las bandas en Deezer.
          </p>
        </div>
        <button class="link" [disabled]="loading()" (click)="load()">{{ loading() ? 'Calculando…' : 'Actualizar' }}</button>
      </div>

      <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>
      <p class="text-faint" *ngIf="!advice() && loading()">Calculando las recomendaciones…</p>

      <ng-container *ngIf="advice() as a">
        <p class="notice" *ngIf="a.ventasPagadas < fewSales">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <span>
            La tienda tiene {{ a.ventasPagadas }} {{ a.ventasPagadas === 1 ? 'venta pagada' : 'ventas pagadas' }}: todavía son pocas para sacar
            conclusiones, así que por ahora pesan más los conciertos y la popularidad.
          </span>
        </p>
        <p class="notice" *ngIf="!a.popularidadDisponible">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <span>No se pudo consultar Deezer: estas recomendaciones usan solo los datos de la tienda. Prueba a actualizar más tarde.</span>
        </p>

        <h4>Bandas</h4>
        <div class="bands">
          <article class="band" *ngFor="let b of shownBands()">
            <div class="row">
              <strong class="name">{{ b.banda }}</strong>
              <span class="action" [attr.data-action]="b.accion">{{ label(b.accion) }}</span>
            </div>
            <div class="score" [attr.aria-label]="'Puntaje ' + b.puntaje + ' de 100'">
              <div class="bar"><div class="bar-fill" [attr.data-action]="b.accion" [style.width.%]="b.puntaje"></div></div>
              <span>{{ b.puntaje }}/100</span>
            </div>
            <ul *ngIf="b.motivos.length > 0; else noReasons">
              <li *ngFor="let reason of b.motivos">{{ reason }}</li>
            </ul>
            <ng-template #noReasons><p class="quiet">Sin señales por ahora: ni concierto, ni ventas recientes, ni datos de popularidad.</p></ng-template>
            <p class="facts">
              {{ b.productos }} {{ b.productos === 1 ? 'producto' : 'productos' }}<span *ngIf="b.categorias.length > 0"> ({{ b.categorias.join(', ') }})</span>
              · {{ b.unidadesEnStock }} en stock · {{ b.unidadesVendidasUltimos30Dias }} vendidas en 30 días
            </p>
            <p class="add" *ngIf="b.categoriasPorSumar.length > 0">Aún no tiene {{ b.categoriasPorSumar.join(' ni ').toLowerCase() }}, que es de lo que más vende la tienda.</p>
          </article>
        </div>
        <button class="link more" *ngIf="a.bandas.length > bandsShown" (click)="showAll.set(!showAll())">
          {{ showAll() ? 'Ver solo las primeras' : 'Ver las ' + a.bandas.length + ' bandas' }}
        </button>

        <h4>Tipos de producto</h4>
        <div class="types">
          <div class="type" *ngFor="let c of a.categorias">
            <div class="row">
              <strong class="name">{{ c.categoria }}</strong>
              <span class="action" [attr.data-action]="c.accion">{{ label(c.accion) }}</span>
            </div>
            <p class="quiet">{{ c.motivos.join(' ') }}</p>
          </div>
        </div>

        <ng-container *ngIf="a.porReponer.length > 0">
          <h4>Se venden y se están acabando</h4>
          <ul class="restock">
            <li *ngFor="let p of a.porReponer">
              <strong>{{ p.producto }}</strong> · {{ p.unidadesVendidasUltimos30Dias }} vendidas en 30 días, quedan {{ p.unidadesEnStock }}
              <span *ngIf="p.tallasAgotadas.length > 0"> · sin talla {{ p.tallasAgotadas.join(', ') }}</span>
            </li>
          </ul>
        </ng-container>

        <ng-container *ngIf="a.bandasDelMomento.length > 0">
          <h4>Suenan ahora y la tienda no las vende</h4>
          <div class="trending">
            <span class="chip" *ngFor="let t of a.bandasDelMomento">
              {{ t.banda }} · {{ t.cancionesEnRanking }} {{ t.cancionesEnRanking === 1 ? 'canción' : 'canciones' }} en ranking
            </span>
          </div>
        </ng-container>

        <p class="fine">
          Calculado el {{ formatDate(a.generadoEn) }} con reglas fijas, sin IA. Popularidad y rankings de metal y rock: Deezer. Es un apoyo para
          decidir, no reemplaza tu criterio.
        </p>
      </ng-container>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .advice { padding: 20px; margin-bottom: 20px; }
    .head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
    .head > ion-icon { flex: none; font-size: 20px; margin-top: 2px; }
    .head > div { flex: 1; min-width: 0; }
    .head h3 { margin: 0 0 4px; font-size: 16px; }
    .head p { margin: 0; font-size: 12px; line-height: 1.5; }
    .link { flex: none; padding: 0; background: none; border: none; color: var(--text-muted); font-size: 12px; text-decoration: underline; cursor: pointer; }
    .link:hover:not(:disabled) { color: #fff; }
    .link.more { margin-top: 10px; }
    .notice {
      display: flex; gap: 8px; align-items: flex-start;
      margin: 0 0 12px; padding: 12px;
      border: 1px solid #854d0e; border-radius: 12px;
      background: rgba(133, 77, 14, 0.2); color: #fde68a; font-size: 13px; line-height: 1.5;
    }
    .notice ion-icon { flex: none; font-size: 18px; margin-top: 1px; }
    .error-msg {
      margin: 0 0 12px; padding: 10px 12px; border-radius: 8px;
      background: rgba(127, 29, 29, 0.3); border: 1px solid #7f1d1d; color: #fca5a5; font-size: 13px;
    }
    h4 { margin: 20px 0 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); }
    .bands { display: grid; gap: 10px; }
    @media (min-width: 900px) { .bands { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .band, .type { padding: 14px; border: 1px solid #27272a; border-radius: 14px; background: rgba(9, 9, 11, 0.5); }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .name { font-size: 15px; overflow-wrap: anywhere; }
    /* El color acompaña al texto de la acción, que es el que la dice. */
    .action { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .action[data-action='INVERTIR'] { background: rgba(22, 163, 74, 0.2); color: #86efac; }
    .action[data-action='MANTENER'] { background: rgba(202, 138, 4, 0.2); color: #fde68a; }
    .action[data-action='NO_PRIORIZAR'] { background: #27272a; color: var(--text-muted); }
    .score { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 11px; color: var(--text-faint); }
    .bar { flex: 1; height: 6px; border-radius: 999px; background: #18181b; overflow: hidden; }
    .bar-fill { height: 100%; background: #52525b; }
    .bar-fill[data-action='INVERTIR'] { background: #16a34a; }
    .bar-fill[data-action='MANTENER'] { background: #ca8a04; }
    ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
    .quiet { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); }
    .facts { margin: 8px 0 0; font-size: 11px; color: var(--text-faint); }
    .add { margin: 8px 0 0; font-size: 12px; color: #86efac; }
    .types { display: grid; gap: 10px; }
    @media (min-width: 900px) { .types { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .restock { color: var(--text-muted); }
    .restock strong { color: var(--text); }
    .trending { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; color: var(--text-muted); }
    .fine { margin: 18px 0 0; font-size: 11px; line-height: 1.5; color: var(--text-faint); }
  `],
})
export class InvestmentAdviceComponent {
  private readonly admin = inject(AdminService);

  advice = signal<Recomendaciones | null>(null);
  loading = signal(false);
  error = signal('');
  showAll = signal(false);
  shownBands = computed(() => (this.showAll() ? (this.advice()?.bandas ?? []) : (this.advice()?.bandas ?? []).slice(0, BANDS_SHOWN)));

  bandsShown = BANDS_SHOWN;
  fewSales = FEW_SALES;
  formatDate = formatDate;

  constructor() {
    addIcons({ 'trending-up-outline': trendingUpOutline, 'alert-circle-outline': alertCircleOutline });
    void this.load();
  }

  label(action: AccionRecomendada): string {
    return ACTION_LABELS[action];
  }

  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.advice.set(await this.admin.investmentAdvice());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
