import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonRouterLink,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Pedido } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { chevronForward, downloadOutline, gridOutline, logOutOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { ServidorService } from '../../core/api/servidor.service';
import { SesionService } from '../../core/sesion/sesion.service';
import { GRUPOS_DE_ENVIO, agruparEnvios } from '../envios/envios';
import { LogisticaApi } from '../envios/logistica.api';

interface Opcion {
  ruta: string;
  titulo: string;
  detalle: string;
  icono: string;
  /** Color del icono, como componentes RGB, para distinguir cada operación de un vistazo. */
  tono: string;
}

@Component({
  selector: 'app-inicio',
  imports: [
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonIcon,
    IonRouterLink,
    IonText,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Rockstar</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Cerrar sesión" (click)="cerrarSesion()">
            <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <section class="saludo">
        <p>Hola,</p>
        <h1>{{ sesion.usuario()?.nombre }}</h1>
        @if (sesion.usuario()?.rol; as rol) {
          <span class="rs-chip rs-chip--acento">{{ rol }}</span>
        }
      </section>
      @if (servidor.modoDemo()) {
        <ion-text color="warning">
          <p role="status">Modo demostración: son datos de ejemplo y lo que registres no llega a la base de datos.</p>
        </ion-text>
      }

      <ion-card button routerLink="/envios" class="envios">
        <div class="envios-cabecera">
          <div>
            <h2>Envíos</h2>
            <p>Pedidos del e-commerce</p>
          </div>
          <ion-icon name="chevron-forward" aria-hidden="true"></ion-icon>
        </div>
        @if (errorEnvios(); as mensaje) {
          <p role="alert">{{ mensaje }}</p>
        } @else {
          <dl>
            @for (grupo of resumenEnvios(); track grupo.etiqueta) {
              <div>
                <dd>{{ grupo.cantidad ?? '–' }}</dd>
                <dt>{{ grupo.etiqueta }}</dt>
              </div>
            }
          </dl>
        }
      </ion-card>

      <h2 class="rs-seccion">Operaciones</h2>
      <div class="operaciones">
        @for (opcion of opciones; track opcion.ruta) {
          <ion-card button class="operacion" [routerLink]="opcion.ruta" [style.--tono]="opcion.tono">
            <span class="icono"><ion-icon [name]="opcion.icono" aria-hidden="true"></ion-icon></span>
            <h3>{{ opcion.titulo }}</h3>
            <p>{{ opcion.detalle }}</p>
          </ion-card>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .saludo {
      padding: 8px 20px 4px;
    }
    .saludo p {
      margin: 0;
      color: var(--rs-tenue);
    }
    .saludo h1 {
      margin: 2px 0 10px;
      font-family: var(--rs-fuente-titulo);
      font-size: 2.1rem;
      font-weight: 600;
      line-height: 1.1;
    }
    .envios {
      padding: 18px;
      border-color: rgba(255, 194, 46, 0.28);
      background: linear-gradient(140deg, rgba(255, 194, 46, 0.16), rgba(255, 194, 46, 0.02) 55%), var(--rs-superficie);
      text-align: start;
    }
    .envios-cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .envios-cabecera ion-icon {
      color: var(--ion-color-primary);
      font-size: 22px;
    }
    h2:not(.rs-seccion) {
      font-family: var(--rs-fuente-titulo);
      font-size: 1.4rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .envios-cabecera p,
    .operacion p {
      margin: 2px 0 0;
      color: var(--rs-tenue);
      font-size: 0.85rem;
      line-height: 1.35;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 16px 0 0;
    }
    dd {
      margin: 0;
      font-family: var(--rs-fuente-titulo);
      font-size: 2.4rem;
      font-weight: 600;
      line-height: 1;
    }
    dl > div:first-child dd {
      color: var(--ion-color-primary);
    }
    dt {
      margin-top: 4px;
      color: var(--rs-tenue);
      font-size: 0.8rem;
    }
    .operaciones {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 12px 16px 28px;
    }
    .operacion {
      margin: 0;
      padding: 16px;
      text-align: start;
    }
    .icono {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      margin-bottom: 14px;
      border-radius: 14px;
      background: rgba(var(--tono), 0.14);
      color: rgb(var(--tono));
      font-size: 24px;
    }
    h3 {
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.25;
    }
  `,
})
export class InicioPage {
  protected readonly sesion = inject(SesionService);
  protected readonly servidor = inject(ServidorService);
  private readonly router = inject(Router);
  private readonly logistica = inject(LogisticaApi);

  /** Lo que hace la bodega en el día a día; lo demás se administra desde la tienda web. */
  protected readonly opciones: Opcion[] = [
    {
      ruta: '/ingreso',
      titulo: 'Ingresar producto',
      detalle: 'Recibir prendas o crear un producto nuevo',
      icono: 'download-outline',
      tono: '61, 220, 151',
    },
    {
      ruta: '/consulta',
      titulo: 'Buscar producto',
      detalle: 'Stock y ubicación de una prenda',
      icono: 'search-outline',
      tono: '255, 194, 46',
    },
    {
      ruta: '/espacios',
      titulo: 'Ubicaciones',
      detalle: 'Racks de la bodega y sus etiquetas QR',
      icono: 'grid-outline',
      tono: '45, 212, 191',
    },
    {
      ruta: '/merma',
      titulo: 'Ingreso de merma',
      detalle: 'Dañado, muestra o cambio',
      icono: 'trash-outline',
      tono: '255, 92, 92',
    },
  ];

  /** `null` mientras los pedidos aún no se han cargado. */
  private readonly pedidos = signal<Pedido[] | null>(null);
  readonly errorEnvios = signal<string | null>(null);

  /** Cantidad de pedidos por enviar, en camino y enviados. */
  readonly resumenEnvios = computed(() => {
    const pedidos = this.pedidos();
    const envios = pedidos && agruparEnvios(pedidos);
    return GRUPOS_DE_ENVIO.map(({ valor, etiqueta }) => ({ etiqueta, cantidad: envios ? envios[valor].length : null }));
  });

  constructor() {
    addIcons({ chevronForward, downloadOutline, gridOutline, logOutOutline, searchOutline, trashOutline });
  }

  /** Ionic lo llama cada vez que se vuelve a la pantalla principal. */
  ionViewWillEnter(): void {
    void this.cargarEnvios();
  }

  async cargarEnvios(): Promise<void> {
    this.errorEnvios.set(null);
    try {
      this.pedidos.set(await firstValueFrom(this.logistica.pedidos()));
    } catch (error) {
      this.errorEnvios.set(mensajeDeError(error));
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.sesion.cerrar();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
