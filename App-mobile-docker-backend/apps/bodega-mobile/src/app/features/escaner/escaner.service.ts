import { Injectable, InjectionToken, inject } from '@angular/core';
import { BarcodeFormat, BarcodeScanner, BarcodeScannerPlugin } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';

export type LectorDeCodigos = Pick<
  BarcodeScannerPlugin,
  | 'isSupported'
  | 'checkPermissions'
  | 'requestPermissions'
  | 'isGoogleBarcodeScannerModuleAvailable'
  | 'installGoogleBarcodeScannerModule'
  | 'scan'
>;

export interface Plataforma {
  esNativa(): boolean;
  nombre(): string;
}

export const LECTOR_DE_CODIGOS = new InjectionToken<LectorDeCodigos>('LectorDeCodigos', {
  providedIn: 'root',
  factory: () => BarcodeScanner,
});

export const PLATAFORMA = new InjectionToken<Plataforma>('Plataforma', {
  providedIn: 'root',
  factory: () => ({
    esNativa: () => Capacitor.isNativePlatform(),
    nombre: () => Capacitor.getPlatform(),
  }),
});

export type ResultadoEscaneo =
  | { estado: 'leido'; codigo: string }
  | { estado: 'cancelado' }
  | { estado: 'no-disponible'; motivo: string };

const FORMATOS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.Code128,
  BarcodeFormat.QrCode,
];

const SIN_CAMARA = 'El escáner no está disponible en este dispositivo. Busca el producto por SKU o nombre.';
const SIN_PERMISO = 'El escáner necesita permiso para usar la cámara. Busca el producto por SKU o nombre.';
const INSTALANDO = 'El lector de códigos se está instalando. Mientras tanto, busca el producto por SKU o nombre.';

/** Lectura de códigos QR y de barras con la cámara del dispositivo. */
@Injectable({ providedIn: 'root' })
export class EscanerService {
  private readonly lector = inject(LECTOR_DE_CODIGOS);
  private readonly plataforma = inject(PLATAFORMA);

  async escanear(): Promise<ResultadoEscaneo> {
    if (!this.plataforma.esNativa()) {
      return { estado: 'no-disponible', motivo: SIN_CAMARA };
    }
    try {
      if (!(await this.lector.isSupported()).supported) {
        return { estado: 'no-disponible', motivo: SIN_CAMARA };
      }
      if (!(await this.tienePermiso())) {
        return { estado: 'no-disponible', motivo: SIN_PERMISO };
      }
      if (this.plataforma.nombre() === 'android' && !(await this.moduloDisponible())) {
        return { estado: 'no-disponible', motivo: INSTALANDO };
      }
    } catch {
      return { estado: 'no-disponible', motivo: SIN_CAMARA };
    }

    try {
      const { barcodes } = await this.lector.scan({ formats: FORMATOS });
      const codigo = barcodes[0]?.rawValue;
      return codigo ? { estado: 'leido', codigo } : { estado: 'cancelado' };
    } catch (error) {
      // El plugin rechaza la promesa cuando el usuario cierra el lector sin leer nada.
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) {
        return { estado: 'cancelado' };
      }
      return { estado: 'no-disponible', motivo: SIN_CAMARA };
    }
  }

  private async tienePermiso(): Promise<boolean> {
    let { camera } = await this.lector.checkPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      ({ camera } = await this.lector.requestPermissions());
    }
    return camera === 'granted' || camera === 'limited';
  }

  /** En Android el lector es un módulo de Google Play que puede requerir instalación. */
  private async moduloDisponible(): Promise<boolean> {
    const { available } = await this.lector.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await this.lector.installGoogleBarcodeScannerModule();
    }
    return available;
  }
}
