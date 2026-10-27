import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import type { PedidoCliente } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cubeOutline, locationOutline } from 'ionicons/icons';
import { formatCLP, formatDate, orderStatusLabel } from '../data/models';

/** Tarjeta de una compra pagada: sus productos, su destino, su estado y su código de seguimiento. */
@Component({
  selector: 'app-order-card',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="order" *ngIf="order() as o">
      <div class="order-head">
        <div>
          <div class="order-number">Pedido #{{ o.idPedido }}</div>
          <div class="order-date">{{ formatDate(o.pagadoEn) }}</div>
        </div>
        <span class="status" [class.shipped]="o.estado === 'DESPACHADO'" [class.delivered]="o.estado === 'ENTREGADO'">
          {{ statusLabel(o.estado) }}
        </span>
      </div>

      <div class="line" *ngFor="let l of o.lineas">
        <span class="line-qty">{{ l.cantidad }}×</span>
        <span class="line-name">{{ l.producto }} · {{ l.talla }} · {{ l.color }}</span>
        <span class="line-price">{{ formatCLP(l.precioUnitario * l.cantidad) }}</span>
      </div>

      <div class="order-foot">
        <div class="dato">
          <ion-icon name="location-outline"></ion-icon>
          <span>{{ o.direccion }}, {{ o.comuna }}, {{ o.region }}</span>
        </div>
        <div class="dato" *ngIf="o.trackingStarken; else noTracking">
          <ion-icon name="cube-outline"></ion-icon>
          <span>Seguimiento Starken <strong class="tracking">{{ o.trackingStarken }}</strong></span>
        </div>
        <ng-template #noTracking>
          <div class="dato">
            <ion-icon name="cube-outline"></ion-icon>
            <span>Aún no se despacha: el código de seguimiento aparecerá aquí.</span>
          </div>
        </ng-template>
        <div class="totals">
          <span>Despacho {{ formatCLP(o.flete) }}</span>
          <strong>Total {{ formatCLP(o.total) }}</strong>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .order { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
    .order-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .order-number { font-weight: 900; font-size: 16px; }
    .order-date { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .status {
      flex: none; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      background: rgba(133, 77, 14, 0.3); color: #fde68a;
    }
    .status.shipped { background: rgba(127, 29, 29, 0.3); color: #fca5a5; }
    .status.delivered { background: rgba(6, 95, 70, 0.4); color: #6ee7b7; }
    .line { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid #27272a; font-size: 13px; }
    .line-qty { color: var(--accent-hover); font-weight: 700; min-width: 24px; }
    .line-name { flex: 1; min-width: 0; }
    .line-price { color: var(--text-muted); white-space: nowrap; }
    .order-foot { border-top: 1px solid #27272a; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
    .dato { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--text-muted); line-height: 1.4; }
    .dato ion-icon { flex: none; margin-top: 1px; color: var(--accent-hover); font-size: 15px; }
    .tracking { font-family: monospace; color: var(--text); background: #27272a; padding: 2px 6px; border-radius: 6px; }
    .totals { display: flex; justify-content: space-between; margin-top: 6px; font-size: 13px; color: var(--text-muted); }
    .totals strong { color: var(--text); }
  `],
})
export class OrderCardComponent {
  order = input.required<PedidoCliente>();

  formatCLP = formatCLP;
  formatDate = formatDate;
  statusLabel = orderStatusLabel;

  constructor() {
    addIcons({ 'cube-outline': cubeOutline, 'location-outline': locationOutline });
  }
}
