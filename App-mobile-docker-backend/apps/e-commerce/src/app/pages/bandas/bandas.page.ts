import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, closeOutline, musicalNotesOutline } from 'ionicons/icons';
import { errorMessage } from '../../core/api';
import { formatDay, usePlaceholder } from '../../data/models';
import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { BandCard, ProductsService } from '../../services/products.service';
import { ToastService } from '../../services/toast.service';

/**
 * Las bandas con prendas publicadas, una tarjeta por banda. Llegando desde el menú de
 * una categoría (`?categoria=Poleras`) muestra las bandas de esa categoría; cada
 * tarjeta lleva a la tienda con las prendas de la banda. Bodega y el Gerente registran
 * aquí el próximo concierto de cada banda en Chile, que es lo que decide qué poleras
 * destaca el cartel de la portada.
 */
@Component({
  selector: 'app-bandas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonIcon,
    IonItem,
    IonInput,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
  ],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="musical-notes-outline"></ion-icon> {{ category() ?? 'Toda la tienda' }}</div>
          <h1>Bandas</h1>
          <p class="text-muted">
            {{ category() ? 'Elige una banda para ver sus ' + category()!.toLowerCase() + '.' : 'Elige una banda para ver sus prendas.' }}
          </p>
        </div>

        <div class="band-grid">
          <div class="band-item" *ngFor="let band of bands()">
            <a class="band-card" routerLink="/shop" [queryParams]="linkParams(band.name)">
              <div class="band-img">
                <img [src]="band.image" [alt]="" loading="lazy" (error)="usePlaceholder($event)" />
              </div>
              <div class="band-body">
                <h2>{{ band.name }}</h2>
                <p>
                  {{ band.products }} {{ band.products === 1 ? 'producto' : 'productos' }}
                  <span *ngIf="!category()"> · {{ band.categories.join(', ') }}</span>
                </p>
                <p class="concert" *ngIf="band.upcoming && band.concert as concert">
                  En Chile: {{ formatDay(concert.fecha) }}{{ concert.lugar ? ' · ' + concert.lugar : '' }}
                </p>
                <p class="credit" *ngIf="band.credit">{{ band.credit }}</p>
              </div>
            </a>
            <button class="concert-btn" *ngIf="canEdit()" (click)="openConcert(band)">
              <ion-icon name="calendar-outline"></ion-icon>
              {{ band.concert ? 'Cambiar concierto' : 'Registrar concierto en Chile' }}
            </button>
          </div>
        </div>

        <div class="empty" *ngIf="products.error() as message" role="alert">
          <p>{{ message }}</p>
          <ion-button class="btn-rockstar" [disabled]="products.loading()" (click)="products.load()">Reintentar</ion-button>
        </div>
        <div class="empty" *ngIf="!products.error() && bands().length === 0">
          <p>{{ products.loaded() ? 'No hay bandas con prendas publicadas.' : 'Cargando las bandas…' }}</p>
          <ion-button *ngIf="products.loaded()" class="btn-rockstar" routerLink="/shop">Ver toda la tienda</ion-button>
        </div>
      </div>

      <!-- Modal: concierto en Chile -->
      <ion-modal [isOpen]="selected() !== null" (didDismiss)="closeConcert()">
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>Concierto en Chile</ion-title>
              <ion-buttons slot="end">
                <ion-button (click)="closeConcert()"><ion-icon name="close-outline"></ion-icon></ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="rockstar-content">
            <div class="page-padded" *ngIf="selected() as band">
              <p class="text-muted">
                Próximo concierto de <strong class="band-name">{{ band.name }}</strong> en Chile. Mientras falten doce meses o menos, sus poleras
                aparecen en el cartel de la portada; pasada la fecha, salen solas.
              </p>
              <label class="lbl">Fecha del concierto</label>
              <ion-item lines="none" class="input-item">
                <ion-input type="date" [(ngModel)]="form.date"></ion-input>
              </ion-item>
              <label class="lbl">Lugar (opcional)</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="form.place" maxlength="120" placeholder="Estadio Nacional, Santiago"></ion-input>
              </ion-item>
              <p class="error-msg" *ngIf="modalError()" role="alert">{{ modalError() }}</p>
              <ion-button expand="block" class="btn-rockstar" [disabled]="saving()" (click)="saveConcert()">
                {{ saving() ? 'Guardando…' : 'Guardar concierto' }}
              </ion-button>
              <ion-button expand="block" class="btn-outline" *ngIf="band.concert" [disabled]="saving()" (click)="removeConcert()">
                Quitar concierto
              </ion-button>
            </div>
          </ion-content>
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 20px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; text-transform: uppercase; }
    .page-title p { margin: 0; font-size: 14px; }
    .band-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (min-width: 768px) { .band-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1100px) { .band-grid { grid-template-columns: repeat(4, 1fr); } }
    .band-item { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .band-card {
      flex: 1;
      display: flex; flex-direction: column;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
      color: inherit; text-decoration: none; transition: border-color 0.2s;
    }
    .band-card:hover, .band-card:focus-visible { border-color: var(--accent); outline: none; }
    .band-img { aspect-ratio: 4 / 3; overflow: hidden; background: #18181b; }
    .band-img img {
      width: 100%; height: 100%; object-fit: cover;
      filter: grayscale(0.6) contrast(1.1) brightness(0.8); transition: all 0.4s;
    }
    .band-card:hover .band-img img { filter: grayscale(0) brightness(1); transform: scale(1.05); }
    .band-body { padding: 14px; }
    .band-body h2 { margin: 0 0 4px; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
    .band-body p { margin: 0; font-size: 12px; color: var(--text-faint); }
    .band-body .concert { margin-top: 6px; font-weight: 700; color: #fca5a5; }
    .band-body .credit { margin-top: 8px; font-size: 9px; line-height: 1.3; opacity: 0.75; }
    .concert-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 8px 10px;
      background: transparent; border: 1px solid var(--border); border-radius: 10px;
      color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .concert-btn:hover, .concert-btn:focus-visible { border-color: var(--accent); color: #fff; }
    .empty { text-align: center; padding: 40px 20px; color: var(--text-faint); }
    .lbl { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin: 12px 0 8px; }
    .input-item {
      --background: #0c0c0c;
      --border-radius: 12px;
      --border: 1px solid var(--border);
      --padding-start: 12px;
    }
    .error-msg {
      margin: 12px 0 0; padding: 10px 12px; border-radius: 8px;
      background: rgba(127, 29, 29, 0.3); border: 1px solid #7f1d1d; color: #fca5a5; font-size: 13px;
    }
    .band-name { color: var(--text); }
    ion-modal ion-button { margin-top: 16px; }
    ion-modal .btn-outline { margin-top: 8px; }
  `],
})
export class BandasPage {
  products = inject(ProductsService);
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  /** Categoría desde cuyo menú se llegó; sin ella se muestran las bandas de toda la tienda. */
  category = computed(() => this.params()?.get('categoria') || null);
  bands = computed(() => this.products.bands(this.category()));

  /** Los conciertos los registran Bodega y el Gerente, igual que las fotos de las bandas. */
  canEdit = computed(() => this.auth.rol() === 'BODEGA' || this.auth.rol() === 'GERENTE');
  /** Banda cuyo concierto se está editando. */
  selected = signal<BandCard | null>(null);
  form = { date: '', place: '' };
  saving = signal(false);
  modalError = signal('');

  formatDay = formatDay;
  usePlaceholder = usePlaceholder;

  constructor() {
    addIcons({ 'musical-notes-outline': musicalNotesOutline, 'calendar-outline': calendarOutline, 'close-outline': closeOutline });
    void this.products.load();
  }

  linkParams(band: string): Record<string, string> {
    const category = this.category();
    return category ? { categoria: category, banda: band } : { banda: band };
  }

  openConcert(band: BandCard) {
    this.form = { date: band.concert?.fecha ?? '', place: band.concert?.lugar ?? '' };
    this.modalError.set('');
    this.selected.set(band);
  }

  closeConcert() {
    this.selected.set(null);
  }

  saveConcert() {
    const band = this.selected();
    if (!band) return;
    if (!this.form.date) {
      this.modalError.set('Elige la fecha del concierto.');
      return;
    }
    void this.save(band.name, this.form.date, this.form.place.trim() || null, `Concierto de ${band.name} guardado.`);
  }

  removeConcert() {
    const band = this.selected();
    if (!band) return;
    void this.save(band.name, null, null, `${band.name} quedó sin concierto registrado.`);
  }

  /** Guarda en el backend y, si resulta, vuelve a traer las bandas, cierra el modal y avisa. */
  private async save(band: string, date: string | null, place: string | null, done: string) {
    if (this.saving()) return;
    this.saving.set(true);
    this.modalError.set('');
    try {
      await this.admin.saveConcert(band, date, place);
      await this.products.load();
      this.toast.show(done);
      this.closeConcert();
    } catch (error) {
      this.modalError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
