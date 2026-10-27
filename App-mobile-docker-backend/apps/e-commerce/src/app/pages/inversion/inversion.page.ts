import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import type { Confianza, Prioridad, RecomendacionesInversion, Tendencia } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  arrowDownOutline,
  arrowUpOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  removeOutline,
  trendingUpOutline,
  warningOutline,
} from 'ionicons/icons';

import { GraficoPronosticoComponent } from '../../components/grafico-pronostico.component';
import { errorMessage } from '../../core/api';
import { formatCLP } from '../../data/models';
import { AuthService } from '../../services/auth.service';
import { InversionService } from '../../services/inversion.service';

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const porcentaje = (fraccion: number) => `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(fraccion * 100)}%`;
const fechaCorta = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const PRIORIDAD: Record<Prioridad, { texto: string; icono: string; clase: string }> = {
  URGENTE: { texto: 'Urgente', icono: 'alert-circle-outline', clase: 'critico' },
  ALTA: { texto: 'Alta', icono: 'warning-outline', clase: 'serio' },
  MEDIA: { texto: 'Media', icono: 'information-circle-outline', clase: 'aviso' },
};

const CONFIANZA: Record<Confianza, { texto: string; icono: string; clase: string }> = {
  ALTA: { texto: 'Alta', icono: 'checkmark-circle-outline', clase: 'bueno' },
  MEDIA: { texto: 'Media', icono: 'information-circle-outline', clase: 'aviso' },
  BAJA: { texto: 'Baja', icono: 'warning-outline', clase: 'serio' },
};

const METODO: Record<string, string | undefined> = {
  SES: 'Suavizado exponencial simple',
  SBA: 'Syntetos-Boylan (Croston corregido)',
  HOLT: 'Holt con tendencia amortiguada',
  MEDIA_MOVIL: 'Media móvil de 8 semanas',
  SIN_VENTAS: 'Sin ventas',
};

/**
 * Modelo predictivo de inversión (Gerente): qué comprar y cuánto, qué no reponer y dónde
 * crece la demanda, con lo vendido en el e-commerce y en la tienda física.
 */
@Component({
  selector: 'app-inversion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonButton, IonIcon, IonSpinner, GraficoPronosticoComponent],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded pagina">
        <a routerLink="/admin" class="volver"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> Finanzas & RRHH</a>
        <div class="page-title">
          <div class="section-title"><ion-icon name="trending-up-outline"></ion-icon> Modelo predictivo</div>
          <h1>Pronóstico de demanda y compras</h1>
          <p class="text-muted">
            Pronostica la demanda de cada prenda con lo vendido en el e-commerce y en la tienda física, y la cruza con el
            stock, el precio y el costo para decir qué comprar, qué no reponer y dónde está creciendo la demanda.
          </p>
        </div>

        <form class="filtros" (ngSubmit)="calcular()" aria-label="Parámetros del modelo">
          <label>
            <span>Horizonte</span>
            <select name="horizonte" [(ngModel)]="horizonte">
              <option *ngFor="let h of horizontes" [ngValue]="h">{{ h }} semanas</option>
            </select>
          </label>
          <label>
            <span>Reposición tarda</span>
            <select name="reposicion" [(ngModel)]="reposicion">
              <option *ngFor="let r of reposiciones" [ngValue]="r">{{ r }} {{ r === 1 ? 'semana' : 'semanas' }}</option>
            </select>
          </label>
          <label>
            <span>Presupuesto (CLP)</span>
            <input name="presupuesto" type="number" min="1" step="1000" inputmode="numeric" placeholder="Sin tope" [(ngModel)]="presupuesto" />
          </label>
          <ion-button type="submit" class="btn-rockstar" [disabled]="cargando()">
            <ion-spinner *ngIf="cargando()" name="crescent" slot="start"></ion-spinner>
            Calcular
          </ion-button>
        </form>

        <div class="error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" (click)="calcular()">Reintentar</ion-button>
        </div>

        <p class="cargando-inicial" *ngIf="!r() && cargando()">Entrenando el modelo con las ventas…</p>

        <div *ngIf="r() as r" class="contenido" [class.recalculando]="cargando()">
          <section class="modelo-banda" aria-label="Estado del modelo">
            <span class="insignia" [ngClass]="confianza[r.modelo.confianza].clase">
              <ion-icon [name]="confianza[r.modelo.confianza].icono" aria-hidden="true"></ion-icon>
              Confianza {{ confianza[r.modelo.confianza].texto | lowercase }}
            </span>
            <span>
              {{ numero.format(r.modelo.ventasAnalizadas) }} ventas · {{ numero.format(r.modelo.unidadesAnalizadas) }} unidades ·
              {{ r.parametros.semanasHistoria }} semanas de historia
            </span>
            <span *ngIf="r.modelo.validacion as v">
              Error en las últimas {{ v.semanas }} semanas: {{ porcentaje(v.wapeModelo) }}
              (promedio simple: {{ porcentaje(v.wapeIngenuo) }})
            </span>
          </section>

          <ul class="avisos" *ngIf="r.modelo.avisos.length">
            <li *ngFor="let aviso of r.modelo.avisos"><ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon>{{ aviso }}</li>
          </ul>

          <section class="tiles" aria-label="Resumen de la inversión">
            <div class="tile">
              <div class="tile-label">Inversión sugerida</div>
              <div class="tile-valor">{{ formatCLP(r.resumen.inversionSugerida) }}</div>
              <div class="tile-nota">
                {{ r.parametros.presupuesto === null ? 'Todo lo que conviene comprar' : 'De ' + formatCLP(r.parametros.presupuesto) + ' disponibles' }}
              </div>
            </div>
            <div class="tile">
              <div class="tile-label">Margen esperado</div>
              <div class="tile-valor">{{ formatCLP(r.resumen.margenEsperado) }}</div>
              <div class="tile-nota">Ventas de lo comprado en {{ r.parametros.horizonteSemanas }} semanas: {{ formatCLP(r.resumen.ingresoEsperado) }}</div>
            </div>
            <div class="tile">
              <div class="tile-label">Retorno esperado (ROI)</div>
              <div class="tile-valor">{{ r.resumen.roiEsperado === null ? 'Sin datos' : porcentaje(r.resumen.roiEsperado) }}</div>
              <div class="tile-nota">Margen esperado sobre la inversión, en el horizonte</div>
            </div>
            <div class="tile">
              <div class="tile-label">Capital inmovilizado</div>
              <div class="tile-valor">{{ formatCLP(r.resumen.capitalInmovilizado) }}</div>
              <div class="tile-nota">Costo del stock que no se espera vender</div>
            </div>
          </section>

          <section class="card-rockstar tarjeta">
            <div class="tarjeta-cabeza">
              <div>
                <h2>Ventas por semana y pronóstico</h2>
                <p class="text-faint">Unidades de todas las prendas. Semanas completas; la del pronóstico parte el lunes {{ inicioPronostico(r) }}.</p>
              </div>
              <button type="button" class="enlace" (click)="verTabla.set(!verTabla())" [attr.aria-expanded]="verTabla()">
                {{ verTabla() ? 'Ocultar tabla' : 'Ver como tabla' }}
              </button>
            </div>
            <app-grafico-pronostico [datos]="r.serieSemanal"></app-grafico-pronostico>
            <div class="tabla-scroll" *ngIf="verTabla()">
              <table class="tabla">
                <thead><tr><th>Semana</th><th class="num">E-commerce</th><th class="num">Tienda</th><th class="num">Pronóstico</th><th class="num">Rango probable</th></tr></thead>
                <tbody>
                  <tr *ngFor="let p of r.serieSemanal">
                    <td>{{ fecha(p.semana) }}</td>
                    <td class="num">{{ p.ecommerce ?? '—' }}</td>
                    <td class="num">{{ p.pos ?? '—' }}</td>
                    <td class="num">{{ p.pronostico === null ? '—' : numero.format(p.pronostico) }}</td>
                    <td class="num">{{ p.pronostico === null ? '—' : numero.format(p.minimo ?? 0) + '–' + numero.format(p.maximo ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="card-rockstar tarjeta">
            <div class="tarjeta-cabeza">
              <div>
                <h2>Qué comprar</h2>
                <p class="text-faint">
                  Cubre la demanda de {{ r.parametros.horizonteSemanas }} semanas más un stock de seguridad para un
                  {{ porcentaje(r.parametros.nivelServicio) }} de probabilidad de no quedar sin stock mientras llega la reposición.
                  Ordenado por urgencia y margen.
                </p>
              </div>
            </div>
            <p class="vacio" *ngIf="r.comprar.length === 0">Con el stock actual no hace falta comprar nada en este horizonte.</p>
            <div class="tabla-scroll" *ngIf="r.comprar.length">
              <table class="tabla compras">
                <thead>
                  <tr>
                    <th>Prioridad</th>
                    <th>Prenda</th>
                    <th>Dónde va</th>
                    <th class="num">Proyectado</th>
                    <th class="num">Disponible</th>
                    <th class="num">Comprar</th>
                    <th class="num">Inversión</th>
                    <th class="num">Margen esperado</th>
                    <th class="num">ROI</th>
                    <th>Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let c of verTodas() ? r.comprar : r.comprar.slice(0, 10)" [class.fuera]="!c.dentroDelPresupuesto">
                    <td>
                      <span class="insignia" [ngClass]="prioridad[c.prioridad].clase">
                        <ion-icon [name]="prioridad[c.prioridad].icono" aria-hidden="true"></ion-icon>{{ prioridad[c.prioridad].texto }}
                      </span>
                    </td>
                    <td class="prenda">
                      <strong>{{ c.producto }}</strong>
                      <span>{{ c.talla }} · {{ c.color }} · {{ c.sku }}</span>
                      <small>{{ c.motivo }}</small>
                      <small *ngIf="!c.dentroDelPresupuesto" class="etiqueta-fuera">Fuera del presupuesto</small>
                    </td>
                    <td>
                      {{ c.ubicacionSugerida === 'SALA_VENTAS' ? 'Sala de ventas' : 'Bodega' }}
                      <small class="bloque">{{ c.canalPrincipal === 'POS' ? 'Se vende más en tienda' : 'Se vende más en la web' }}</small>
                    </td>
                    <td class="num">{{ numero.format(c.demandaProyectada) }}</td>
                    <td class="num">{{ c.disponible }}</td>
                    <td class="num"><strong>{{ c.cantidadSugerida }}</strong></td>
                    <td class="num">
                      {{ formatCLP(c.inversion) }}<span *ngIf="c.costoEstimado" class="estimado" title="Costo estimado: el producto no tiene costo de compra registrado">*</span>
                    </td>
                    <td class="num">{{ formatCLP(c.margenEsperado) }}</td>
                    <td class="num">{{ porcentaje(c.roi) }}</td>
                    <td>
                      <span class="insignia" [ngClass]="confianza[c.confianza].clase">
                        <ion-icon [name]="confianza[c.confianza].icono" aria-hidden="true"></ion-icon>{{ confianza[c.confianza].texto }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button type="button" class="enlace mas" *ngIf="r.comprar.length > 10" (click)="verTodas.set(!verTodas())">
              {{ verTodas() ? "Ver solo las 10 primeras" : "Ver las " + (r.comprar.length - 10) + " compras restantes" }}
            </button>
            <p class="nota" *ngIf="tieneEstimados(r)">* Costo estimado: el producto no tiene costo de compra registrado.</p>
          </section>

          <div class="dos-columnas">
            <section class="card-rockstar tarjeta">
              <h2>Tendencias por banda</h2>
              <p class="text-faint">Últimas 8 semanas contra las 8 anteriores.</p>
              <ng-container *ngTemplateOutlet="listaTendencias; context: { $implicit: r.tendencias.bandas }"></ng-container>
            </section>
            <section class="card-rockstar tarjeta">
              <h2>Tendencias por categoría</h2>
              <p class="text-faint">Últimas 8 semanas contra las 8 anteriores.</p>
              <ng-container *ngTemplateOutlet="listaTendencias; context: { $implicit: r.tendencias.categorias }"></ng-container>
            </section>
          </div>

          <section class="card-rockstar tarjeta">
            <h2>Dónde se vende cada categoría</h2>
            <p class="text-faint">Parte de las unidades de las últimas 26 semanas vendida en cada canal. Decide si el stock nuevo va a la sala de ventas o a la bodega.</p>
            <ul class="leyenda-canal" aria-label="Leyenda">
              <li><span class="clave web"></span>E-commerce</li>
              <li><span class="clave tienda"></span>Tienda física</li>
            </ul>
            <div class="mezcla" *ngFor="let m of r.canales">
              <div class="mezcla-cabeza">
                <strong>{{ m.categoria }}</strong>
                <span>{{ porcentaje(m.ecommerce) }} web · {{ porcentaje(1 - m.ecommerce) }} tienda · {{ numero.format(m.unidades) }} u.</span>
              </div>
              <div class="barra-mezcla" role="img" [attr.aria-label]="m.categoria + ': ' + porcentaje(m.ecommerce) + ' en el e-commerce y ' + porcentaje(1 - m.ecommerce) + ' en la tienda'">
                <span class="web" [style.flex-grow]="m.ecommerce" [title]="'E-commerce: ' + porcentaje(m.ecommerce)"></span>
                <span class="tienda" [style.flex-grow]="1 - m.ecommerce" [title]="'Tienda física: ' + porcentaje(1 - m.ecommerce)"></span>
              </div>
              <small>{{ m.recomendacion }}</small>
            </div>
          </section>

          <section class="card-rockstar tarjeta">
            <h2>No reinvertir</h2>
            <p class="text-faint">Stock que el modelo no espera vender en {{ r.parametros.horizonteSemanas }} semanas: no conviene sumar más capital ahí.</p>
            <p class="vacio" *ngIf="r.noReinvertir.length === 0">No hay stock inmovilizado.</p>
            <div class="tabla-scroll" *ngIf="r.noReinvertir.length">
              <table class="tabla">
                <thead>
                  <tr><th>Prenda</th><th class="num">Disponible</th><th class="num">Vendidas en 12 sem.</th><th class="num">Proyectado</th><th class="num">Capital inmovilizado</th><th>Sugerencia</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let p of r.noReinvertir">
                    <td class="prenda"><strong>{{ p.producto }}</strong><span>{{ p.talla }} · {{ p.color }} · {{ p.sku }}</span></td>
                    <td class="num">{{ p.disponible }}</td>
                    <td class="num">{{ p.vendidas12Semanas }}</td>
                    <td class="num">{{ numero.format(p.demandaProyectada) }}</td>
                    <td class="num">{{ formatCLP(p.capitalInmovilizado) }}</td>
                    <td class="sugerencia">{{ p.sugerencia }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="card-rockstar tarjeta como-funciona">
            <h2>Cómo funciona el modelo</h2>
            <p>
              Cada prenda, por talla y color, tiene una serie de unidades vendidas por semana sumando ambos canales. Si vende
              casi todas las semanas su demanda es <strong>regular</strong>; si pasan semanas sin ventas es
              <strong>intermitente</strong> (criterio de Syntetos y Boylan: intervalo medio entre ventas de 1,32 semanas o más).
            </p>
            <p>
              Para cada tipo se prueban cuatro métodos pronosticando semanas pasadas, y se queda el que menos erró:
            </p>
            <div class="tabla-scroll">
              <table class="tabla">
                <thead><tr><th>Demanda</th><th>Método elegido</th><th>Error de cada método (WAPE)</th></tr></thead>
                <tbody>
                  <tr *ngFor="let s of r.modelo.seleccion">
                    <td>{{ s.tipo === 'REGULAR' ? 'Regular' : 'Intermitente' }}</td>
                    <td><strong>{{ nombreMetodo(s.metodo) }}</strong></td>
                    <td>
                      <span *ngIf="s.errores.length === 0" class="text-faint">Sin historia suficiente: método por defecto</span>
                      <span *ngFor="let e of s.errores; let ultimo = last">{{ nombreMetodo(e.metodo) }} {{ porcentaje(e.wape) }}{{ ultimo ? '' : ' · ' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p *ngIf="r.modelo.validacion as v">
              <strong>Validación:</strong> entrenado sin las últimas {{ v.semanas }} semanas, el modelo erró un
              {{ porcentaje(v.wapeModelo) }} al pronosticarlas por prenda y talla, contra un {{ porcentaje(v.wapeIngenuo) }} de repetir
              el promedio de las 4 semanas anteriores. Esas semanas no se usaron para elegir el método.
            </p>
            <p>
              La compra sugerida cubre la demanda pronosticada del horizonte más un stock de seguridad (z · σ · √semanas de
              reposición), menos lo disponible. El margen esperado considera solo las unidades de la compra que se espera vender
              en el horizonte, al precio actual, menos el costo de compra y la comisión de pago.
            </p>
          </section>
        </div>

        <ng-template #listaTendencias let-lista>
          <p class="vacio" *ngIf="lista.length === 0">Sin ventas en las últimas 16 semanas.</p>
          <ul class="tendencias">
            <li *ngFor="let t of lista">
              <span class="insignia" [ngClass]="claseTendencia(t)">
                <ion-icon [name]="iconoTendencia(t)" aria-hidden="true"></ion-icon>{{ textoTendencia(t) }}
              </span>
              <div>
                <strong>{{ t.nombre }}</strong>
                <span class="text-faint"> · {{ t.unidadesRecientes }} u. (antes {{ t.unidadesAnteriores }})</span>
                <small>{{ t.recomendacion }}</small>
              </div>
            </li>
          </ul>
        </ng-template>
      </div>
    </ion-content>
  `,
  styles: [`
    .pagina {
      --serie-web: #3987e5;
      --serie-tienda: #d95926;
      max-width: 1200px;
      margin: 0 auto;
    }
    .volver { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); text-decoration: none; font-size: 13px; margin-bottom: 8px; }
    .volver:hover { color: var(--text); }
    .page-title { margin-bottom: 16px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; }
    .page-title p { max-width: 760px; }
    .filtros { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin-bottom: 16px; }
    .filtros label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .filtros select, .filtros input {
      min-height: 40px; min-width: 150px; padding: 0 10px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text); font: inherit; font-size: 14px;
      text-transform: none; letter-spacing: normal; font-weight: 400;
    }
    .filtros ion-button { margin: 0; }
    .error, .cargando-inicial { text-align: center; padding: 24px; color: var(--text-muted); }
    .contenido { transition: opacity 0.2s; }
    .contenido.recalculando { opacity: 0.5; pointer-events: none; }
    .modelo-banda { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 13px; color: var(--text-muted); margin-bottom: 12px; }
    .avisos { list-style: none; padding: 12px 14px; margin: 0 0 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-elevated); display: grid; gap: 6px; }
    .avisos li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--text-muted); }
    .avisos ion-icon { flex: none; margin-top: 2px; color: var(--text-faint); }
    .tiles { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 16px; }
    @media (min-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
    .tile { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
    .tile-label { font-size: 12px; color: var(--text-muted); }
    .tile-valor { font-size: 26px; font-weight: 700; margin: 10px 0 4px; }
    .tile-nota { font-size: 12px; color: var(--text-faint); }
    .tarjeta { padding: 20px; margin-bottom: 16px; overflow: visible; }
    .tarjeta h2 { margin: 0 0 4px; font-size: 17px; }
    .tarjeta > p, .tarjeta-cabeza p { margin: 0 0 12px; font-size: 13px; }
    .tarjeta-cabeza { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .enlace { background: none; border: none; color: var(--accent-hover); font: inherit; font-size: 13px; cursor: pointer; padding: 4px 0; white-space: nowrap; }
    .tabla-scroll { overflow-x: auto; margin-top: 8px; }
    .tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tabla th { text-align: left; font-size: 11px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .tabla td { padding: 10px; border-bottom: 1px solid #27272a; vertical-align: top; }
    .tabla .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .compras { min-width: 1040px; }
    .prenda { min-width: 260px; }
    .compras td:nth-child(3) { min-width: 130px; }
    .mas { display: block; margin-top: 8px; }
    .prenda strong, .prenda span, .prenda small { display: block; }
    .prenda span { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
    .prenda small, .bloque { display: block; color: var(--text-faint); font-size: 12px; margin-top: 4px; line-height: 1.4; }
    tr.fuera td { opacity: 0.55; }
    .etiqueta-fuera { color: var(--text-muted) !important; font-weight: 600; }
    .estimado { color: var(--text-muted); margin-left: 2px; }
    .nota { font-size: 12px; color: var(--text-faint); margin: 8px 0 0; }
    .vacio { color: var(--text-muted); font-size: 14px; }
    .sugerencia { min-width: 240px; color: var(--text-muted); }
    .dos-columnas { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 900px) { .dos-columnas { grid-template-columns: 1fr 1fr; } }
    .dos-columnas .tarjeta { margin-bottom: 16px; }
    .tendencias { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .tendencias li { display: grid; grid-template-columns: 88px 1fr; gap: 10px; align-items: start; font-size: 13px; }
    .tendencias small { display: block; color: var(--text-faint); margin-top: 2px; line-height: 1.4; }
    .leyenda-canal { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0 0 12px; font-size: 12px; color: var(--text-muted); }
    .leyenda-canal li { display: inline-flex; align-items: center; gap: 6px; }
    .clave { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .clave.web { background: var(--serie-web); }
    .clave.tienda { background: var(--serie-tienda); }
    .mezcla { margin-bottom: 14px; }
    .mezcla-cabeza { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 13px; margin-bottom: 6px; }
    .mezcla-cabeza span { color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .mezcla small { display: block; color: var(--text-faint); font-size: 12px; margin-top: 4px; }
    .barra-mezcla { display: flex; gap: 2px; height: 12px; }
    .barra-mezcla span { flex-basis: 0; min-width: 0; }
    .barra-mezcla .web { background: var(--serie-web); border-radius: 4px 0 0 4px; }
    .barra-mezcla .tienda { background: var(--serie-tienda); border-radius: 0 4px 4px 0; }
    .como-funciona p { color: var(--text-muted); font-size: 14px; line-height: 1.55; max-width: 860px; }
    .como-funciona strong { color: var(--text); }
  `],
})
export class InversionPage {
  private readonly servicio = inject(InversionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly horizontes = [4, 8, 12, 26];
  readonly reposiciones = [1, 2, 3, 4];
  horizonte = 8;
  reposicion = 2;
  presupuesto: number | null = null;

  readonly r = signal<RecomendacionesInversion | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly verTabla = signal(false);
  readonly verTodas = signal(false);

  readonly formatCLP = formatCLP;
  readonly numero = numero;
  readonly porcentaje = porcentaje;
  readonly prioridad = PRIORIDAD;
  readonly confianza = CONFIANZA;
  nombreMetodo(codigo: string): string {
    return METODO[codigo] ?? codigo;
  }

  constructor() {
    addIcons({
      'alert-circle-outline': alertCircleOutline,
      'arrow-back-outline': arrowBackOutline,
      'arrow-down-outline': arrowDownOutline,
      'arrow-up-outline': arrowUpOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'information-circle-outline': informationCircleOutline,
      'remove-outline': removeOutline,
      'trending-up-outline': trendingUpOutline,
      'warning-outline': warningOutline,
    });
    // El modelo usa costos y márgenes: es del Gerente, y el backend rechaza a los demás roles.
    if (this.auth.rol() !== 'GERENTE') {
      this.router.navigateByUrl(this.auth.isAdmin() ? '/warehouse' : '/shop');
      return;
    }
    void this.calcular();
  }

  async calcular(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const presupuesto = this.presupuesto && this.presupuesto > 0 ? Math.round(this.presupuesto) : null;
      this.r.set(await this.servicio.recomendaciones({ horizonte: this.horizonte, reposicion: this.reposicion, presupuesto }));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.cargando.set(false);
    }
  }

  fecha(semana: string): string {
    const [a, m, d] = semana.split('-').map(Number);
    return fechaCorta.format(new Date(Date.UTC(a!, m! - 1, d!)));
  }

  inicioPronostico(r: RecomendacionesInversion): string {
    const primera = r.serieSemanal.find((p) => p.pronostico !== null);
    return primera ? this.fecha(primera.semana) : '';
  }

  tieneEstimados(r: RecomendacionesInversion): boolean {
    return r.comprar.some((c) => c.costoEstimado);
  }

  claseTendencia(t: Tendencia): string {
    return t.direccion === 'ALZA' ? 'bueno' : t.direccion === 'BAJA' ? 'critico' : 'neutro';
  }

  iconoTendencia(t: Tendencia): string {
    return t.direccion === 'ALZA' ? 'arrow-up-outline' : t.direccion === 'BAJA' ? 'arrow-down-outline' : 'remove-outline';
  }

  textoTendencia(t: Tendencia): string {
    if (t.variacion === null) return 'Nueva';
    const signo = t.variacion > 0 ? '+' : t.variacion < 0 ? '−' : '';
    return `${signo}${porcentaje(Math.abs(t.variacion))}`;
  }
}
