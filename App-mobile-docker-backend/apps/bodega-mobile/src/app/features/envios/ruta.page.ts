import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { RutaReparto } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { carOutline, cubeOutline, navigateOutline, refreshOutline, warningOutline } from 'ionicons/icons';
import type * as Leaflet from 'leaflet';
import { firstValueFrom } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { LogisticaApi } from './logistica.api';
import { enlaceNavegacion, formatoDistancia, formatoDuracion } from './ruta';

/** Mapa base de OpenStreetMap: gratuito, con la obligación de mostrar su crédito. */
const MAPA_BASE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CREDITO_MAPA = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · rutas OSRM';

/**
 * Ruta del día para repartir desde la bodega los pedidos por enviar de la Región
 * Metropolitana: el recorrido en el mapa y las paradas en orden, cada una con su enlace
 * para navegar. La calcula el backend; aquí solo se dibuja.
 */
@Component({
  selector: 'app-ruta-reparto',
  imports: [IonBackButton, IonButton, IonButtons, IonCard, IonContent, IonHeader, IonIcon, IonSpinner, IonText, IonTitle, IonToolbar],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/envios"></ion-back-button>
        </ion-buttons>
        <ion-title>Ruta de reparto</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Volver a calcular la ruta" [disabled]="cargando()" (click)="cargar()">
            <ion-icon slot="icon-only" name="refresh-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="mapa" #mapa role="img" [attr.aria-label]="descripcionMapa()"></div>

      @if (cargando() && !ruta()) {
        <p class="estado"><ion-spinner name="crescent"></ion-spinner> Calculando la ruta…</p>
      }
      @if (error(); as mensaje) {
        <div class="rs-acciones">
          <ion-text color="danger"><p role="alert">{{ mensaje }}</p></ion-text>
          <ion-button expand="block" [disabled]="cargando()" (click)="cargar()">Reintentar</ion-button>
        </div>
      }

      @if (ruta(); as r) {
        @if (r.paradas.length === 0 && r.sinUbicar.length === 0) {
          <p class="estado">No hay pedidos por enviar en la Región Metropolitana.</p>
        } @else {
          <section class="resumen" aria-label="Resumen de la ruta">
            <div><strong>{{ r.paradas.length }}</strong><span>{{ r.paradas.length === 1 ? 'parada' : 'paradas' }}</span></div>
            <div><strong>{{ distancia(r.distanciaTotal) }}</strong><span>ida y vuelta</span></div>
            <div><strong>{{ duracion(r.duracionTotal) }}</strong><span>manejando</span></div>
          </section>
        }

        @if (r.calculo === 'LINEA_RECTA' && r.paradas.length > 0) {
          <p class="aviso" role="status">
            <ion-icon name="warning-outline" aria-hidden="true"></ion-icon>
            Sin el servicio de rutas: el orden es por cercanía y las distancias son en línea recta.
          </p>
        }
        @if (aproximadas() > 0) {
          <p class="aviso" role="status">
            <ion-icon name="warning-outline" aria-hidden="true"></ion-icon>
            {{ aproximadas() === 1 ? 'Una parada está' : aproximadas() + ' paradas están' }} en el centro de su comuna: no se encontró la
            calle exacta.
          </p>
        }

        <ol class="paradas">
          <li class="bodega">
            <span class="numero" aria-hidden="true">B</span>
            <div>
              <h2>{{ r.origen.nombre }}</h2>
              <p>{{ r.origen.direccion }} · salida y regreso</p>
            </div>
          </li>
          @for (parada of r.paradas; track parada.idPedido) {
            <li>
              <span class="numero" aria-hidden="true">{{ parada.orden }}</span>
              <div>
                <h2>{{ parada.destinatario }} <small>Pedido #{{ parada.idPedido }}</small></h2>
                <p>
                  {{ parada.direccion }}, {{ parada.comuna }}
                  @if (parada.precision === 'COMUNA') {
                    <em>(ubicación aproximada)</em>
                  }
                </p>
                <p class="tramo">
                  <ion-icon name="cube-outline" aria-hidden="true"></ion-icon> {{ parada.unidades }}
                  {{ parada.unidades === 1 ? 'prenda' : 'prendas' }} ·
                  <ion-icon name="car-outline" aria-hidden="true"></ion-icon> {{ distancia(parada.distanciaTramo) }},
                  {{ duracion(parada.duracionTramo) }} desde la parada anterior
                </p>
              </div>
              <ion-button
                fill="outline"
                size="small"
                [href]="navegar(parada.orden)"
                target="_blank"
                rel="noopener"
                [attr.aria-label]="'Navegar hasta la parada ' + parada.orden"
              >
                <ion-icon slot="icon-only" name="navigate-outline"></ion-icon>
              </ion-button>
            </li>
          }
        </ol>

        @if (r.sinUbicar.length > 0) {
          <ion-card class="sin-ubicar">
            <h2>Sin ubicar en el mapa</h2>
            <p>Estos pedidos no entran en la ruta: revisa su dirección.</p>
            <ul>
              @for (pedido of r.sinUbicar; track pedido.idPedido) {
                <li>#{{ pedido.idPedido }} · {{ pedido.destinatario }} · {{ pedido.direccion }}, {{ pedido.comuna }}</li>
              }
            </ul>
          </ion-card>
        }
      }
    </ion-content>
  `,
  styles: `
    .mapa {
      height: 45vh;
      min-height: 260px;
      background: var(--rs-superficie);
    }
    .estado {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px;
      color: var(--rs-tenue);
    }
    .resumen {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 14px 16px 4px;
      text-align: center;
    }
    .resumen strong {
      display: block;
      font-family: var(--rs-fuente-titulo);
      font-size: 1.5rem;
    }
    .resumen span {
      color: var(--rs-tenue);
      font-size: 0.8rem;
    }
    .aviso {
      display: flex;
      gap: 8px;
      margin: 10px 16px 0;
      color: var(--ion-color-warning);
      font-size: 0.85rem;
    }
    .aviso ion-icon {
      flex: none;
      margin-top: 2px;
    }
    .paradas {
      margin: 0;
      padding: 8px 16px 24px;
      list-style: none;
    }
    .paradas li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--rs-borde);
    }
    .paradas li > div {
      flex: 1;
      min-width: 0;
    }
    .numero {
      display: grid;
      flex: none;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      color: #111;
      font-weight: 800;
    }
    .bodega .numero {
      background: var(--rs-texto, #fff);
    }
    h2 {
      margin: 2px 0;
      font-size: 1rem;
      font-weight: 700;
    }
    h2 small {
      color: var(--rs-tenue);
      font-weight: 500;
    }
    li p {
      margin: 2px 0;
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
    .tramo ion-icon {
      vertical-align: -2px;
    }
    .sin-ubicar {
      margin: 0 16px 24px;
      padding: 14px;
    }
    .sin-ubicar h2 {
      color: var(--ion-color-warning);
    }
  `,
})
export class RutaRepartoPage implements OnDestroy {
  private readonly api = inject(LogisticaApi);
  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('mapa');

  readonly ruta = signal<RutaReparto | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aproximadas = computed(() => this.ruta()?.paradas.filter((parada) => parada.precision === 'COMUNA').length ?? 0);
  readonly descripcionMapa = computed(() => {
    const paradas = this.ruta()?.paradas.length ?? 0;
    return `Mapa de la ruta de reparto: sale de la bodega, pasa por ${paradas} ${paradas === 1 ? 'parada' : 'paradas'} y vuelve.`;
  });

  protected readonly distancia = formatoDistancia;
  protected readonly duracion = formatoDuracion;

  private mapa: Leaflet.Map | null = null;
  private capa: Leaflet.LayerGroup | null = null;

  constructor() {
    addIcons({ carOutline, cubeOutline, navigateOutline, refreshOutline, warningOutline });
  }

  /** Ionic lo llama al terminar de mostrar la pantalla: ya tiene su tamaño final para el mapa. */
  ionViewDidEnter(): void {
    void this.cargar();
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const ruta = await firstValueFrom(this.api.rutaDeReparto());
      this.ruta.set(ruta);
      await this.dibujar(ruta);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Enlace para navegar hasta una parada desde la anterior (la primera, desde la bodega). */
  navegar(orden: number): string {
    const ruta = this.ruta()!;
    const destino = ruta.paradas[orden - 1]!.ubicacion;
    const origen = orden === 1 ? ruta.origen.ubicacion : ruta.paradas[orden - 2]!.ubicacion;
    return enlaceNavegacion(destino, origen);
  }

  private async dibujar(ruta: RutaReparto): Promise<void> {
    // Leaflet se carga solo al abrir el mapa: no pesa en el resto de la app. Es CommonJS, así
    // que según el empaquetador sus funciones llegan en `default` o en el módulo mismo.
    const modulo = await import('leaflet');
    const L = ((modulo as unknown as { default?: typeof Leaflet }).default ?? modulo) as typeof Leaflet;
    if (!this.mapa) {
      this.mapa = L.map(this.contenedor().nativeElement, { zoomControl: true, attributionControl: true });
      L.tileLayer(MAPA_BASE, { maxZoom: 19, attribution: CREDITO_MAPA }).addTo(this.mapa);
    }
    this.capa?.remove();
    const capa = L.layerGroup().addTo(this.mapa);
    this.capa = capa;

    const colorRuta = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim() || '#ffc22e';
    const marca = (texto: string, clase: string) =>
      L.divIcon({ className: '', html: `<span class="marca-ruta ${clase}">${texto}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

    if (ruta.trazado.length > 1) {
      L.polyline(
        ruta.trazado.map((punto) => [punto.lat, punto.lon] as [number, number]),
        { color: colorRuta, weight: 5, opacity: 0.85, dashArray: ruta.calculo === 'LINEA_RECTA' ? '8 8' : undefined },
      ).addTo(capa);
    }
    const origen: [number, number] = [ruta.origen.ubicacion.lat, ruta.origen.ubicacion.lon];
    L.marker(origen, { icon: marca('B', 'marca-bodega'), title: ruta.origen.nombre }).addTo(capa);
    for (const parada of ruta.paradas) {
      L.marker([parada.ubicacion.lat, parada.ubicacion.lon], {
        icon: marca(String(parada.orden), parada.precision === 'COMUNA' ? 'marca-aproximada' : ''),
        title: `${parada.orden}. ${parada.destinatario}`,
      }).addTo(capa);
    }

    const puntos: [number, number][] = [origen, ...ruta.paradas.map((p) => [p.ubicacion.lat, p.ubicacion.lon] as [number, number])];
    this.mapa.invalidateSize();
    if (puntos.length > 1) {
      this.mapa.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 15 });
    } else {
      this.mapa.setView(origen, 13);
    }
  }
}
