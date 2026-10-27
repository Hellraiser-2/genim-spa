import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
} from '@ionic/angular/standalone';
import type { GuiaDeTallas, Ubicacion } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import {
  cubeOutline,
  archiveOutline,
  locationOutline,
  warningOutline,
  addOutline,
  pencilOutline,
  alertCircleOutline,
  closeOutline,
  resizeOutline,
} from 'ionicons/icons';
import { errorMessage, uuid } from '../../core/api';
import { currentMonthName, formatCLP, usePlaceholder } from '../../data/models';
import { AdminService, StockRow } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

type ModalKind = 'stock' | 'damage' | 'edit' | 'guide' | null;

/** Fila del formulario de la guía de tallas: lo escrito en cada campo, vacío si no hay medida. */
interface GuideRow {
  talla: string;
  ancho: number | null;
  largo: number | null;
}

/** Tope de una medida de la guía; el backend impone el mismo. */
const MAX_CM = 300;

/**
 * Inventario para el personal, con los datos reales del backend. Cada rol ve las
 * operaciones que el backend le permite: Bodega ingresa stock y registra mermas, y el
 * Gerente define el precio, la oferta del mes, la descripción y el tipo de estampado con
 * que el producto se publica en la tienda. Ambos mantienen la guía de tallas.
 */
@Component({
  selector: 'app-warehouse',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonIcon,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
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
          <div class="section-title"><ion-icon name="cube-outline"></ion-icon> Operaciones</div>
          <h1>Bodega & Logística</h1>
          <p class="text-muted">Control de inventario físico y movimientos de prendas.</p>
        </div>

        <div class="metrics">
          <div class="metric">
            <ion-icon name="archive-outline" color="danger"></ion-icon>
            <div class="metric-value">{{ admin.inventory().length }}</div>
            <div class="metric-label">SKUs</div>
          </div>
          <div class="metric">
            <ion-icon name="add-outline" color="danger"></ion-icon>
            <div class="metric-value">{{ admin.totalUnits() }}</div>
            <div class="metric-label">Unidades</div>
          </div>
          <div class="metric">
            <ion-icon name="location-outline" color="danger"></ion-icon>
            <div class="metric-value">{{ admin.locationsCount() }}</div>
            <div class="metric-label">Ubicaciones</div>
          </div>
          <div class="metric">
            <ion-icon name="warning-outline" color="danger"></ion-icon>
            <div class="metric-value">{{ admin.lowStockCount() }}</div>
            <div class="metric-label">Bajo stock</div>
          </div>
        </div>

        <div class="tools" *ngIf="canEditGuide()">
          <button class="action-btn" (click)="openGuide()">
            <ion-icon name="resize-outline"></ion-icon> Guía de tallas
          </button>
        </div>

        <p class="notice" *ngIf="admin.unpricedCount() > 0">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <span>
            {{ admin.unpricedCount() }} {{ admin.unpricedCount() === 1 ? 'producto no tiene precio y no aparece' : 'productos no tienen precio y no aparecen' }}
            en la tienda. {{ canEdit() ? 'Defínelo con Editar.' : 'El precio lo define el Gerente.' }}
          </span>
        </p>

        <div class="load-error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <div class="table-wrap" *ngIf="admin.inventory().length > 0">
          <table class="wh-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Talla</th>
                <th>Precio</th>
                <th>Cantidad</th>
                <th>Ubicación</th>
                <th *ngIf="canMoveStock() || canEdit()">Operaciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of admin.inventory()" [class.inactive]="!p.active">
                <td>
                  <div class="prod-cell">
                    <img [src]="p.image" [alt]="p.name" (error)="usePlaceholder($event)" />
                    <div>
                      <div class="prod-name">{{ p.name }}</div>
                      <div class="prod-cat">{{ p.category }} · {{ p.color }} · {{ p.sku }}{{ p.active ? '' : ' · Desactivado' }}</div>
                    </div>
                  </div>
                </td>
                <td class="mono">{{ p.size }}</td>
                <td>
                  <span *ngIf="p.price !== null; else noPrice">{{ formatCLP(p.price) }}</span>
                  <ng-template #noPrice><span class="no-price">Sin precio</span></ng-template>
                  <div class="offer" *ngIf="p.offerPrice !== null">Oferta de {{ month }}: {{ formatCLP(p.offerPrice) }}</div>
                </td>
                <td>
                  <span [class.text-accent]="p.stock <= 3" class="stock-num">{{ p.stock }}</span>
                  <div class="prod-cat">
                    Bodega {{ p.warehouse }} · Sala {{ p.salesFloor }}{{ p.reserved > 0 ? ' · ' + p.reserved + ' en pedidos' : '' }}
                  </div>
                </td>
                <td>
                  <div class="loc-cell">
                    <ion-icon name="location-outline" color="danger" style="font-size:14px;"></ion-icon>
                    {{ p.location }}
                  </div>
                </td>
                <td *ngIf="canMoveStock() || canEdit()">
                  <div class="actions">
                    <button class="action-btn primary" *ngIf="canEdit()" (click)="openModal('edit', p)">
                      <ion-icon name="pencil-outline"></ion-icon> Editar
                    </button>
                    <button class="action-btn" *ngIf="canMoveStock() && p.active" (click)="openModal('stock', p)">
                      <ion-icon name="add-outline"></ion-icon> Ingreso
                    </button>
                    <button class="action-btn danger" *ngIf="canMoveStock() && p.active" (click)="openModal('damage', p)">
                      <ion-icon name="alert-circle-outline"></ion-icon> Merma
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-faint" *ngIf="!error() && admin.inventory().length === 0">
          {{ loading() ? 'Cargando el inventario…' : 'No hay productos registrados.' }}
        </p>
      </div>

      <!-- Modal: Stock -->
      <ion-modal [isOpen]="modal() === 'stock'" (didDismiss)="closeModal()">
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>Ingresar stock</ion-title>
              <ion-buttons slot="end">
                <ion-button (click)="closeModal()"><ion-icon name="close-outline"></ion-icon></ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="rockstar-content">
            <div class="page-padded" *ngIf="selected() as p">
              <p class="text-muted">{{ p.name }} · Talla {{ p.size }}</p>
              <label class="lbl">Cantidad recibida en bodega</label>
              <ion-item lines="none" class="input-item">
                <ion-input type="number" min="1" [(ngModel)]="stockQty"></ion-input>
              </ion-item>
              <p class="error-msg" *ngIf="modalError()" role="alert">{{ modalError() }}</p>
              <ion-button expand="block" class="btn-rockstar" [disabled]="saving()" (click)="submitStock()">
                {{ saving() ? 'Registrando…' : 'Confirmar ingreso' }}
              </ion-button>
            </div>
          </ion-content>
        </ng-template>
      </ion-modal>

      <!-- Modal: Damage -->
      <ion-modal [isOpen]="modal() === 'damage'" (didDismiss)="closeModal()">
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>Registrar merma / daño</ion-title>
              <ion-buttons slot="end">
                <ion-button (click)="closeModal()"><ion-icon name="close-outline"></ion-icon></ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="rockstar-content">
            <div class="page-padded" *ngIf="selected() as p">
              <p class="text-muted">
                {{ p.name }} · Talla {{ p.size }}<br />
                Valor unitario: <span class="text-light">{{ p.price === null ? 'sin precio' : formatCLP(p.price) }}</span>
              </p>
              <label class="lbl">De dónde se da de baja</label>
              <ion-item lines="none" class="input-item">
                <ion-select [(ngModel)]="damageLocation" interface="popover">
                  <ion-select-option value="BODEGA">Bodega · {{ p.warehouse }} unidades</ion-select-option>
                  <ion-select-option value="SALA_VENTAS">Sala de ventas · {{ p.salesFloor }} unidades</ion-select-option>
                </ion-select>
              </ion-item>
              <label class="lbl">Unidades a dar de baja</label>
              <ion-item lines="none" class="input-item">
                <ion-input type="number" min="1" [(ngModel)]="damageQty"></ion-input>
              </ion-item>
              <label class="lbl">Motivo</label>
              <ion-item lines="none" class="input-item">
                <ion-select [(ngModel)]="damageReason" interface="popover">
                  <ion-select-option value="Prenda dañada">Prenda dañada</ion-select-option>
                  <ion-select-option value="Defecto de fabricación">Defecto de fabricación</ion-select-option>
                  <ion-select-option value="Mancha / deterioro">Mancha / deterioro</ion-select-option>
                  <ion-select-option value="Otro">Otro</ion-select-option>
                </ion-select>
              </ion-item>
              <p class="error-msg" *ngIf="modalError()" role="alert">{{ modalError() }}</p>
              <ion-button expand="block" class="btn-rockstar" [disabled]="saving()" (click)="submitDamage()">
                {{ saving() ? 'Registrando…' : 'Registrar merma' }}
              </ion-button>
            </div>
          </ion-content>
        </ng-template>
      </ion-modal>

      <!-- Modal: Edit -->
      <ion-modal [isOpen]="modal() === 'edit'" (didDismiss)="closeModal()">
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>Editar producto</ion-title>
              <ion-buttons slot="end">
                <ion-button (click)="closeModal()"><ion-icon name="close-outline"></ion-icon></ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="rockstar-content">
            <div class="page-padded" *ngIf="selected() as p">
              <div class="edit-preview">
                <img [src]="p.image" alt="" (error)="usePlaceholder($event)" />
                <div>
                  <div class="prod-name">{{ p.name }}</div>
                  <div class="prod-cat">{{ p.category }} · se aplica a todas sus tallas</div>
                </div>
              </div>

              <label class="lbl">Precio (CLP)</label>
              <ion-item lines="none" class="input-item">
                <ion-input type="number" min="1" [(ngModel)]="editForm.price" placeholder="Sin precio no se publica"></ion-input>
              </ion-item>

              <label class="lbl">Precio de oferta de {{ month }} (CLP)</label>
              <ion-item lines="none" class="input-item">
                <ion-input type="number" min="1" [(ngModel)]="editForm.offerPrice" placeholder="Vacío: sin oferta este mes"></ion-input>
              </ion-item>
              <p class="hint">
                Con oferta, el producto aparece en el carrusel de la portada y se cobra a ese precio hasta fin de mes. Después vuelve solo a su precio normal.
              </p>

              <label class="lbl">Descripción</label>
              <ion-item lines="none" class="input-item">
                <ion-textarea [(ngModel)]="editForm.description" rows="3" [autoGrow]="true"></ion-textarea>
              </ion-item>

              <label class="lbl">Tipo de estampado</label>
              <ion-item lines="none" class="input-item">
                <ion-input [(ngModel)]="editForm.printType" maxlength="60" placeholder="Serigrafía, DTF, bordado…"></ion-input>
              </ion-item>

              <p class="error-msg" *ngIf="modalError()" role="alert">{{ modalError() }}</p>
              <ion-button expand="block" class="btn-rockstar" [disabled]="saving()" (click)="submitEdit()">
                {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
              </ion-button>
            </div>
          </ion-content>
        </ng-template>
      </ion-modal>

      <!-- Modal: Guía de tallas -->
      <ion-modal [isOpen]="modal() === 'guide'" (didDismiss)="closeModal()">
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>Guía de tallas</ion-title>
              <ion-buttons slot="end">
                <ion-button (click)="closeModal()"><ion-icon name="close-outline"></ion-icon></ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="rockstar-content">
            <div class="page-padded">
              <p class="text-muted">
                Cuánto mide cada talla, con la prenda extendida y en centímetros. Las medidas valen para todos los productos de la
                categoría y aparecen en la página de cada uno.
              </p>
              <label class="lbl">Categoría</label>
              <ion-item lines="none" class="input-item">
                <ion-select [ngModel]="guideCategory" (ngModelChange)="pickGuideCategory($event)" interface="popover">
                  <ion-select-option *ngFor="let g of guides()" [value]="g.categoria">{{ g.categoria }}</ion-select-option>
                </ion-select>
              </ion-item>
              <div class="guide-row guide-head"><span>Talla</span><span>Ancho (cm)</span><span>Largo (cm)</span></div>
              <div class="guide-row" *ngFor="let row of guideRows">
                <span class="guide-size">{{ row.talla }}</span>
                <ion-item lines="none" class="input-item">
                  <ion-input type="number" min="1" [max]="maxCm" inputmode="numeric" [(ngModel)]="row.ancho" [attr.aria-label]="'Ancho de la talla ' + row.talla"></ion-input>
                </ion-item>
                <ion-item lines="none" class="input-item">
                  <ion-input type="number" min="1" [max]="maxCm" inputmode="numeric" [(ngModel)]="row.largo" [attr.aria-label]="'Largo de la talla ' + row.talla"></ion-input>
                </ion-item>
              </div>
              <p class="hint">El ancho va de lado a lado, a la altura del pecho o de la cintura según la prenda. Un campo vacío deja esa medida sin mostrar.</p>
              <p class="error-msg" *ngIf="modalError()" role="alert">{{ modalError() }}</p>
              <ion-button expand="block" class="btn-rockstar" [disabled]="saving() || guideRows.length === 0" (click)="submitGuide()">
                {{ saving() ? 'Guardando…' : 'Guardar medidas' }}
              </ion-button>
            </div>
          </ion-content>
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 24px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; }
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (min-width: 640px) { .metrics { grid-template-columns: repeat(4, 1fr); } }
    .metric { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
    .metric ion-icon { font-size: 18px; margin-bottom: 8px; }
    .metric-value { font-size: 22px; font-weight: 900; }
    .metric-label { font-size: 11px; color: var(--text-faint); }
    .tools { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .guide-row { display: grid; grid-template-columns: 64px 1fr 1fr; align-items: center; gap: 8px; margin-top: 8px; }
    .guide-head { margin-top: 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
    .guide-size { font-weight: 800; }
    .notice {
      display: flex; gap: 8px; align-items: flex-start;
      margin: 0 0 16px; padding: 12px;
      border: 1px solid #854d0e; border-radius: 12px;
      background: rgba(133, 77, 14, 0.2); color: #fde68a; font-size: 13px; line-height: 1.5;
    }
    .notice ion-icon { flex: none; font-size: 18px; margin-top: 1px; }
    .load-error { text-align: center; padding: 24px; color: var(--text-muted); }
    .table-wrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; overflow-x: auto; }
    .wh-table { width: 100%; min-width: 820px; text-align: left; font-size: 14px; border-collapse: collapse; }
    .wh-table th { padding: 16px 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); background: rgba(9, 9, 11, 0.6); border-bottom: 1px solid var(--border); }
    .wh-table td { padding: 16px 20px; border-bottom: 1px solid #18181b; vertical-align: middle; }
    .wh-table tr:last-child td { border-bottom: none; }
    .wh-table tr:hover { background: rgba(9, 9, 11, 0.4); }
    .wh-table tr.inactive { opacity: 0.55; }
    .prod-cell { display: flex; align-items: center; gap: 12px; }
    .prod-cell img { width: 40px; height: 48px; object-fit: cover; border-radius: 8px; filter: grayscale(0.8); }
    .prod-name { font-weight: 600; }
    .prod-cat { font-size: 11px; color: var(--text-faint); }
    .mono { font-family: monospace; color: var(--text-muted); }
    .stock-num { font-weight: 900; }
    .no-price { padding: 2px 8px; border-radius: 999px; background: rgba(133, 77, 14, 0.3); color: #fde68a; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .offer { margin-top: 4px; font-size: 11px; font-weight: 700; color: #fca5a5; white-space: nowrap; }
    .hint { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-faint); }
    .loc-cell { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .action-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 10px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 11px; font-weight: 600;
      cursor: pointer;
    }
    .action-btn:hover { background: #18181b; color: #fff; }
    .action-btn.primary { border-color: var(--accent); color: var(--accent); }
    .action-btn.danger { border-color: #7f1d1d; color: #f87171; }
    .action-btn.danger:hover { background: rgba(127, 29, 29, 0.3); }
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
    .btn-rockstar { margin-top: 16px; }
    .edit-preview { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .edit-preview img { width: 56px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
  `],
})
export class WarehousePage {
  admin = inject(AdminService);
  toast = inject(ToastService);
  auth = inject(AuthService);
  router = inject(Router);

  formatCLP = formatCLP;
  usePlaceholder = usePlaceholder;
  modal = signal<ModalKind>(null);
  selected = signal<StockRow | null>(null);
  loading = signal(false);
  error = signal('');
  saving = signal(false);
  modalError = signal('');

  /** Ingresos y mermas son de Bodega; el precio lo define el Gerente (matriz de permisos del backend). */
  canMoveStock = computed(() => this.auth.rol() === 'BODEGA');
  canEdit = computed(() => this.auth.rol() === 'GERENTE');
  /** La guía de tallas la mantienen Bodega y el Gerente. */
  canEditGuide = computed(() => this.auth.rol() === 'BODEGA' || this.auth.rol() === 'GERENTE');

  guides = signal<GuiaDeTallas[]>([]);
  guideCategory = '';
  guideRows: GuideRow[] = [];
  maxCm = MAX_CM;

  stockQty = 1;
  damageQty = 1;
  damageLocation: Ubicacion = 'BODEGA';
  damageReason = 'Prenda dañada';
  editForm: { price: number | null; offerPrice: number | null; description: string; printType: string } = { price: null, offerPrice: null, description: '', printType: '' };
  month = currentMonthName();

  /** Clave de la operación abierta en el modal: reintentarla tras una falla de red no la duplica. */
  private operationKey = '';

  constructor() {
    addIcons({
      'cube-outline': cubeOutline,
      'archive-outline': archiveOutline,
      'location-outline': locationOutline,
      'warning-outline': warningOutline,
      'add-outline': addOutline,
      'pencil-outline': pencilOutline,
      'alert-circle-outline': alertCircleOutline,
      'close-outline': closeOutline,
      'resize-outline': resizeOutline,
    });
    if (!this.auth.isAdmin()) {
      this.router.navigateByUrl('/entry');
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.admin.loadInventory();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  openModal(kind: ModalKind, product: StockRow) {
    this.selected.set(product);
    this.modalError.set('');
    this.operationKey = uuid();
    if (kind === 'edit') {
      this.editForm = { price: product.price, offerPrice: product.offerPrice, description: product.description, printType: product.printType };
    } else if (kind === 'stock') {
      this.stockQty = 1;
    } else if (kind === 'damage') {
      this.damageQty = 1;
      this.damageLocation = product.warehouse > 0 || product.salesFloor === 0 ? 'BODEGA' : 'SALA_VENTAS';
      this.damageReason = 'Prenda dañada';
    }
    this.modal.set(kind);
  }

  /** Abre la guía de tallas con las medidas guardadas, en la primera categoría. */
  async openGuide() {
    this.modalError.set('');
    try {
      this.guides.set(await this.admin.sizeGuides());
      this.pickGuideCategory(this.guides()[0]?.categoria ?? '');
      this.modal.set('guide');
    } catch (error) {
      this.toast.show(errorMessage(error));
    }
  }

  pickGuideCategory(category: string) {
    this.guideCategory = category;
    const sizes = this.guides().find((g) => g.categoria === category)?.tallas ?? [];
    this.guideRows = sizes.map((size) => ({ talla: size.talla, ancho: size.anchoCm, largo: size.largoCm }));
    this.modalError.set('');
  }

  submitGuide() {
    // Un campo vacío llega como `null` o como texto vacío, según cómo se haya borrado.
    const cm = (raw: unknown) => (raw === null || String(raw).trim() === '' ? null : Number(raw));
    const sizes = this.guideRows.map((row) => ({ talla: row.talla, anchoCm: cm(row.ancho), largoCm: cm(row.largo) }));
    const valid = (value: number | null) => value === null || (Number.isInteger(value) && value >= 1 && value <= MAX_CM);
    if (!sizes.every((size) => valid(size.anchoCm) && valid(size.largoCm))) {
      this.modalError.set(`Las medidas van en centímetros enteros, entre 1 y ${MAX_CM}.`);
      return;
    }
    const category = this.guideCategory;
    void this.save(() => this.admin.saveSizeGuide(category, sizes), `Guía de tallas de ${category} guardada.`);
  }

  closeModal() {
    this.modal.set(null);
    this.selected.set(null);
  }

  submitStock() {
    const p = this.selected();
    const amount = Number(this.stockQty);
    if (!p) return;
    if (!Number.isInteger(amount) || amount < 1) {
      this.modalError.set('La cantidad debe ser un entero mayor que cero.');
      return;
    }
    void this.save(() => this.admin.addStock(this.operationKey, p.id, amount), `Se ingresaron ${amount} unidades a bodega.`);
  }

  submitDamage() {
    const p = this.selected();
    const amount = Number(this.damageQty);
    if (!p) return;
    if (!Number.isInteger(amount) || amount < 1) {
      this.modalError.set('La cantidad debe ser un entero mayor que cero.');
      return;
    }
    void this.save(
      () => this.admin.registerDamage(this.operationKey, p.id, this.damageLocation, amount, this.damageReason),
      `Se registraron ${amount} unidades como merma.`,
    );
  }

  submitEdit() {
    const p = this.selected();
    if (!p) return;
    // Un campo de precio vacío llega como `null` o como texto vacío, según cómo se haya borrado.
    const amount = (raw: unknown) => (raw === null || String(raw).trim() === '' ? null : Number(raw));
    const price = amount(this.editForm.price);
    const offerPrice = amount(this.editForm.offerPrice);
    if (price !== null && (!Number.isInteger(price) || price < 1)) {
      this.modalError.set('El precio debe ser un entero mayor que cero.');
      return;
    }
    if (offerPrice !== null && (!Number.isInteger(offerPrice) || offerPrice < 1)) {
      this.modalError.set('El precio de oferta debe ser un entero mayor que cero.');
      return;
    }
    if (offerPrice !== null && (price === null || offerPrice >= price)) {
      this.modalError.set('El precio de oferta debe ser menor que el precio normal.');
      return;
    }
    void this.save(
      () =>
        this.admin.updateProduct(p.productId, {
          precio: price,
          precioOferta: offerPrice,
          descripcion: this.editForm.description.trim() || null,
          tipoEstampado: this.editForm.printType.trim() || null,
        }),
      price === null
        ? `${p.name} quedó sin precio y fuera de la tienda.`
        : offerPrice === null
          ? `Producto actualizado: ${p.name}.`
          : `${p.name} quedó en oferta por ${this.month}.`,
    );
  }

  /** Ejecuta la operación contra el backend y, si resulta, cierra el modal y avisa. */
  private async save(operation: () => Promise<void>, done: string) {
    if (this.saving()) return;
    this.saving.set(true);
    this.modalError.set('');
    try {
      await operation();
      this.toast.show(done);
      this.closeModal();
    } catch (error) {
      this.modalError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
