import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  statsChartOutline,
  logOutOutline,
  cardOutline,
  warningOutline,
  barChartOutline,
  peopleOutline,
  globeOutline,
  storefrontOutline,
  trendingUpOutline,
  trendingDownOutline,
  speedometerOutline,
  walletOutline,
  calendarOutline,
} from 'ionicons/icons';
import type { BalanceDia, Rol, VentaResumen } from '@rockstar/contracts';
import { errorMessage } from '../../core/api';
import { formatCLP, roleLabel } from '../../data/models';
import { CierresCajaComponent } from '../../components/cierres-caja.component';
import { AdminService, SalesPeriod, periodStart } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { AdvisorChatComponent } from '../../components/advisor-chat.component';
import { InvestmentAdviceComponent } from '../../components/investment-advice.component';

/** Filas que se muestran de una vez en cada lista. */
const PAGE_SIZE = 5;
/** Días que muestra como máximo el gráfico. */
const CHART_MAX_DAYS = 60;
const DAY_MS = 86_400_000;

/** Ingresos y gastos de un día del gráfico; los días sin movimiento van en cero. */
interface DayBar {
  day: string;
  label: string;
  income: number;
  spent: number;
}

/** Fecha de Chile (AAAA-MM-DD) de un instante. */
const chileDay = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

/** Los días de `from` a `to`, ambos incluidos, en formato AAAA-MM-DD. */
function daysBetween(from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const days: string[] = [];
  for (let t = Date.UTC(y!, m! - 1, d!, 12); days.length <= CHART_MAX_DAYS; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push(day);
    if (day >= to) break;
  }
  return days;
}

const income = (d: BalanceDia) => d.ingresoWeb + d.ingresoPos;
const spent = (d: BalanceDia) => d.costoPrendas + d.despacho + d.comisiones + d.mermas;

/** Semáforo de un porcentaje: bien, atención o mal. */
type Level = 'ok' | 'warn' | 'bad';
const levelOf = (percent: number): Level => (percent >= 80 ? 'ok' : percent >= 50 ? 'warn' : 'bad');

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonIcon, IonButton, AdvisorChatComponent, InvestmentAdviceComponent, CierresCajaComponent],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded dash">
        <header class="hero">
          <div>
            <div class="eyebrow"><ion-icon name="stats-chart-outline"></ion-icon> Backoffice</div>
            <h1>Finanzas <span class="amp">&</span> RRHH</h1>
            <p>Vista ejecutiva de ventas, gastos, mermas y permisos.</p>
          </div>
          <div class="hero-actions">
            <div class="periods" role="group" aria-label="Período">
              <button
                *ngFor="let p of periods"
                type="button"
                [class.on]="period() === p.id"
                [attr.aria-pressed]="period() === p.id"
                [disabled]="salesLoading()"
                (click)="setPeriod(p.id)"
              >
                {{ p.label }}
              </button>
            </div>
            <ion-button class="btn-outline logout" (click)="logout()">
              <ion-icon slot="start" name="log-out-outline"></ion-icon>
              Cerrar sesión
            </ion-button>
          </div>
        </header>

        <div class="load-error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <!-- Balance diario: ingresos de ambas tiendas contra los gastos -->
        <section class="panel" aria-labelledby="balance-titulo">
          <div class="panel-head">
            <div>
              <h2 id="balance-titulo">Balance diario</h2>
              <p>Ingresos de ambas tiendas y gastos: costo de las prendas vendidas, despacho, comisiones y mermas.</p>
            </div>
            <span class="badge ok"><ion-icon name="wallet-outline" aria-hidden="true"></ion-icon></span>
          </div>

          <div class="kpis">
            <div class="kpi kpi-income">
              <span class="kpi-label"><ion-icon name="trending-up-outline" aria-hidden="true"></ion-icon> Ingresos</span>
              <strong>{{ formatCLP(totals().income) }}</strong>
              <small>Web {{ formatCLP(totals().web) }} · Tienda física {{ formatCLP(totals().pos) }}</small>
            </div>
            <div class="kpi kpi-spent">
              <span class="kpi-label"><ion-icon name="trending-down-outline" aria-hidden="true"></ion-icon> Gastos</span>
              <strong>{{ formatCLP(totals().spent) }}</strong>
              <small>{{ totals().income ? ((totals().spent / totals().income) * 100).toFixed(0) + '% de los ingresos' : 'Sin ingresos en el período' }}</small>
            </div>
            <div class="kpi kpi-profit" [class.loss]="totals().profit < 0">
              <span class="kpi-label"><ion-icon name="wallet-outline" aria-hidden="true"></ion-icon> Ganancia</span>
              <strong>{{ formatCLP(totals().profit) }}</strong>
              <small>Margen {{ totals().margin.toFixed(0) }}%</small>
            </div>
          </div>

          <div class="expenses" *ngIf="totals().spent > 0">
            <div class="expense-bar" aria-hidden="true">
              <div *ngFor="let e of expenseParts()" [class]="'part ' + e.key" [style.flex-grow]="e.value"></div>
            </div>
            <div class="legend">
              <span *ngFor="let e of expenseParts()"><i [class]="'dot ' + e.key"></i> {{ e.label }} {{ formatCLP(e.value) }}</span>
            </div>
          </div>

          <figure class="chart" *ngIf="chart().length > 1" aria-label="Ingresos y gastos por día">
            <div class="bars">
              <div
                class="bar-col"
                *ngFor="let d of chart(); let i = index"
                [attr.title]="d.label + ': ingresos ' + formatCLP(d.income) + ' · gastos ' + formatCLP(d.spent)"
              >
                <div class="pair">
                  <div class="b income" [style.height.%]="barHeight(d.income)"></div>
                  <div class="b spent" [style.height.%]="barHeight(d.spent)"></div>
                </div>
                <span class="tick" *ngIf="showTick(i)">{{ d.label }}</span>
              </div>
            </div>
            <figcaption class="legend">
              <span><i class="dot income"></i> Ingresos</span>
              <span><i class="dot spent"></i> Gastos</span>
              <span class="legend-note">Por día</span>
            </figcaption>
          </figure>

          <div class="days" *ngIf="admin.balance().length > 0; else noDays">
            <div class="day-row head" aria-hidden="true">
              <span>Día</span><span>Web</span><span>Tienda física</span><span>Gastos</span><span>Ganancia</span>
            </div>
            <div class="day-row" *ngFor="let d of visibleDays()">
              <span class="day-date"><ion-icon name="calendar-outline" aria-hidden="true"></ion-icon> {{ dayLabel(d.fecha) }}</span>
              <span class="web" data-label="Web">{{ formatCLP(d.ingresoWeb) }}</span>
              <span class="pos" data-label="Tienda física">{{ formatCLP(d.ingresoPos) }}</span>
              <span class="spent" data-label="Gastos" [attr.title]="expenseDetail(d)">−{{ formatCLP(spentOf(d)) }}</span>
              <strong class="profit" data-label="Ganancia" [class.loss]="profitOf(d) < 0">{{ formatCLP(profitOf(d)) }}</strong>
            </div>
            <button type="button" class="more" *ngIf="admin.balance().length > visibleDays().length" (click)="shownDays.set(shownDays() + 7)">
              Ver más días ({{ admin.balance().length - visibleDays().length }})
            </button>
          </div>
          <ng-template #noDays>
            <p class="empty">{{ salesLoading() ? 'Cargando…' : 'No hay ventas ni mermas en este período.' }}</p>
          </ng-template>
        </section>

        <!-- Cada tienda por separado -->
        <div class="channels">
          <section class="panel channel web" aria-labelledby="web-titulo">
            <div class="panel-head">
              <div>
                <h2 id="web-titulo">Tienda web <span class="sub">e-commerce</span></h2>
                <p>Compras pagadas en la página, con despacho.</p>
              </div>
              <span class="badge"><ion-icon name="globe-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="mini-kpis">
              <div><span>Vendido</span><strong class="accent">{{ formatCLP(admin.webSales().total) }}</strong></div>
              <div><span>Ventas</span><strong>{{ admin.webSales().count }}</strong></div>
              <div><span>Ticket promedio</span><strong>{{ formatCLP(average(admin.webSales())) }}</strong></div>
              <div><span>Despacho cobrado</span><strong>{{ formatCLP(admin.shippingCharged()) }}</strong></div>
            </div>
            <ng-container *ngTemplateOutlet="saleList; context: { $implicit: webList(), shown: shownWeb, kind: 'web' }"></ng-container>
          </section>

          <section class="panel channel pos" aria-labelledby="pos-titulo">
            <div class="panel-head">
              <div>
                <h2 id="pos-titulo">Tienda física <span class="sub">POS</span></h2>
                <p>Ventas en caja, pagadas en el local.</p>
              </div>
              <span class="badge"><ion-icon name="storefront-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="mini-kpis">
              <div><span>Vendido</span><strong class="accent">{{ formatCLP(admin.storeSales().total) }}</strong></div>
              <div><span>Ventas</span><strong>{{ admin.storeSales().count }}</strong></div>
              <div><span>Ticket promedio</span><strong>{{ formatCLP(average(admin.storeSales())) }}</strong></div>
              <div><span>Unidades</span><strong>{{ posUnits() }}</strong></div>
            </div>
            <div class="methods" *ngIf="posMethods().length > 0">
              <span class="method" *ngFor="let m of posMethods()">{{ m.name }} <strong>{{ formatCLP(m.total) }}</strong></span>
            </div>
            <ng-container *ngTemplateOutlet="saleList; context: { $implicit: posList(), shown: shownPos, kind: 'pos' }"></ng-container>
          </section>
        </div>

        <ng-template #saleList let-sales let-shown="shown" let-kind="kind">
          <div class="sales-list" *ngIf="sales.length > 0; else noSales">
            <div class="sale-row" *ngFor="let v of sales.slice(0, shown()); trackBy: trackSale">
              <div class="sale-main">
                <div class="sale-title">Venta #{{ v.idVenta }} · {{ who(v) }}</div>
                <div class="sale-meta">
                  {{ when(v.fecha) }} · {{ v.unidades }} {{ v.unidades === 1 ? 'unidad' : 'unidades' }}<ng-container *ngIf="v.medioPago">
                    · {{ v.medioPago }}</ng-container>
                </div>
              </div>
              <strong class="sale-total">{{ formatCLP(v.total) }}</strong>
            </div>
            <button type="button" class="more" *ngIf="sales.length > shown()" (click)="shown.set(shown() + PAGE_SIZE)">
              Ver más ({{ sales.length - shown() }})
            </button>
          </div>
          <ng-template #noSales>
            <p class="empty">{{ salesLoading() ? 'Cargando…' : (kind === 'web' ? 'No hay ventas web en este período.' : 'No hay ventas en la tienda física en este período.') }}</p>
          </ng-template>
        </ng-template>

        <div class="stats">
          <div class="stat-card info">
            <span class="badge"><ion-icon name="card-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Ventas proyectadas</div>
            <div class="stat-value">{{ formatCLP(admin.projectedSales()) }}</div>
            <div class="stat-note">Valor de venta del stock actual con precio</div>
          </div>
          <div class="stat-card warn">
            <span class="badge"><ion-icon name="warning-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Pérdidas por mermas</div>
            <div class="stat-value">{{ formatCLP(admin.lossValue()) }}</div>
            <div class="stat-note">Valor de venta de las prendas dadas de baja</div>
          </div>
          <div class="stat-card ok">
            <span class="badge"><ion-icon name="speedometer-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Eficiencia operativa</div>
            <div class="stat-value">{{ admin.efficiency().toFixed(1) }}%</div>
            <div class="stat-note">Impacto neto de pérdidas</div>
          </div>
        </div>

        <app-investment-advice></app-investment-advice>
        <app-advisor-chat></app-advisor-chat>

        <a class="modelo-card" routerLink="/inversion">
          <span class="badge violet"><ion-icon name="trending-up-outline" aria-hidden="true"></ion-icon></span>
          <div>
            <h3>Pronóstico de demanda y compras</h3>
            <p>
              Modelo predictivo con las ventas del e-commerce y de la tienda física: qué prenda y talla comprar y cuánto,
              qué no reponer y qué bandas y categorías están creciendo.
            </p>
          </div>
          <span class="modelo-ir">Ver pronóstico →</span>
        </a>

        <app-cierres-caja *ngIf="admin.cierres() as cierres" [datos]="cierres"></app-cierres-caja>

        <div class="grid-2">
          <section class="panel" aria-labelledby="resumen-titulo">
            <div class="panel-head">
              <div>
                <h2 id="resumen-titulo">Resumen operativo</h2>
                <p>Indicadores calculados con los datos del sistema.</p>
              </div>
              <span class="badge info"><ion-icon name="bar-chart-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="progress-list">
              <div class="progress" *ngFor="let m of indicators()" [ngClass]="m.level">
                <div class="progress-head"><span>{{ m.label }}</span><strong>{{ m.value.toFixed(0) }}%</strong></div>
                <div class="track"><div class="fill" [style.width.%]="m.value"></div></div>
              </div>
            </div>
          </section>

          <section class="panel" aria-labelledby="usuarios-titulo">
            <div class="panel-head">
              <div>
                <h2 id="usuarios-titulo">Usuarios & roles</h2>
                <p>Cuentas del personal.</p>
              </div>
              <span class="badge violet"><ion-icon name="people-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="user-list">
              <div class="user-row" *ngFor="let u of admin.staff()" [ngClass]="roleClass(u.rol)">
                <span class="avatar" aria-hidden="true">{{ initials(u.nombre) }}</span>
                <div class="user-main">
                  <div class="user-name">{{ u.nombre }}{{ u.activo ? '' : ' · desactivada' }}</div>
                  <div class="user-email">{{ u.email }}</div>
                </div>
                <span class="user-role">{{ roleLabel(u.rol) }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --c-web: #f43f5e;
      --c-pos: #f59e0b;
      --c-info: #38bdf8;
      --c-warn: #fb923c;
      --c-ok: #34d399;
      --c-bad: #f43f5e;
      --c-violet: #a78bfa;
      --c-income: #34d399;
      --c-spent: #fb923c;
      --panel: #131316;
      --panel-line: #26262b;
    }
    .dash { max-width: 1200px; margin: 0 auto; }

    .hero {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px;
      margin-bottom: 20px; padding: 24px; border-radius: 20px;
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(244, 63, 94, 0.28), transparent 55%),
        radial-gradient(120% 140% at 100% 100%, rgba(245, 158, 11, 0.18), transparent 55%),
        #111114;
      border: 1px solid var(--panel-line);
    }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 6px;
      color: #fda4af; font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase;
    }
    .hero h1 { margin: 8px 0 6px; font-size: 30px; font-weight: 900; letter-spacing: -0.01em; }
    .hero .amp { color: var(--c-pos); }
    .hero p { margin: 0; color: var(--text-muted); font-size: 14px; }
    .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .logout { margin: 0; }

    .load-error { text-align: center; padding: 16px; color: var(--text-muted); }

    .panel { background: var(--panel); border: 1px solid var(--panel-line); border-radius: 18px; padding: 20px; margin-bottom: 20px; }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .panel-head h2 { margin: 0; font-size: 17px; font-weight: 800; }
    .panel-head h2 .sub { margin-left: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c, var(--text-faint)); }
    .panel-head p { margin: 4px 0 0; font-size: 12px; color: var(--text-faint); }

    .badge {
      --c: var(--text-muted);
      flex: none; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 9px;
      font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent);
    }
    .badge.info { --c: var(--c-info); }
    .badge.violet { --c: var(--c-violet); }
    .badge.ok { --c: var(--c-ok); }

    .periods { display: flex; gap: 4px; padding: 4px; background: #0b0b0d; border: 1px solid var(--panel-line); border-radius: 12px; }
    .periods button {
      padding: 7px 12px; border: none; border-radius: 8px; background: transparent;
      color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .periods button:hover { color: #fff; }
    .periods button.on { background: linear-gradient(135deg, #e11d48, #f97316); color: #fff; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35); }
    .periods button:focus-visible, .more:focus-visible { outline: 2px solid var(--c-pos); outline-offset: 2px; }

    .kpis { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 768px) { .kpis { grid-template-columns: 1fr 1fr 1.2fr; } }
    .kpi {
      display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 14px;
      background: color-mix(in srgb, var(--c) 8%, #0e0e11);
      border: 1px solid color-mix(in srgb, var(--c) 32%, transparent);
    }
    .kpi-income { --c: var(--c-income); }
    .kpi-spent { --c: var(--c-spent); }
    .kpi-label {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted);
    }
    .kpi-label ion-icon { color: var(--c); font-size: 15px; }
    .kpi strong { font-size: 24px; font-weight: 900; color: var(--c); }
    .kpi small { font-size: 11px; color: var(--text-faint); }
    .kpi-profit {
      --c: #fff; border: none;
      background: linear-gradient(135deg, #047857 0%, #059669 45%, #10b981 100%);
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.22);
    }
    .kpi-profit.loss { background: linear-gradient(135deg, #9f1239, #e11d48); box-shadow: 0 10px 30px rgba(225, 29, 72, 0.25); }
    .kpi-profit .kpi-label, .kpi-profit small, .kpi-profit .kpi-label ion-icon { color: rgba(255, 255, 255, 0.88); }
    .kpi-profit strong { font-size: 30px; }

    .expenses { margin-top: 16px; }
    .expense-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: #0b0b0d; }
    .part { flex-basis: 0; }
    .part.garments, .dot.garments { background: #fb923c; }
    .part.shipping, .dot.shipping { background: #38bdf8; }
    .part.fees, .dot.fees { background: #a78bfa; }
    .part.losses, .dot.losses { background: #f43f5e; }

    .chart { margin: 18px 0 0; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding: 0 2px; border-bottom: 1px solid var(--panel-line); }
    .bar-col { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
    .pair { width: 100%; height: 100%; display: flex; align-items: flex-end; gap: 1px; }
    .b { flex: 1; border-radius: 3px 3px 0 0; transition: height 0.4s; }
    .b.income { background: linear-gradient(180deg, #6ee7b7, var(--c-income)); }
    .b.spent { background: linear-gradient(180deg, #fdba74, var(--c-spent)); }
    .bar-col:hover .b { filter: brightness(1.25); }
    .tick {
      position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%);
      font-size: 9px; color: var(--text-faint); white-space: nowrap;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 11px; color: var(--text-muted); }
    .chart .legend { margin-top: 22px; }
    .legend-note { margin-left: auto; color: var(--text-faint); }
    .dot { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 50%; }
    .dot.income { background: var(--c-income); }
    .dot.spent { background: var(--c-spent); }

    .days { display: flex; flex-direction: column; gap: 6px; margin-top: 18px; }
    .day-row {
      display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr; align-items: center; gap: 8px;
      padding: 10px 12px; border-radius: 10px; background: #0e0e11; border: 1px solid var(--panel-line);
      font-size: 13px; text-align: right;
    }
    .day-row > :first-child { text-align: left; }
    .day-row.head { background: transparent; border: none; padding: 0 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
    .day-date { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
    .day-date ion-icon { color: var(--text-faint); }
    .day-row .web { color: #fda4af; }
    .day-row .pos { color: #fcd34d; }
    .day-row .spent { color: var(--c-spent); }
    .day-row .profit { color: var(--c-income); }
    .day-row .profit.loss { color: var(--c-bad); }
    @media (max-width: 640px) {
      .day-row.head { display: none; }
      .day-row { grid-template-columns: 1fr 1fr; text-align: left; }
      .day-row > :first-child { grid-column: 1 / -1; }
      .day-row [data-label]::before { content: attr(data-label); display: block; font-size: 10px; color: var(--text-faint); }
    }

    .channels { display: grid; grid-template-columns: 1fr; gap: 0 20px; }
    @media (min-width: 1024px) { .channels { grid-template-columns: 1fr 1fr; } }
    .channel.web { --c: var(--c-web); border-top: 3px solid var(--c-web); }
    .channel.pos { --c: var(--c-pos); border-top: 3px solid var(--c-pos); }
    .channel .badge { --c: inherit; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
    .mini-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    @media (min-width: 480px) { .mini-kpis { grid-template-columns: repeat(4, 1fr); } }
    .mini-kpis > div { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: #0e0e11; border: 1px solid var(--panel-line); }
    .mini-kpis span { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
    .mini-kpis strong { font-size: 15px; font-weight: 800; }
    .mini-kpis strong.accent { color: var(--c); font-size: 17px; }
    .methods { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .method {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; color: var(--text-muted);
      background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    }
    .method strong { color: var(--c); margin-left: 4px; }

    .sales-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .sale-row {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
      background: #0e0e11; border: 1px solid var(--panel-line); border-left: 3px solid var(--c);
      transition: background 0.15s;
    }
    .sale-row:hover { background: #151519; }
    .sale-main { flex: 1; min-width: 0; }
    .sale-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sale-meta { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .sale-total { flex: none; font-size: 14px; color: #fff; }
    .more {
      align-self: center; margin-top: 4px; padding: 8px 14px; background: transparent;
      border: 1px solid var(--panel-line); border-radius: 10px; color: var(--text-muted); font: inherit; font-size: 12px; cursor: pointer;
    }
    .more:hover { border-color: var(--c-pos); color: #fff; }
    .empty { margin: 16px 0 0; font-size: 13px; color: var(--text-faint); }

    .stats { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
    @media (min-width: 768px) { .stats { grid-template-columns: repeat(3, 1fr); } }
    .stat-card {
      position: relative; overflow: hidden; padding: 18px; border-radius: 16px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--c) 14%, #111114) 0%, #111114 60%);
      border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
    }
    .stat-card.info { --c: var(--c-info); }
    .stat-card.warn { --c: var(--c-warn); }
    .stat-card.ok { --c: var(--c-ok); }
    .stat-card .badge { position: absolute; top: 16px; right: 16px; --c: inherit; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
    .stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
    .stat-value { font-size: 26px; font-weight: 900; margin: 14px 0 4px; color: var(--c); }
    .stat-note { font-size: 11px; color: var(--text-faint); }

    .modelo-card {
      display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 20px; margin-bottom: 20px;
      border-radius: 18px; color: var(--text); text-decoration: none;
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(167, 139, 250, 0.22), transparent 60%),
        var(--panel);
      border: 1px solid color-mix(in srgb, var(--c-violet) 35%, transparent);
      transition: border-color 0.15s, transform 0.15s;
    }
    .modelo-card:hover, .modelo-card:focus-visible { border-color: var(--c-violet); transform: translateY(-1px); }
    .modelo-card:focus-visible { outline: 2px solid var(--c-violet); outline-offset: 2px; }
    .modelo-card .badge { width: 40px; height: 40px; font-size: 20px; border-radius: 12px; }
    .modelo-card > div { flex: 1 1 280px; }
    .modelo-card h3 { margin: 0 0 4px; font-size: 17px; font-weight: 800; }
    .modelo-card p { margin: 0; font-size: 13px; color: var(--text-faint); }
    .modelo-ir { font-size: 13px; font-weight: 800; color: var(--c-violet); white-space: nowrap; }

    .grid-2 { display: grid; grid-template-columns: 1fr; gap: 0 20px; }
    @media (min-width: 1024px) { .grid-2 { grid-template-columns: 3fr 2fr; } }

    .progress-list { display: flex; flex-direction: column; gap: 18px; }
    .progress { --c: var(--c-ok); }
    .progress.warn { --c: var(--c-pos); }
    .progress.bad { --c: var(--c-bad); }
    .progress-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-bottom: 7px; color: var(--text-muted); }
    .progress-head strong { color: var(--c); font-size: 13px; }
    .track { height: 10px; background: #0b0b0d; border: 1px solid var(--panel-line); border-radius: 999px; overflow: hidden; }
    .fill {
      height: 100%; border-radius: 999px; transition: width 0.5s;
      background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, transparent), var(--c));
      box-shadow: 0 0 12px color-mix(in srgb, var(--c) 50%, transparent);
    }

    .user-list { display: flex; flex-direction: column; gap: 8px; }
    .user-row {
      --c: var(--text-muted);
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
      background: #0e0e11; border: 1px solid var(--panel-line);
    }
    .user-row.gerente { --c: var(--c-violet); }
    .user-row.bodega { --c: var(--c-info); }
    .user-row.vendedor { --c: var(--c-pos); }
    .avatar {
      flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
      background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c);
      border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
      font-size: 13px; font-weight: 800;
    }
    .user-main { flex: 1; min-width: 0; }
    .user-name { font-size: 13px; font-weight: 600; }
    .user-email { font-size: 11px; color: var(--text-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user-role {
      flex: none; padding: 3px 9px; border-radius: 999px; font-size: 10px; font-weight: 800;
      background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
    }

    @media (max-width: 480px) {
      .hero { padding: 18px; }
      .hero h1 { font-size: 24px; }
      .kpi-profit strong { font-size: 26px; }
      .bars { height: 110px; gap: 2px; }
    }
  `],
})
export class AdminPage {
  admin = inject(AdminService);
  auth = inject(AuthService);
  cart = inject(CartService);
  router = inject(Router);

  formatCLP = formatCLP;
  roleLabel = roleLabel;
  readonly PAGE_SIZE = PAGE_SIZE;
  loading = signal(false);
  error = signal('');

  readonly periods: { id: SalesPeriod; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: '7 días' },
    { id: 'month', label: '30 días' },
    { id: 'all', label: 'Todo' },
  ];
  period = signal<SalesPeriod>('month');
  salesLoading = signal(false);

  totals = this.admin.balanceTotals;
  shownDays = signal(7);
  shownWeb = signal(PAGE_SIZE);
  shownPos = signal(PAGE_SIZE);
  visibleDays = computed(() => this.admin.balance().slice(0, this.shownDays()));
  webList = computed(() => this.admin.sales().filter((s) => s.canal === 'ECOMMERCE'));
  posList = computed(() => this.admin.sales().filter((s) => s.canal === 'POS'));
  posUnits = computed(() => this.posList().reduce((sum, s) => sum + s.unidades, 0));

  /** Lo vendido en la tienda física por medio de pago, de mayor a menor. */
  posMethods = computed(() => {
    const byMethod = new Map<string, number>();
    for (const s of this.posList()) {
      const name = s.medioPago ?? 'Sin medio';
      byMethod.set(name, (byMethod.get(name) ?? 0) + s.total);
    }
    return [...byMethod].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  });

  /** Los gastos del período por tipo, sin los que están en cero. */
  expenseParts = computed(() => {
    const e = this.totals().expenses;
    return [
      { key: 'garments', label: 'Prendas vendidas', value: e.garments },
      { key: 'shipping', label: 'Despacho', value: e.shipping },
      { key: 'fees', label: 'Comisiones', value: e.fees },
      { key: 'losses', label: 'Mermas', value: e.losses },
    ].filter((p) => p.value > 0);
  });

  /** Ingresos y gastos por día del período, con los días sin movimiento en cero. Vacío para "Hoy". */
  chart = computed<DayBar[]>(() => {
    const balance = this.admin.balance();
    if (this.period() === 'today' || balance.length === 0) {
      return [];
    }
    const today = chileDay(new Date());
    const oldest = balance[balance.length - 1]!.fecha;
    const limit = chileDay(new Date(Date.now() - (CHART_MAX_DAYS - 1) * DAY_MS));
    const from = [periodStart(this.period()) ?? oldest, limit].sort().pop()!;
    const byDay = new Map(balance.map((d) => [d.fecha, d]));
    return daysBetween(from, today).map((day) => {
      const d = byDay.get(day);
      return { day, label: `${day.slice(8, 10)}/${day.slice(5, 7)}`, income: d ? income(d) : 0, spent: d ? spent(d) : 0 };
    });
  });
  private readonly chartMax = computed(() => Math.max(1, ...this.chart().map((d) => Math.max(d.income, d.spent))));

  /** Indicadores del resumen operativo, con su color de semáforo. */
  indicators = computed(() =>
    [
      { label: 'Eficiencia de inventario', value: this.admin.efficiency() },
      { label: 'Nivel de disponibilidad · prendas con unidades para vender', value: this.admin.availability() },
      { label: 'Cumplimiento logístico · pedidos ya despachados', value: this.admin.fulfilment() },
    ].map((m) => ({ ...m, level: levelOf(m.value) })),
  );

  constructor() {
    addIcons({
      'stats-chart-outline': statsChartOutline,
      'log-out-outline': logOutOutline,
      'card-outline': cardOutline,
      'warning-outline': warningOutline,
      'bar-chart-outline': barChartOutline,
      'people-outline': peopleOutline,
      'globe-outline': globeOutline,
      'storefront-outline': storefrontOutline,
      'trending-up-outline': trendingUpOutline,
      'trending-down-outline': trendingDownOutline,
      'speedometer-outline': speedometerOutline,
      'wallet-outline': walletOutline,
      'calendar-outline': calendarOutline,
    });
    // Las cifras y las cuentas del personal son del Gerente; el backend rechaza a los demás roles.
    if (this.auth.rol() !== 'GERENTE') {
      this.router.navigateByUrl(this.auth.isAdmin() ? '/warehouse' : '/entry');
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.admin.loadFinance(this.period());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async setPeriod(period: SalesPeriod) {
    if (period === this.period()) return;
    this.period.set(period);
    this.shownDays.set(7);
    this.shownWeb.set(PAGE_SIZE);
    this.shownPos.set(PAGE_SIZE);
    this.salesLoading.set(true);
    this.error.set('');
    try {
      await this.admin.loadSales(period);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.salesLoading.set(false);
    }
  }

  spentOf = spent;
  profitOf = (d: BalanceDia) => income(d) - spent(d);

  expenseDetail(d: BalanceDia): string {
    return `Prendas ${formatCLP(d.costoPrendas)} · Despacho ${formatCLP(d.despacho)} · Comisiones ${formatCLP(d.comisiones)} · Mermas ${formatCLP(d.mermas)}`;
  }

  dayLabel(fecha: string): string {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString('es-CL', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  average(totals: { total: number; count: number }): number {
    return totals.count ? Math.round(totals.total / totals.count) : 0;
  }

  /** Alto de una barra del gráfico; un valor distinto de cero siempre se alcanza a ver. */
  barHeight(value: number): number {
    return value === 0 ? 0 : Math.max(3, (value / this.chartMax()) * 100);
  }

  /** Muestra algunas fechas bajo el gráfico, sin que se encimen. */
  showTick(index: number): boolean {
    const n = this.chart().length;
    const step = Math.ceil(n / 7);
    return index === n - 1 || (index % step === 0 && n - 1 - index >= step / 2);
  }

  /** En la web la venta es del cliente; en el POS se muestra además quién la registró. */
  who(sale: VentaResumen): string {
    if (sale.canal === 'POS') {
      return sale.cliente ? `${sale.cliente} (atendió ${sale.vendedor})` : `Atendió ${sale.vendedor}`;
    }
    return sale.cliente ?? 'Cliente';
  }

  when(fecha: string): string {
    return new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' });
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  }

  roleClass(rol: Rol): string {
    return rol.toLowerCase();
  }

  trackSale(_: number, sale: VentaResumen) {
    return sale.idVenta;
  }

  logout() {
    this.auth.logout();
    this.cart.reset();
    this.router.navigateByUrl('/entry');
  }
}
