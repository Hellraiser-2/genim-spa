import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PuntoSerie } from '@rockstar/contracts';

/** Márgenes y alto del área de datos, en píxeles. */
const IZQ = 44;
const DER = 96;
const ARR = 24;
const ALTO_PLOT = 240;
const ABA = 30;
const ANCHO_MAX_BARRA = 24;
const RADIO = 4;
const SEPARACION = 2;

interface Tick {
  y: number;
  texto: string;
}

interface Barra {
  web: string | null;
  tienda: string | null;
}

interface Geometria {
  ancho: number;
  alto: number;
  base: number;
  paso: number;
  historia: number;
  ticks: Tick[];
  barras: Barra[];
  linea: string;
  banda: string;
  fin: { x: number; y: number; valor: number } | null;
  hoyX: number;
  etiquetasX: { x: number; texto: string }[];
}

const fechaCorta = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

function fecha(semana: string): Date {
  const [a, m, d] = semana.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!));
}

/** Paso "redondo" (1, 2, 5 × 10ⁿ) para unas 4 líneas de referencia. */
function pasoRedondo(maximo: number): number {
  const crudo = maximo / 4;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  return [1, 2, 5, 10].map((m) => m * magnitud).find((p) => p >= crudo)!;
}

/** Rectángulo con las esquinas superiores redondeadas y la base recta. */
function barraRedondeada(x: number, arriba: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, alto, ancho / 2);
  const abajo = arriba + alto;
  return `M${x},${abajo} V${arriba + r} A${r},${r} 0 0 1 ${x + r},${arriba} H${x + ancho - r} A${r},${r} 0 0 1 ${x + ancho},${arriba + r} V${abajo} Z`;
}

function rectangulo(x: number, arriba: number, ancho: number, alto: number): string {
  return `M${x},${arriba + alto} V${arriba} H${x + ancho} V${arriba + alto} Z`;
}

/**
 * Unidades vendidas por semana (columnas apiladas: e-commerce abajo, tienda arriba) y el
 * pronóstico de las semanas que vienen (línea con su rango probable).
 */
@Component({
  selector: 'app-grafico-pronostico',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viz" #caja>
      <ul class="leyenda" aria-label="Leyenda">
        <li><span class="clave rect web"></span>E-commerce</li>
        <li><span class="clave rect tienda"></span>Tienda física</li>
        <li><span class="clave linea"></span>Pronóstico</li>
        <li><span class="clave rect banda"></span>Rango probable (80%)</li>
      </ul>

      <div class="lienzo" *ngIf="g() as g">
        <svg
          [attr.width]="g.ancho"
          [attr.height]="g.alto"
          [attr.viewBox]="'0 0 ' + g.ancho + ' ' + g.alto"
          role="img"
          [attr.aria-label]="resumen()"
          tabindex="0"
          (pointermove)="mover($event)"
          (pointerleave)="activo.set(null)"
          (focus)="activo.set(g.historia - 1)"
          (blur)="activo.set(null)"
          (keydown)="teclas($event)"
        >
          <g class="grilla">
            <line *ngFor="let t of g.ticks" [attr.x1]="izq" [attr.x2]="g.ancho - der" [attr.y1]="t.y" [attr.y2]="t.y"></line>
          </g>
          <g class="eje-y">
            <text *ngFor="let t of g.ticks" [attr.x]="izq - 8" [attr.y]="t.y" dy="0.32em" text-anchor="end">{{ t.texto }}</text>
          </g>

          <path class="area-banda" [attr.d]="g.banda"></path>
          <g *ngFor="let b of g.barras">
            <path *ngIf="b.web" class="web" [attr.d]="b.web"></path>
            <path *ngIf="b.tienda" class="tienda" [attr.d]="b.tienda"></path>
          </g>

          <line class="hoy" [attr.x1]="g.hoyX" [attr.x2]="g.hoyX" [attr.y1]="arr - 14" [attr.y2]="g.base"></line>
          <text class="texto-hoy" [attr.x]="g.hoyX + 6" [attr.y]="arr - 6">Pronóstico →</text>

          <path class="linea-pronostico" [attr.d]="g.linea"></path>
          <ng-container *ngIf="g.fin as fin">
            <circle class="punto" [attr.cx]="fin.x" [attr.cy]="fin.y" r="4"></circle>
            <text class="etiqueta-fin" [attr.x]="fin.x + 10" [attr.y]="fin.y - 6">Pronóstico</text>
            <text class="valor-fin" [attr.x]="fin.x + 10" [attr.y]="fin.y + 10">{{ numero.format(fin.valor) }} u./sem</text>
          </ng-container>

          <line class="eje-x" [attr.x1]="izq" [attr.x2]="g.ancho - der" [attr.y1]="g.base" [attr.y2]="g.base"></line>
          <text *ngFor="let e of g.etiquetasX" class="etiqueta-x" [attr.x]="e.x" [attr.y]="g.base + 18" text-anchor="middle">{{ e.texto }}</text>

          <line
            *ngIf="activo() !== null"
            class="cruz"
            [attr.x1]="centro(activo()!, g)"
            [attr.x2]="centro(activo()!, g)"
            [attr.y1]="arr"
            [attr.y2]="g.base"
          ></line>
        </svg>

        <div
          *ngIf="tooltip() as t"
          class="tooltip"
          [style.left.px]="t.izquierda"
          [style.top.px]="arr"
          role="status"
          aria-live="polite"
        >
          <div class="tooltip-titulo">{{ t.titulo }}</div>
          <div *ngFor="let fila of t.filas" class="tooltip-fila">
            <span class="clave-linea" [class]="'clave-linea ' + fila.clase"></span>
            <strong>{{ fila.valor }}</strong>
            <span>{{ fila.nombre }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .viz {
      --superficie: #18181b;
      --grilla: #27272a;
      --texto-1: var(--text, #fafafa);
      --texto-2: var(--text-muted, #a1a1aa);
      --texto-3: var(--text-faint, #71717a);
      /* Categóricas validadas contra la superficie oscura (slots 1-3 del método). */
      --serie-web: #3987e5;
      --serie-tienda: #d95926;
      --serie-pronostico: #199e70;
      position: relative;
    }
    .leyenda { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 12px; padding: 0; list-style: none; font-size: 12px; color: var(--texto-2); }
    .leyenda li { display: inline-flex; align-items: center; gap: 6px; }
    .clave { display: inline-block; flex: none; }
    .clave.rect { width: 10px; height: 10px; border-radius: 2px; }
    .clave.web { background: var(--serie-web); }
    .clave.tienda { background: var(--serie-tienda); }
    .clave.banda { background: color-mix(in srgb, var(--serie-pronostico) 22%, transparent); }
    .clave.linea { width: 14px; height: 2px; border-radius: 1px; background: var(--serie-pronostico); }
    .lienzo { position: relative; }
    svg { display: block; overflow: visible; outline: none; touch-action: pan-y; }
    svg:focus-visible { outline: 2px solid var(--accent-hover, #dc2626); outline-offset: 4px; border-radius: 4px; }
    .grilla line, .eje-x { stroke: var(--grilla); stroke-width: 1; shape-rendering: crispEdges; }
    .eje-y text, .etiqueta-x { fill: var(--texto-3); font-size: 11px; font-variant-numeric: tabular-nums; }
    .web { fill: var(--serie-web); }
    .tienda { fill: var(--serie-tienda); }
    .area-banda { fill: var(--serie-pronostico); opacity: 0.12; }
    .linea-pronostico { fill: none; stroke: var(--serie-pronostico); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .punto { fill: var(--serie-pronostico); stroke: var(--superficie); stroke-width: 2; }
    .etiqueta-fin { fill: var(--texto-2); font-size: 11px; }
    .valor-fin { fill: var(--texto-1); font-size: 12px; font-weight: 600; }
    .hoy { stroke: var(--texto-3); stroke-width: 1; shape-rendering: crispEdges; }
    .texto-hoy { fill: var(--texto-3); font-size: 11px; }
    .cruz { stroke: var(--texto-2); stroke-width: 1; shape-rendering: crispEdges; pointer-events: none; }
    .tooltip {
      position: absolute;
      z-index: 2;
      width: 184px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #0c0c0c;
      border: 1px solid var(--border, #3f3f46);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      font-size: 12px;
    }
    .tooltip-titulo { color: var(--texto-2); margin-bottom: 6px; }
    .tooltip-fila { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--texto-2); }
    .tooltip-fila strong { color: var(--texto-1); font-variant-numeric: tabular-nums; min-width: 36px; }
    .clave-linea { width: 12px; height: 2px; border-radius: 1px; flex: none; background: var(--texto-3); }
    .clave-linea.web { background: var(--serie-web); }
    .clave-linea.tienda { background: var(--serie-tienda); }
    .clave-linea.pronostico { background: var(--serie-pronostico); }
  `],
})
export class GraficoPronosticoComponent implements AfterViewInit, OnDestroy {
  @ViewChild('caja', { static: true }) private caja!: ElementRef<HTMLElement>;

  private readonly serie = signal<PuntoSerie[]>([]);
  @Input({ required: true }) set datos(valor: PuntoSerie[]) {
    this.serie.set(valor);
  }

  readonly izq = IZQ;
  readonly der = DER;
  readonly arr = ARR;
  readonly numero = numero;
  readonly activo = signal<number | null>(null);
  private readonly ancho = signal(720);
  private observador?: ResizeObserver;

  ngAfterViewInit(): void {
    this.observador = new ResizeObserver(([entrada]) => {
      const ancho = Math.floor(entrada?.contentRect.width ?? 0);
      if (ancho > 0) this.ancho.set(ancho);
    });
    this.observador.observe(this.caja.nativeElement);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  readonly g = computed<Geometria | null>(() => {
    const serie = this.serie();
    if (serie.length === 0) return null;
    const ancho = Math.max(320, this.ancho());
    const historia = serie.filter((p) => p.pronostico === null).length;
    const paso = (ancho - IZQ - DER) / serie.length;
    const anchoBarra = Math.min(ANCHO_MAX_BARRA, paso * 0.62);
    const base = ARR + ALTO_PLOT;

    const total = (p: PuntoSerie) => (p.ecommerce ?? 0) + (p.pos ?? 0);
    const maximo = Math.max(1, ...serie.map((p) => (p.pronostico === null ? total(p) : (p.maximo ?? p.pronostico))));
    const salto = pasoRedondo(maximo);
    const tope = Math.ceil(maximo / salto) * salto;
    const y = (valor: number) => base - (valor / tope) * ALTO_PLOT;
    const centro = (i: number) => IZQ + paso * (i + 0.5);

    const ticks: Tick[] = [];
    for (let v = 0; v <= tope + 1e-9; v += salto) ticks.push({ y: y(v), texto: numero.format(v) });

    const barras: Barra[] = serie.slice(0, historia).map((p, i) => {
      const x = centro(i) - anchoBarra / 2;
      const alturaWeb = ((p.ecommerce ?? 0) / tope) * ALTO_PLOT;
      const alturaTienda = ((p.pos ?? 0) / tope) * ALTO_PLOT;
      const visible = (h: number) => (h > 0 ? Math.max(1, h) : 0);
      const web = visible(alturaWeb);
      // La tienda va arriba: cede 2 px de superficie como separación sin alterar el total.
      const tienda = alturaTienda > 0 ? visible(alturaTienda - (web > 0 ? SEPARACION : 0)) : 0;
      return {
        web: web === 0 ? null : tienda === 0 ? barraRedondeada(x, base - web, anchoBarra, web) : rectangulo(x, base - web, anchoBarra, web),
        tienda: tienda === 0 ? null : barraRedondeada(x, base - alturaWeb - alturaTienda, anchoBarra, tienda),
      };
    });

    const futuro = serie.map((p, i) => ({ p, i })).filter(({ p }) => p.pronostico !== null);
    const linea = futuro.map(({ p, i }, k) => `${k === 0 ? 'M' : 'L'}${centro(i)},${y(p.pronostico!)}`).join(' ');
    const banda =
      futuro.length === 0
        ? ''
        : [
            ...futuro.map(({ p, i }, k) => `${k === 0 ? 'M' : 'L'}${centro(i)},${y(p.maximo ?? p.pronostico!)}`),
            ...[...futuro].reverse().map(({ p, i }) => `L${centro(i)},${y(p.minimo ?? p.pronostico!)}`),
            'Z',
          ].join(' ');
    const ultimo = futuro[futuro.length - 1];

    const cada = Math.max(1, Math.ceil(64 / paso));
    const etiquetasX = serie
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => i % cada === 0)
      .map(({ i, p }) => ({ x: centro(i), texto: fechaCorta.format(fecha(p.semana)) }));

    return {
      ancho,
      alto: base + ABA,
      base,
      paso,
      historia,
      ticks,
      barras,
      linea,
      banda,
      fin: ultimo ? { x: centro(ultimo.i), y: y(ultimo.p.pronostico!), valor: ultimo.p.pronostico! } : null,
      hoyX: IZQ + paso * historia,
      etiquetasX,
    };
  });

  readonly resumen = computed(() => {
    const serie = this.serie();
    const historia = serie.filter((p) => p.pronostico === null);
    const futuro = serie.filter((p) => p.pronostico !== null);
    const vendidas = historia.reduce((s, p) => s + (p.ecommerce ?? 0) + (p.pos ?? 0), 0);
    const promedio = futuro.length ? futuro.reduce((s, p) => s + p.pronostico!, 0) / futuro.length : 0;
    return (
      `Unidades vendidas por semana en las últimas ${historia.length} semanas, por canal: ${numero.format(vendidas)} en total. ` +
      `Pronóstico de las próximas ${futuro.length} semanas: unas ${numero.format(promedio)} unidades por semana. ` +
      'Usa las flechas para recorrer las semanas.'
    );
  });

  readonly tooltip = computed(() => {
    const i = this.activo();
    const g = this.g();
    const p = i === null ? undefined : this.serie()[i];
    if (!g || !p || i === null) return null;
    const titulo = `${p.pronostico === null ? 'Semana' : 'Pronóstico, semana'} del ${fechaCorta.format(fecha(p.semana))}`;
    const filas =
      p.pronostico === null
        ? [
            { clase: 'web', valor: numero.format(p.ecommerce ?? 0), nombre: 'E-commerce' },
            { clase: 'tienda', valor: numero.format(p.pos ?? 0), nombre: 'Tienda física' },
            { clase: '', valor: numero.format((p.ecommerce ?? 0) + (p.pos ?? 0)), nombre: 'Total' },
          ]
        : [
            { clase: 'pronostico', valor: numero.format(p.pronostico), nombre: 'Unidades esperadas' },
            { clase: '', valor: `${numero.format(p.minimo ?? 0)}–${numero.format(p.maximo ?? 0)}`, nombre: 'Rango probable' },
          ];
    const x = this.centro(i, g);
    const izquierda = x + 12 + 184 > g.ancho ? x - 12 - 184 : x + 12;
    return { titulo, filas, izquierda };
  });

  centro(i: number, g: Geometria): number {
    return IZQ + g.paso * (i + 0.5);
  }

  mover(evento: PointerEvent): void {
    const g = this.g();
    if (!g) return;
    const x = evento.clientX - (evento.currentTarget as SVGElement).getBoundingClientRect().left;
    const i = Math.floor((x - IZQ) / g.paso);
    this.activo.set(i >= 0 && i < this.serie().length ? i : null);
  }

  teclas(evento: KeyboardEvent): void {
    const total = this.serie().length;
    const actual = this.activo() ?? 0;
    if (evento.key === 'ArrowRight') this.activo.set(Math.min(total - 1, actual + 1));
    else if (evento.key === 'ArrowLeft') this.activo.set(Math.max(0, actual - 1));
    else if (evento.key === 'Escape') this.activo.set(null);
    else return;
    evento.preventDefault();
  }
}
