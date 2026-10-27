import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import type { CierreCaja, CierresCaja, MedioPresencial } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, lockOpenOutline, walletOutline, warningOutline } from 'ionicons/icons';

import { formatCLP } from '../data/models';

const MEDIOS: { codigo: MedioPresencial; corto: string }[] = [
  { codigo: 'EFECTIVO', corto: 'Efectivo' },
  { codigo: 'DEBITO_PRESENCIAL', corto: 'Débito' },
  { codigo: 'CREDITO_PRESENCIAL', corto: 'Crédito' },
  { codigo: 'TRANSFERENCIA', corto: 'Transf.' },
];

const fechaHora = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Cierres de caja del POS para el panel de finanzas del Gerente. */
@Component({
  selector: 'app-cierres-caja',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="card-rockstar caja" aria-labelledby="titulo-cierres">
      <div class="cabeza">
        <ion-icon name="wallet-outline" color="danger" aria-hidden="true"></ion-icon>
        <div>
          <h3 id="titulo-cierres">Cierres de caja</h3>
          <p class="text-faint">Últimos 30 días. Los registran los vendedores desde el POS al contar el efectivo.</p>
        </div>
      </div>

      <div class="totales">
        <div><span>Total cerrado</span><strong>{{ formatCLP(resumen().total) }}</strong><small>{{ resumen().cierres }} cierres · {{ resumen().ventas }} ventas</small></div>
        <div><span>Ventas en efectivo</span><strong>{{ formatCLP(resumen().efectivo) }}</strong><small>El resto: tarjeta y transferencia</small></div>
        <div>
          <span>Diferencias netas</span>
          <strong>{{ signo(resumen().diferencia) }}</strong>
          <small>{{ resumen().descuadradas }} {{ resumen().descuadradas === 1 ? 'caja descuadrada' : 'cajas descuadradas' }}</small>
        </div>
      </div>

      <div class="abiertas" *ngIf="datos.abiertas.length">
        <div class="abierta" *ngFor="let a of datos.abiertas">
          <span class="insignia aviso"><ion-icon name="lock-open-outline" aria-hidden="true"></ion-icon>Caja abierta</span>
          <span><strong>{{ a.vendedor }}</strong> · {{ a.ventas }} {{ a.ventas === 1 ? 'venta' : 'ventas' }} por {{ formatCLP(a.total) }}
            ({{ formatCLP(a.efectivo) }} en efectivo) desde el {{ fecha(a.desde) }}</span>
        </div>
      </div>

      <p class="vacio" *ngIf="datos.cierres.length === 0">No hay cierres en los últimos 30 días.</p>
      <div class="scroll" *ngIf="datos.cierres.length">
        <table>
          <thead>
            <tr>
              <th>Cierre</th><th>Vendedor</th><th class="n">Ventas</th>
              <th class="n" *ngFor="let m of medios">{{ m.corto }}</th>
              <th class="n">Total</th><th class="n">Esperado</th><th class="n">Contado</th><th>Cuadre</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of visibles()">
              <td>{{ fecha(c.fecha) }}<small>N° {{ c.idCierre }}</small></td>
              <td>{{ c.vendedor }}</td>
              <td class="n">{{ c.ventas }}</td>
              <td class="n" *ngFor="let m of medios">{{ montoDe(c, m.codigo) }}</td>
              <td class="n"><strong>{{ formatCLP(c.total) }}</strong></td>
              <td class="n">{{ formatCLP(c.efectivoEsperado) }}</td>
              <td class="n">{{ formatCLP(c.efectivoContado) }}</td>
              <td class="cuadre">
                <span class="insignia" [ngClass]="clase(c)">
                  <ion-icon [name]="icono(c)" aria-hidden="true"></ion-icon>{{ texto(c) }}
                </span>
                <small *ngIf="c.observacion">{{ c.observacion }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="mas" *ngIf="datos.cierres.length > 10" (click)="todos.set(!todos())">
        {{ todos() ? 'Ver solo los 10 últimos' : 'Ver los ' + datos.cierres.length + ' cierres' }}
      </button>
    </section>
  `,
  styles: [`
    .caja { padding: 20px; margin-top: 20px; }
    .cabeza { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
    .cabeza ion-icon { font-size: 22px; margin-top: 2px; }
    h3 { margin: 0; font-size: 16px; }
    .cabeza p { margin: 2px 0 0; font-size: 12px; }
    .totales { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 14px; }
    @media (min-width: 720px) { .totales { grid-template-columns: repeat(3, 1fr); } }
    .totales div { display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid #27272a; border-radius: 12px; }
    .totales span, .totales small { font-size: 12px; color: var(--text-faint); }
    .totales strong { font-size: 20px; }
    .abiertas { display: grid; gap: 8px; margin-bottom: 14px; }
    .abierta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
    .vacio { color: var(--text-muted); font-size: 13px; }
    .scroll { overflow-x: auto; }
    table { width: 100%; min-width: 960px; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    td { padding: 9px 8px; border-bottom: 1px solid #27272a; vertical-align: top; }
    td small { display: block; color: var(--text-faint); font-size: 11px; margin-top: 2px; }
    .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cuadre { min-width: 170px; }
    .mas { margin-top: 10px; background: none; border: none; color: var(--accent-hover); font: inherit; font-size: 13px; cursor: pointer; padding: 4px 0; }
  `],
})
export class CierresCajaComponent {
  private readonly cierres = signal<CierresCaja>({ cierres: [], abiertas: [] });
  @Input({ required: true }) set datos(valor: CierresCaja) {
    this.cierres.set(valor);
  }
  get datos(): CierresCaja {
    return this.cierres();
  }

  readonly medios = MEDIOS;
  readonly formatCLP = formatCLP;
  readonly todos = signal(false);

  readonly visibles = computed(() => (this.todos() ? this.cierres().cierres : this.cierres().cierres.slice(0, 10)));

  readonly resumen = computed(() => {
    const lista = this.cierres().cierres;
    return {
      cierres: lista.length,
      ventas: lista.reduce((s, c) => s + c.ventas, 0),
      total: lista.reduce((s, c) => s + c.total, 0),
      efectivo: lista.reduce((s, c) => s + c.efectivoVentas, 0),
      diferencia: lista.reduce((s, c) => s + c.diferencia, 0),
      descuadradas: lista.filter((c) => c.diferencia !== 0).length,
    };
  });

  constructor() {
    addIcons({
      'alert-circle-outline': alertCircleOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'lock-open-outline': lockOpenOutline,
      'wallet-outline': walletOutline,
      'warning-outline': warningOutline,
    });
  }

  fecha(iso: string): string {
    return fechaHora.format(new Date(iso));
  }

  montoDe(c: CierreCaja, codigo: MedioPresencial): string {
    const total = c.porMedio.find((m) => m.codigo === codigo)?.total ?? 0;
    return total === 0 ? '—' : formatCLP(total);
  }

  signo(diferencia: number): string {
    return diferencia === 0 ? formatCLP(0) : `${diferencia > 0 ? '+' : '−'}${formatCLP(Math.abs(diferencia))}`;
  }

  clase(c: CierreCaja): string {
    return c.diferencia === 0 ? 'bueno' : c.diferencia > 0 ? 'aviso' : 'critico';
  }

  icono(c: CierreCaja): string {
    return c.diferencia === 0 ? 'checkmark-circle-outline' : c.diferencia > 0 ? 'warning-outline' : 'alert-circle-outline';
  }

  texto(c: CierreCaja): string {
    if (c.diferencia === 0) return 'Cuadrada';
    return `${c.diferencia > 0 ? 'Sobran' : 'Faltan'} ${formatCLP(Math.abs(c.diferencia))}`;
  }
}
