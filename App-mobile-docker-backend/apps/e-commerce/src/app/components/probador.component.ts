import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowDownOutline, arrowUpOutline, closeOutline, informationCircleOutline, refreshOutline } from 'ionicons/icons';

import { Product, formatCLP } from '../data/models';
import {
  Complexion,
  Sexo,
  LIMITES,
  MEDIDAS_POR_DEFECTO,
  MedidasCliente,
  aconsejarTalla,
  colorDePrenda,
  esPolera,
  estimarCuerpo,
  reescalarMedidas,
  evaluarAjuste,
  medidasDeTalla,
  mismaTalla,
  recomendarTalla,
  tablaDeTallas,
  tipoDePrenda,
  validarMedidas,
  zonaDeReferencia,
} from '../data/probador';
import type { EscenaManiqui, PrendaEnEscena } from '../probador/escena-maniqui';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';

/** Prenda que se abre en el probador, con sus tallas en el mismo color. */
export interface PruebaDePrenda {
  producto: Product;
  variantes: Product[];
}

/** Las medidas quedan solo en este navegador; no se envían al servidor. */
const CLAVE_MEDIDAS = 'rockstar.probador.medidas';

function leerMedidas(): MedidasCliente {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_MEDIDAS) ?? 'null') as Partial<MedidasCliente> | null;
    const medidas = { ...MEDIDAS_POR_DEFECTO, ...guardadas };
    if (!['delgada', 'media', 'robusta'].includes(medidas.complexion ?? 'media')) medidas.complexion = 'media';
    if (!['masculino', 'femenino'].includes(medidas.sexo ?? 'masculino')) medidas.sexo = 'masculino';
    return validarMedidas(medidas) ? MEDIDAS_POR_DEFECTO : medidas;
  } catch {
    return MEDIDAS_POR_DEFECTO;
  }
}

/** Contornos opcionales del cuerpo que el cliente puede ingresar. */
type Contorno = 'pecho' | 'cintura' | 'cadera';
const CONTORNOS: { medida: Contorno; nombre: string }[] = [
  { medida: 'pecho', nombre: 'Pecho' },
  { medida: 'cintura', nombre: 'Cintura' },
  { medida: 'cadera', nombre: 'Cadera' },
];
const SEXOS: { valor: Sexo; nombre: string }[] = [
  { valor: 'masculino', nombre: 'Masculino' },
  { valor: 'femenino', nombre: 'Femenino' },
];
const COMPLEXIONES: { valor: Complexion; nombre: string }[] = [
  { valor: 'delgada', nombre: 'Delgada' },
  { valor: 'media', nombre: 'Media' },
  { valor: 'robusta', nombre: 'Robusta' },
];

const TEXTO_ANCHO = { apretada: 'Te quedaría apretada', justa: 'Te quedaría bien', holgada: 'Te quedaría holgada' } as const;
const TEXTO_LARGO = { corta: 'corta de largo', adecuada: 'de largo adecuado', larga: 'larga' } as const;
const TEXTO_MANGA = { corta: 'Manga corta para tu brazo', adecuada: 'Manga de largo adecuado', larga: 'Manga larga para tu brazo' } as const;
const TEXTO_ZONA = { pecho: 'tu pecho', abdomen: 'tu abdomen', cintura: 'tu cintura' } as const;
const ESTADO_ANCHO = { apretada: 'te queda apretada', justa: 'te queda bien', holgada: 'te queda holgada' } as const;

/** Probador virtual: maniquí 3D con la altura y el peso del cliente, vestido con la talla elegida. */
@Component({
  selector: 'app-probador',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  template: `
    <div class="probador">
      <header>
        <div class="titulo">
          <div class="section-title">Probador 3D</div>
          <h2>{{ producto().name }}</h2>
          <p>{{ producto().color }} · {{ formatCLP(producto().price) }}</p>
        </div>
        <button class="cerrar" type="button" aria-label="Cerrar el probador" (click)="cerrar()">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </header>

      <div class="cuerpo">
        <div class="lienzo">
          <canvas #lienzo aria-label="Maniquí 3D con la prenda; arrástralo para girarlo"></canvas>
          <div class="aviso" *ngIf="sinWebgl()">Tu navegador no puede mostrar 3D. La recomendación de talla sigue disponible.</div>
          <div class="aviso" *ngIf="!sinWebgl() && !escena()">Cargando maniquí…</div>
          <div class="ayuda" *ngIf="escena()">Arrastra para girar · pellizca o usa la rueda para acercar</div>
          <div class="estado" *ngIf="polera() && ajuste() as a" [attr.data-ancho]="a.ancho">
            Talla {{ a.talla }} · {{ estadoAncho[a.ancho] }}
          </div>
        </div>

        <div class="panel">
          <div class="descargo" role="note">
            <ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon>
            <p>
              <strong>Es una simulación.</strong> El maniquí y la talla recomendada son estimaciones a partir de tus medidas
              y de las medidas de la prenda: no garantizan que te quede exactamente igual. Ante la duda, revisa la tabla de
              tallas o escríbenos.
            </p>
          </div>

          <section>
            <div class="lbl">Cuerpo</div>
            <div class="complexion" role="group" aria-label="Cuerpo del maniquí">
              <button
                *ngFor="let s of sexos"
                type="button"
                [class.elegida]="sexo() === s.valor"
                [attr.aria-pressed]="sexo() === s.valor"
                (click)="sexo.set(s.valor)"
              >{{ s.nombre }}</button>
            </div>
            <label for="probador-altura">Altura <strong>{{ altura() }} cm</strong></label>
            <div class="control">
              <input type="range" [min]="limites.altura.min" [max]="limites.altura.max" [value]="altura()" (input)="cambiarAltura($event)" aria-label="Altura en centímetros" />
              <input id="probador-altura" type="number" inputmode="numeric" [min]="limites.altura.min" [max]="limites.altura.max" [value]="altura()" (input)="cambiarAltura($event)" />
            </div>
            <label for="probador-peso">Peso <strong>{{ peso() }} kg</strong></label>
            <div class="control">
              <input type="range" [min]="limites.peso.min" [max]="limites.peso.max" [value]="peso()" (input)="cambiarPeso($event)" aria-label="Peso en kilos" />
              <input id="probador-peso" type="number" inputmode="numeric" [min]="limites.peso.min" [max]="limites.peso.max" [value]="peso()" (input)="cambiarPeso($event)" />
            </div>
            <details class="medidas-extra" [open]="tieneContornos()">
              <summary>Medidas del cuerpo <span>(opcional)</span></summary>
              <p class="ayuda-medidas">Si las conoces, el maniquí y la talla usan tus medidas; la cadera cambia con tu peso y tu altura. Vacías, se estiman.</p>
              <div class="contornos">
                <label *ngFor="let c of contornos" [for]="'probador-' + c.medida">
                  {{ c.nombre }}
                  <input
                    [id]="'probador-' + c.medida"
                    type="number"
                    inputmode="numeric"
                    [min]="limites[c.medida].min"
                    [max]="limites[c.medida].max"
                    [value]="contorno(c.medida) ?? ''"
                    [placeholder]="estimados()[c.medida]"
                    (input)="cambiarContorno(c.medida, $event)"
                  />
                </label>
              </div>
              <div class="lbl">Contextura</div>
              <div class="complexion" role="group" aria-label="Contextura">
                <button
                  *ngFor="let c of complexiones"
                  type="button"
                  [class.elegida]="complexion() === c.valor"
                  [attr.aria-pressed]="complexion() === c.valor"
                  (click)="complexion.set(c.valor)"
                >{{ c.nombre }}</button>
              </div>
            </details>
            <p class="error" *ngIf="error() as mensaje">{{ mensaje }}</p>
          </section>

          <section>
            <div class="lbl">Talla</div>
            <div class="tallas">
              <button
                *ngFor="let t of tallas(); trackBy: porTalla"
                type="button"
                class="talla"
                [class.elegida]="t.talla === tallaElegida()"
                [class.sin-stock]="!t.variante"
                [attr.aria-pressed]="t.talla === tallaElegida()"
                (click)="seleccion.set(t.talla)"
              >
                {{ t.talla }}
                <span class="estrella" *ngIf="t.talla === recomendada()" title="Recomendada">★</span>
              </button>
            </div>
            <p class="recomendacion">
              Te recomendamos la talla <strong>{{ recomendada() }}</strong>
              <span *ngIf="!varianteDe(recomendada())"> (sin stock en {{ producto().color.toLowerCase() }})</span>.
            </p>
          </section>

          <section class="ajuste" *ngIf="ajuste() as a" [attr.data-ancho]="a.ancho">
            <ng-container *ngIf="tipo() === 'cinturon'; else conAjuste">
              <strong>Talla única</strong>: se ajusta con la hebilla.
            </ng-container>
            <ng-template #conAjuste>
              <strong>Talla {{ a.talla }}<ng-container *ngIf="equivalencia() as e"> (US {{ e }})</ng-container>:</strong> {{ textoAncho[a.ancho] }} y {{ textoLargo[a.largo] }}.<ng-container *ngIf="a.manga"> {{ textoManga[a.manga] }}.</ng-container>
              <div class="detalle">Holgura estimada: {{ a.holgura > 0 ? '+' : '' }}{{ a.holgura }} cm sobre {{ textoZona[zonaMedida()] }}.</div>
            </ng-template>
          </section>

          <section class="consejo" *ngIf="consejo() as c" [attr.data-cambio]="c.cambio" role="status">
            <ng-container *ngIf="c.talla; else sinOtraTalla">
              <p>
                <strong>La talla {{ tallaElegida() }} te queda {{ c.cambio === 'subir' ? 'chica' : 'grande' }}.</strong>
                <ng-container *ngIf="c.calza; else tallaDelExtremo"> Te aconsejamos {{ c.cambio }} a la talla <strong>{{ c.talla }}</strong></ng-container>
                <ng-template #tallaDelExtremo>
                  La que más se acerca es la <strong>{{ c.talla }}</strong>, la más {{ c.cambio === 'subir' ? 'grande' : 'chica' }} que tenemos, y aun así te quedaría
                  {{ c.cambio === 'subir' ? 'apretada' : 'holgada' }}</ng-template><span *ngIf="!varianteDe(c.talla)"> (sin stock en {{ producto().color.toLowerCase() }})</span>.
              </p>
              <button type="button" (click)="seleccion.set(c.talla)">
                <ion-icon [name]="c.cambio === 'subir' ? 'arrow-up-outline' : 'arrow-down-outline'" aria-hidden="true"></ion-icon>
                Probar talla {{ c.talla }}
              </button>
            </ng-container>
            <ng-template #sinOtraTalla>
              <p *ngIf="c.cambio === 'subir'; else masChica">
                <strong>Ni la talla más grande te queda cómoda:</strong> te quedaría apretada. Revisa la tabla de tallas o escríbenos.
              </p>
              <ng-template #masChica>
                <p><strong>Es la talla más chica que tenemos</strong> y aun así te quedaría holgada.</p>
              </ng-template>
            </ng-template>
          </section>

          <p class="nota medida-ajustada" *ngFor="let a of cuerpo().ajustadas" role="status">
            {{ nombreContorno[a.medida] }} de {{ a.ingresada }} cm no calza con tu altura y peso; usamos {{ a.usada }} cm.
            Revisa la medida.
          </p>

          <p class="nota" *ngIf="!tieneContornos(); else conContornos">
            Medidas estimadas desde tu altura y peso ({{ cuerpo().pecho }} cm de pecho, {{ cuerpo().cintura }} cm de cintura).
            Es una referencia: tu cuerpo puede variar.
          </p>
          <ng-template #conContornos>
            <p class="nota">
              Medidas usadas: {{ cuerpo().pecho }} cm de pecho, {{ cuerpo().cintura }} cm de cintura y {{ cuerpo().cadera }} cm de cadera.
              Las que no ingresaste se estiman. Es una referencia: tu cuerpo puede variar.
            </p>
          </ng-template>

          <ion-button expand="block" class="btn-rockstar" [disabled]="!varianteElegida()" (click)="agregar()">
            <ion-icon slot="start" name="add-outline"></ion-icon>
            {{ varianteElegida() ? 'Agregar talla ' + tallaElegida() + ' al carrito' : 'Talla ' + tallaElegida() + ' sin stock' }}
          </ion-button>
          <button class="reiniciar" type="button" (click)="reiniciarMedidas()">
            <ion-icon name="refresh-outline"></ion-icon> Medidas por defecto
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .probador { display: flex; flex-direction: column; height: 100%; background: var(--bg-card, #0c0c0c); color: var(--text, #fff); }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 16px 8px; }
    .titulo { min-width: 0; }
    .titulo .section-title { font-size: 11px; margin-bottom: 2px; }
    h2 { margin: 0; font-size: 18px; font-weight: 900; text-transform: uppercase; line-height: 1.15; }
    header p { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
    .cerrar { flex: none; background: none; border: 1px solid var(--border); border-radius: 999px; color: var(--text); width: 36px; height: 36px; font-size: 20px; display: grid; place-items: center; cursor: pointer; }
    .cuerpo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }
    .lienzo { position: relative; height: 46vh; min-height: 280px; flex: none; background: radial-gradient(circle at 50% 40%, #1f1012, #050505 70%); }
    canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
    .aviso, .ayuda { position: absolute; left: 12px; right: 12px; text-align: center; font-size: 12px; color: var(--text-faint); }
    .aviso { top: 45%; }
    .ayuda { bottom: 8px; }
    .estado { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #fff; border: 1px solid; pointer-events: none; }
    .estado[data-ancho=justa] { background: rgba(22, 101, 52, 0.75); border-color: rgba(34, 197, 94, 0.6); }
    .estado[data-ancho=apretada] { background: rgba(127, 29, 29, 0.85); border-color: rgba(239, 68, 68, 0.7); }
    .estado[data-ancho=holgada] { background: rgba(133, 77, 14, 0.8); border-color: rgba(234, 179, 8, 0.6); }
    .panel { padding: 12px 16px 20px; display: flex; flex-direction: column; gap: 14px; }
    section { display: flex; flex-direction: column; gap: 6px; }
    label, .lbl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; }
    .medidas-extra { border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; }
    .medidas-extra summary { cursor: pointer; font-size: 12px; font-weight: 700; color: var(--text-muted); }
    .medidas-extra summary span, .ayuda-medidas { font-weight: 400; color: var(--text-faint); }
    .ayuda-medidas { margin: 6px 0; font-size: 11px; }
    .contornos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
    .contornos label { display: flex; flex-direction: column; gap: 4px; }
    .contornos input[type=number] { width: 100%; box-sizing: border-box; }
    .complexion { display: flex; gap: 6px; margin-top: 6px; }
    .complexion button { flex: 1; padding: 6px; border-radius: 8px; border: 1px solid var(--border); background: #18181b; color: var(--text); font-size: 12px; cursor: pointer; }
    .complexion button.elegida { border-color: var(--accent); background: var(--accent); }
    label strong { color: var(--text); margin-left: 4px; }
    .control { display: flex; gap: 10px; align-items: center; }
    input[type=range] { flex: 1; accent-color: var(--accent); }
    input[type=number] { width: 68px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border); background: #18181b; color: var(--text); font-size: 14px; }
    .error { margin: 0; color: #fca5a5; font-size: 12px; }
    .tallas { display: flex; flex-wrap: wrap; gap: 6px; }
    .talla { position: relative; min-width: 44px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: #18181b; color: var(--text); font-weight: 700; font-size: 13px; cursor: pointer; }
    .talla.elegida { border-color: var(--accent); background: var(--accent); color: #fff; }
    .talla.sin-stock:not(.elegida) { color: var(--text-faint); text-decoration: line-through; }
    .estrella { position: absolute; top: -7px; right: -5px; font-size: 12px; color: #facc15; }
    .recomendacion, .nota { margin: 0; font-size: 13px; color: var(--text-muted); }
    .nota { font-size: 11px; color: var(--text-faint); line-height: 1.5; }
    .nota.medida-ajustada { padding: 8px 10px; border-radius: 10px; background: rgba(161, 98, 7, 0.18); border: 1px solid rgba(250, 204, 21, 0.35); color: #fde68a; font-size: 12px; }
    .descargo { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); }
    .descargo ion-icon { flex: none; font-size: 18px; color: #7dd3fc; margin-top: 1px; }
    .descargo p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }
    .descargo strong { color: var(--text); }
    .ajuste { padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; border: 1px solid; }
    .ajuste[data-ancho=justa] { background: rgba(22, 101, 52, 0.25); border-color: rgba(34, 197, 94, 0.4); }
    .ajuste[data-ancho=apretada] { background: rgba(127, 29, 29, 0.3); border-color: rgba(239, 68, 68, 0.45); }
    .ajuste[data-ancho=holgada] { background: rgba(133, 77, 14, 0.25); border-color: rgba(234, 179, 8, 0.4); }
    .detalle { font-size: 12px; color: var(--text-muted); }
    .consejo { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.45); background: rgba(127, 29, 29, 0.3); gap: 8px; }
    .consejo[data-cambio=bajar] { border-color: rgba(234, 179, 8, 0.4); background: rgba(133, 77, 14, 0.25); }
    .consejo p { margin: 0; font-size: 13px; line-height: 1.5; }
    .consejo button { align-self: flex-start; display: flex; gap: 6px; align-items: center; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font-weight: 700; font-size: 13px; cursor: pointer; }
    .reiniciar { align-self: center; background: none; border: none; color: var(--text-faint); font-size: 12px; display: flex; gap: 4px; align-items: center; cursor: pointer; }
    @media (min-width: 768px) {
      .cuerpo { flex-direction: row; overflow: hidden; }
      .lienzo { height: auto; flex: 1.3; }
      .panel { flex: 1; overflow-y: auto; }
    }
  `],
})
export class ProbadorComponent implements AfterViewInit, OnDestroy {
  /**
   * Se abre con `ModalController`, que asigna `componentProps` directo a la instancia
   * (no con `setInput`): por eso es un setter que guarda la prenda en una señal.
   */
  @Input({ required: true }) set prueba(valor: PruebaDePrenda) {
    this.datos.set(valor);
    // Se abre con la talla recomendada para las medidas guardadas.
    this.seleccion.set(this.recomendada());
  }
  private readonly datos = signal<PruebaDePrenda | null>(null);
  /** Prenda con que se abrió el probador. */
  readonly producto = computed(() => this.datos()!.producto);
  /** Las variantes del mismo producto y color, una por talla. */
  readonly variantes = computed(() => this.datos()!.variantes);

  @ViewChild('lienzo') private lienzo?: ElementRef<HTMLCanvasElement>;

  private readonly modales = inject(ModalController);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly zona = inject(NgZone);

  readonly limites = LIMITES;
  readonly textoAncho = TEXTO_ANCHO;
  readonly textoLargo = TEXTO_LARGO;
  readonly textoManga = TEXTO_MANGA;
  readonly textoZona = TEXTO_ZONA;
  readonly estadoAncho = ESTADO_ANCHO;
  readonly nombreContorno = { pecho: 'Un pecho', cintura: 'Una cintura', cadera: 'Una cadera' } as const;
  readonly formatCLP = formatCLP;

  readonly contornos = CONTORNOS;
  readonly complexiones = COMPLEXIONES;
  readonly sexos = SEXOS;

  private readonly inicial = leerMedidas();
  readonly altura = signal(this.inicial.altura);
  readonly peso = signal(this.inicial.peso);
  /** Contornos que ingresó el cliente; `null` si se estiman. */
  readonly pecho = signal(this.inicial.pecho ?? null);
  readonly cintura = signal(this.inicial.cintura ?? null);
  readonly cadera = signal(this.inicial.cadera ?? null);
  readonly complexion = signal<Complexion>(this.inicial.complexion ?? 'media');
  readonly sexo = signal<Sexo>(this.inicial.sexo ?? 'masculino');

  readonly medidas = computed<MedidasCliente>(() => ({
    altura: this.altura(),
    peso: this.peso(),
    pecho: this.pecho(),
    cintura: this.cintura(),
    cadera: this.cadera(),
    complexion: this.complexion(),
    sexo: this.sexo(),
  }));
  readonly error = computed(() => validarMedidas(this.medidas()));
  readonly tieneContornos = computed(() => this.pecho() !== null || this.cintura() !== null || this.cadera() !== null);
  /** Lo que se estimaría sin contornos: se muestra como sugerencia en los campos vacíos. */
  readonly estimados = computed(() => estimarCuerpo({ altura: this.altura(), peso: this.peso(), complexion: this.complexion(), sexo: this.sexo() }));

  /** Mientras el cliente escribe un valor fuera de rango, el maniquí se queda con las últimas medidas válidas. */
  private ultimasValidas = this.inicial;
  readonly cuerpo = computed(() => {
    const medidas = this.medidas();
    if (!validarMedidas(medidas)) this.ultimasValidas = medidas;
    return estimarCuerpo(this.ultimasValidas);
  });

  /** Siempre hay tipo: la tienda solo ofrece Probar en categorías que el probador simula. */
  readonly tipo = computed(() => tipoDePrenda(this.producto().category, this.producto().name) ?? 'polera');
  /** Por ahora solo las poleras se quedan en su talla al cambiar el peso y aconsejan otra. */
  readonly polera = computed(() => esPolera(this.tipo()));
  readonly recomendada = computed(() => recomendarTalla(this.cuerpo(), this.tipo()));
  readonly tallas = computed(() =>
    tablaDeTallas(this.tipo()).map(({ talla }) => ({ talla, variante: this.varianteDe(talla) })),
  );

  /**
   * Talla puesta en el maniquí. Se abre con la recomendada. En una polera no cambia sola: si el
   * cliente sube de peso, la misma prenda le queda apretada, como en un probador de verdad, y
   * `consejo` le sugiere la talla que sí le calza. En las demás prendas, cada vez que la
   * recomendación cambia (al mover el peso, la altura o las medidas) se vuelve a ella.
   */
  readonly seleccion = signal<string | null>(null);
  readonly tallaElegida = computed(() => this.seleccion() ?? this.recomendada());
  readonly varianteElegida = computed(() => this.varianteDe(this.tallaElegida()));
  readonly ajuste = computed(() => evaluarAjuste(this.cuerpo(), this.tipo(), this.tallaElegida()));
  /** Subir o bajar de talla, si la polera puesta no calza. */
  readonly consejo = computed(() => (this.polera() ? aconsejarTalla(this.cuerpo(), this.tipo(), this.tallaElegida()) : null));
  readonly zonaMedida = computed(() => zonaDeReferencia(this.cuerpo(), this.tipo()));
  /** Talla americana del fabricante, en los pantalones. */
  readonly equivalencia = computed(() => medidasDeTalla(this.tipo(), this.tallaElegida())?.equivalencia ?? null);

  readonly prendaEnEscena = computed<PrendaEnEscena | null>(() => {
    const medidas = medidasDeTalla(this.tipo(), this.tallaElegida());
    if (!medidas) return null;
    const color = colorDePrenda(this.producto().color);
    // La polera manga larga se dibuja con el modelo 3D de manga larga, el del polerón.
    const tipo = this.tipo() === 'polera_manga_larga' ? 'poleron' : this.tipo();
    return { tipo, contorno: medidas.contornoPrenda, largo: medidas.largo, color, seSube: this.polera() };
  });

  readonly escena = signal<EscenaManiqui | null>(null);
  readonly sinWebgl = signal(false);
  private observador?: ResizeObserver;
  private destruido = false;

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-down-outline': arrowDownOutline,
      'arrow-up-outline': arrowUpOutline,
      'close-outline': closeOutline,
      'refresh-outline': refreshOutline,
      'information-circle-outline': informationCircleOutline,
    });

    effect(() => {
      const medidas = this.medidas();
      if (validarMedidas(medidas)) return;
      try {
        localStorage.setItem(CLAVE_MEDIDAS, JSON.stringify(medidas));
      } catch {
        // Sin almacenamiento (modo privado): las medidas duran lo que dure la página.
      }
    });

    // Fuera de las poleras, si la recomendación cambió, la talla puesta pasa a ser la nueva recomendada.
    let ultimaRecomendada: string | null = null;
    effect(
      () => {
        const recomendada = this.recomendada();
        if (!this.polera() && ultimaRecomendada !== null && recomendada !== ultimaRecomendada) this.seleccion.set(null);
        ultimaRecomendada = recomendada;
      },
      { allowSignalWrites: true },
    );

    effect(() => this.escena()?.mostrar(this.cuerpo(), this.prendaEnEscena()));
  }

  async ngAfterViewInit(): Promise<void> {
    const lienzo = this.lienzo?.nativeElement;
    if (!lienzo) return;
    try {
      // three.js se descarga recién aquí, en su propio archivo.
      const { EscenaManiqui } = await import('../probador/escena-maniqui');
      if (this.destruido) return;
      // El ciclo de dibujo y los gestos del maniquí corren fuera de la zona de Angular:
      // dentro, cada cuadro dispararía una revisión de toda la página.
      const escena = this.zona.runOutsideAngular(() => {
        const nueva = new EscenaManiqui(lienzo);
        const contenedor = lienzo.parentElement!;
        this.observador = new ResizeObserver(() => nueva.redimensionar(contenedor.clientWidth, contenedor.clientHeight));
        this.observador.observe(contenedor);
        nueva.redimensionar(contenedor.clientWidth, contenedor.clientHeight);
        return nueva;
      });
      this.escena.set(escena);
    } catch {
      this.sinWebgl.set(true);
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.observador?.disconnect();
    this.escena()?.destruir();
  }

  porTalla = (_: number, t: { talla: string }) => t.talla;

  cerrar(): void {
    void this.modales.dismiss();
  }

  varianteDe(talla: string): Product | undefined {
    return this.variantes().find((v) => mismaTalla(v.size, talla) && v.stock > 0);
  }

  cambiarAltura(evento: Event): void {
    this.cambiarCuerpo({ altura: Math.round(Number((evento.target as HTMLInputElement).value)), peso: this.peso() });
  }

  cambiarPeso(evento: Event): void {
    this.cambiarCuerpo({ altura: this.altura(), peso: Math.round(Number((evento.target as HTMLInputElement).value)) });
  }

  /**
   * Medidas tal como el cliente las escribió, con la altura y el peso de ese momento: desde ahí se
   * recalculan al mover el peso o la altura, así el redondeo no se acumula paso a paso.
   */
  private referencia: MedidasCliente | null = null;

  /** La altura y el peso nuevos, y las medidas ingresadas cambiadas en la misma proporción. */
  private cambiarCuerpo(despues: { altura: number; peso: number }): void {
    const actual = this.medidas();
    if (!this.referencia || validarMedidas({ altura: this.referencia.altura, peso: this.referencia.peso })) {
      this.referencia = actual;
    }
    const nuevo = reescalarMedidas({ ...this.referencia, complexion: actual.complexion, sexo: actual.sexo }, despues);
    this.altura.set(despues.altura);
    this.peso.set(despues.peso);
    this.pecho.set(nuevo.pecho ?? null);
    this.cintura.set(nuevo.cintura ?? null);
    this.cadera.set(nuevo.cadera ?? null);
  }

  contorno(medida: Contorno): number | null {
    return { pecho: this.pecho, cintura: this.cintura, cadera: this.cadera }[medida]();
  }

  /** Un campo vacío vuelve a estimar esa medida. */
  cambiarContorno(medida: Contorno, evento: Event): void {
    const texto = (evento.target as HTMLInputElement).value.trim();
    const valor = texto === '' ? null : Math.round(Number(texto));
    ({ pecho: this.pecho, cintura: this.cintura, cadera: this.cadera })[medida].set(valor);
    this.referencia = null;
  }

  reiniciarMedidas(): void {
    this.altura.set(MEDIDAS_POR_DEFECTO.altura);
    this.peso.set(MEDIDAS_POR_DEFECTO.peso);
    this.pecho.set(null);
    this.cintura.set(null);
    this.cadera.set(null);
    this.complexion.set('media');
    this.seleccion.set(this.recomendada());
    this.referencia = null;
  }

  agregar(): void {
    const variante = this.varianteElegida();
    if (!variante) return;
    const resultado = this.cart.add(variante);
    this.toast.show(resultado.ok ? `Talla ${variante.size} agregada al carrito.` : resultado.reason || 'No se pudo agregar.');
  }
}
